//! Llama.cpp genuine GGUF token generation backend.
//! Purpose: Executes local SLM token inference using llama-cpp-2 bindings with byte-safe multi-byte UTF-8 streaming.
//! Communication Matrix: Invoked by LocalAIEngine in ai::engine when compiled under the real-inference feature flag.

use crate::ai::engine::{InferenceResponse, TokenSink};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaModel, Special};
use llama_cpp_2::sampling::LlamaSampler;
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};

static LLAMA_BACKEND: OnceLock<Result<LlamaBackend, String>> = OnceLock::new();
static LOADED_MODEL: Mutex<Option<(PathBuf, i64, Arc<LlamaModel>)>> = Mutex::new(None);
static MODEL_LOAD_LOCK: Mutex<()> = Mutex::new(());

fn backend() -> Result<&'static LlamaBackend, String> {
    match LLAMA_BACKEND.get_or_init(|| {
        LlamaBackend::init().map_err(|e| format!("llama.cpp backend init failed: {}", e))
    }) {
        Ok(backend_ref) => Ok(backend_ref),
        Err(err) => Err(err.clone()),
    }
}

fn loaded_model() -> MutexGuard<'static, Option<(PathBuf, i64, Arc<LlamaModel>)>> {
    LOADED_MODEL.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn generate_with_model(
    model_path: &std::path::Path,
    prompt: &str,
    context_len: u32,
    gpu_layers: i64,
    temperature: f32,
    max_new_tokens: usize,
    on_token: Option<&TokenSink>,
) -> Result<InferenceResponse, String> {
    let start_time = std::time::Instant::now();
    let backend = backend()?;

    let needs_reload = {
        let guard = loaded_model();
        match guard.as_ref() {
            Some((cached_path, cached_gpu, _)) => {
                cached_path != model_path || *cached_gpu != gpu_layers
            }
            None => true,
        }
    };

    if needs_reload {
        let _load_gate = MODEL_LOAD_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        let still_needs_reload = {
            let guard = loaded_model();
            match guard.as_ref() {
                Some((cached_path, cached_gpu, _)) => {
                    cached_path != model_path || *cached_gpu != gpu_layers
                }
                None => true,
            }
        };

        if still_needs_reload {
            crate::logger::Logger::info(&format!(
                "Loading GGUF model {:?} (gpu_layers={})...",
                model_path, gpu_layers
            ));
            let model_params = LlamaModelParams::default()
                .with_n_gpu_layers(if gpu_layers < 0 { u32::MAX / 2 } else { gpu_layers as u32 });
            let model = LlamaModel::load_from_file(backend, model_path, &model_params)
                .map_err(|e| format!("Failed to load GGUF model: {}", e))?;
            crate::logger::Logger::info("GGUF model loaded successfully.");
            *loaded_model() = Some((model_path.to_path_buf(), gpu_layers, Arc::new(model)));
        }
    }

    let model = {
        let guard = loaded_model();
        match guard.as_ref() {
            Some((_, _, m)) => m.clone(),
            None => return Err("Model cache invariant violated".to_string()),
        }
    };

    let ctx_size = context_len.min(model.n_ctx_train());
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(ctx_size.max(1)));
    let mut ctx = model
        .new_context(backend, ctx_params)
        .map_err(|e| format!("Failed to create inference context: {}", e))?;

    let mut tokens = model
        .str_to_token(prompt, AddBos::Always)
        .map_err(|e| format!("Tokenization failed: {}", e))?;
    if tokens.is_empty() {
        return Err("Prompt produced zero tokens".to_string());
    }

    let max_prompt_tokens = (ctx_size as usize).saturating_sub(max_new_tokens);
    if max_prompt_tokens < 1 {
        return Err(
            "PROMPT_TOO_LONG: context window cannot fit the reserved generation budget"
                .to_string(),
        );
    }
    if tokens.len() > max_prompt_tokens {
        crate::logger::Logger::warn(&format!(
            "Prompt exceeds context budget ({} > {} tokens); keeping the last {}.",
            tokens.len(),
            max_prompt_tokens,
            max_prompt_tokens
        ));
        let drop_count = tokens.len() - max_prompt_tokens;
        tokens.drain(..drop_count);
    }
    let prompt_len = tokens.len();

    const PREFILL_CHUNK_TOKENS: usize = 512;
    let mut prefill_pos = 0usize;
    while prefill_pos < prompt_len {
        let chunk_end = (prefill_pos + PREFILL_CHUNK_TOKENS).min(prompt_len);
        let is_final_chunk = chunk_end == prompt_len;

        let mut batch = LlamaBatch::new(chunk_end - prefill_pos, 1);
        for (i, token) in tokens[prefill_pos..chunk_end].iter().enumerate() {
            let needs_logits = is_final_chunk && i == chunk_end - prefill_pos - 1;
            batch
                .add(*token, (prefill_pos + i) as i32, &[0], needs_logits)
                .map_err(|e| format!("Batch add failed: {}", e))?;
        }
        ctx.decode(&mut batch)
            .map_err(|e| format!("Prefill decode failed: {}", e))?;
        prefill_pos = chunk_end;
    }

    let seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(42);
    let mut sampler = LlamaSampler::chain_simple([
        LlamaSampler::temp(temperature.clamp(0.05, 1.5)),
        LlamaSampler::dist(seed),
    ]);

    let mut generated_text = String::new();
    let mut generated_count: usize = 0;
    let mut n_cur = prompt_len;
    let mut pending_utf8: Vec<u8> = Vec::new();

    while generated_count < max_new_tokens && n_cur < ctx_size as usize {
        let next_token = sampler.sample(&ctx, -1);
        sampler.accept(next_token);

        if model.is_eog_token(next_token) {
            break;
        }

        let piece_bytes = model
            .token_to_bytes(next_token, Special::Plaintext)
            .map_err(|e| format!("Token decode failed: {}", e))?;
        pending_utf8.extend_from_slice(&piece_bytes);
        generated_count += 1;

        match std::str::from_utf8(&pending_utf8) {
            Ok(valid) => {
                if !valid.is_empty() {
                    generated_text.push_str(valid);
                    if let Some(sink) = on_token {
                        sink(valid);
                    }
                }
                pending_utf8.clear();
            }
            Err(e) => {
                let valid_up_to = e.valid_up_to();
                if valid_up_to > 0 {
                    let valid = std::str::from_utf8(&pending_utf8[..valid_up_to])
                        .map_err(|e| format!("UTF-8 revalidation failed: {}", e))?;
                    generated_text.push_str(valid);
                    if let Some(sink) = on_token {
                        sink(valid);
                    }
                }
                pending_utf8.drain(..valid_up_to);
            }
        }

        let mut step_batch = LlamaBatch::new(1, 1);
        step_batch
            .add(next_token, n_cur as i32, &[0], true)
            .map_err(|e| format!("Continuation batch failed: {}", e))?;
        ctx.decode(&mut step_batch)
            .map_err(|e| format!("Decode failed mid-generation: {}", e))?;
        n_cur += 1;
    }

    if !pending_utf8.is_empty() {
        let tail = String::from_utf8_lossy(&pending_utf8);
        generated_text.push_str(&tail);
        if let Some(sink) = on_token {
            sink(&tail);
        }
    }

    Ok(InferenceResponse {
        generated_text,
        model_used: model_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown.gguf".to_string()),
        total_tokens: generated_count,
        generation_time_ms: start_time.elapsed().as_millis() as u64,
    })
}
