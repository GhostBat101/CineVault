//! Llama.cpp genuine GGUF token generation backend.
//! Purpose: Executes local SLM token inference using llama-cpp-2 bindings with byte-safe multi-byte UTF-8 streaming.
//! Communication Matrix: Invoked by LocalAIEngine in ai::engine when compiled under the real-inference feature flag; logs via crate::logger::Logger.

use crate::ai::engine::{InferenceResponse, TokenSink};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::sampling::LlamaSampler;
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

const PREFILL_CHUNK_TOKENS: usize = 512;
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

fn cached_model(model_path: &Path, gpu_layers: i64) -> Option<Arc<LlamaModel>> {
    let guard = LOADED_MODEL
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    match guard.as_ref() {
        Some((cached_path, cached_gpu, model))
            if cached_path == model_path && *cached_gpu == gpu_layers =>
        {
            Some(model.clone())
        }
        _ => None,
    }
}

fn load_or_get_model(
    backend: &LlamaBackend,
    model_path: &Path,
    gpu_layers: i64,
) -> Result<Arc<LlamaModel>, String> {
    if let Some(model) = cached_model(model_path, gpu_layers) {
        return Ok(model);
    }

    let _load_gate = MODEL_LOAD_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    if let Some(model) = cached_model(model_path, gpu_layers) {
        return Ok(model);
    }

    crate::logger::Logger::info(&format!(
        "Loading GGUF model {:?} (gpu_layers={})...",
        model_path, gpu_layers
    ));
    let model_params = LlamaModelParams::default().with_n_gpu_layers(if gpu_layers < 0 {
        u32::MAX / 2
    } else {
        gpu_layers as u32
    });
    let model = Arc::new(
        LlamaModel::load_from_file(backend, model_path, &model_params)
            .map_err(|e| format!("Failed to load GGUF model: {}", e))?,
    );
    crate::logger::Logger::info("GGUF model loaded successfully.");

    let mut guard = LOADED_MODEL
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = Some((model_path.to_path_buf(), gpu_layers, model.clone()));
    Ok(model)
}

fn emit_chunk(text: &str, generated_text: &mut String, on_token: Option<&TokenSink>) {
    if text.is_empty() {
        return;
    }
    generated_text.push_str(text);
    if let Some(sink) = on_token {
        sink(text);
    }
}

pub fn generate_with_model(
    model_path: &Path,
    prompt: &str,
    context_len: u32,
    gpu_layers: i64,
    temperature: f32,
    max_new_tokens: usize,
    on_token: Option<&TokenSink>,
) -> Result<InferenceResponse, String> {
    let start_time = std::time::Instant::now();
    let backend = backend()?;
    let model = load_or_get_model(backend, model_path, gpu_layers)?;

    let ctx_size = context_len.min(model.n_ctx_train());
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(ctx_size.max(1)));
    let mut ctx = model
        .new_context(backend, ctx_params)
        .map_err(|e| format!("Failed to create inference context: {}", e))?;

    let vocab = model.vocab();
    let mut tokens = vocab.tokenize(prompt.as_bytes(), true, true);
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
    let mut pending_utf8: Vec<u8> = Vec::with_capacity(64);
    let mut step_batch = LlamaBatch::new(1, 1);

    while generated_count < max_new_tokens && n_cur < ctx_size as usize {
        let next_token = sampler.sample(&ctx, -1);
        sampler.accept(next_token);

        if vocab.is_eog(next_token) {
            break;
        }

        vocab.token_to_piece_into(next_token, &mut pending_utf8, false, None);
        generated_count += 1;

        match std::str::from_utf8(&pending_utf8) {
            Ok(valid) => {
                emit_chunk(valid, &mut generated_text, on_token);
                pending_utf8.clear();
            }
            Err(e) => {
                let valid_up_to = e.valid_up_to();
                if valid_up_to > 0 {
                    let valid = std::str::from_utf8(&pending_utf8[..valid_up_to])
                        .map_err(|err| format!("UTF-8 revalidation failed: {}", err))?;
                    emit_chunk(valid, &mut generated_text, on_token);
                }
                let advance = match e.error_len() {
                    Some(bad_len) => {
                        emit_chunk("\u{FFFD}", &mut generated_text, on_token);
                        valid_up_to + bad_len
                    }
                    None => valid_up_to,
                };
                pending_utf8.drain(..advance);
            }
        }

        if generated_count >= max_new_tokens || n_cur + 1 >= ctx_size as usize {
            break;
        }

        step_batch.clear();
        step_batch
            .add(next_token, n_cur as i32, &[0], true)
            .map_err(|e| format!("Continuation batch failed: {}", e))?;
        ctx.decode(&mut step_batch)
            .map_err(|e| format!("Decode failed mid-generation: {}", e))?;
        n_cur += 1;
    }

    if !pending_utf8.is_empty() {
        let tail = String::from_utf8_lossy(&pending_utf8);
        emit_chunk(&tail, &mut generated_text, on_token);
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
