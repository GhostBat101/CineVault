//! ai/llama_engine.rs
//! â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//! WHAT: Genuine GGUF token generation using llama.cpp bindings (crate
//!   `llama-cpp-2`). COMPILED ONLY under `--features real-inference`;
//!   without that feature this entire module does not exist and
//!   [`super::engine::LocalAIEngine`] falls back to template analysis.
//!
//! DESIGN:
//!   - The llama.cpp backend is a process-global singleton (`OnceLock`).
//!   - Loaded models are CACHED by absolute path (first generation pays model
//!   load cost ~seconds; subsequent calls reuse weights).
//!   - GPU offload: request.gpuLayers drives LlamaModelParams; 0 = CPU-only,
//!   negative = offload everything safe for our <2GB VRAM budget.
//!   - Generation loop: prompt batch decode -> incremental single-token
//!   batches, invoking the caller's token sink per piece so the UI can
//!   stream output live via the `ai:token` event.
//!
//! API-DRIFT NOTE: llama-cpp-2 tracks upstream llama.cpp closely. This file
//! targets the 0.1 series (chain_simple sampler + token_to_str + is_eog_token).
//! If a future bump renames these, the compiler will point at exactly this one
//! small function (`generate_tokens`) - adjust there only.
//!
//! BUILD PREREQUISITES: C/C++ toolchain + cmake (llama.cpp compiles from
//! source). CUDA/Vulkan require extra sys-crate features; default build is CPU.
//!
//! USES:    llama-cpp-2, super::engine::{InferenceRequest, InferenceResponse}.
//! USED BY: super::engine (dispatch when the feature is enabled).

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

/// Process-global llama.cpp runtime. Must be initialized exactly once.
static LLAMA_BACKEND: OnceLock<Result<LlamaBackend, String>> = OnceLock::new();

/// Cache of the currently loaded model, keyed by absolute path.
/// Loading a multi-hundred-MB model takes seconds - reuse across requests.
static LOADED_MODEL: Mutex<Option<(PathBuf, i64, Arc<LlamaModel>)>> = Mutex::new(None);

/**
 * Serializes the model check+load critical section. Without it, two
 * concurrent first calls could each observe an empty cache and start
 * DUPLICATE 1-2GB loads. Acquire before checking `LOADED_MODEL` for reload,
 * then double-check inside the gate.
 */
static MODEL_LOAD_LOCK: Mutex<()> = Mutex::new(());

/// Access (or lazily initialize) the global backend.
fn backend() -> Result<&'static LlamaBackend, String> {
    match LLAMA_BACKEND.get_or_init(|| {
        LlamaBackend::init().map_err(|e| format!("llama.cpp backend init failed: {}", e))
    }) {
        Ok(backend_ref) => Ok(backend_ref),
        Err(err) => Err(err.clone()),
    }
}

/// Borrow the model cache, tolerating a poisoned mutex.
fn loaded_model() -> MutexGuard<'static, Option<(PathBuf, i64, Arc<LlamaModel>)>> {
    LOADED_MODEL.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/**
 * Generate text with the REAL model at `model_path`.
 *
 * Returns the full response (also streamed piece-by-piece through
 * `on_token` when provided). Any load/inference failure propagates as Err -
 * callers must NOT silently fall back to templates after a verified download.
 *
 * * `gpu_layers` - 0 = CPU only; any negative = offload all layers (safe here:
 *   catalog models are <=1.1GB Q4_K_M, inside the hard 2048MB VRAM ceiling);
 *   positive = exact layer count.
 */
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

    // â”€â”€ Model load (cached across requests) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        // Hold the dedicated load gate around check+load; double-check AFTER
        // acquiring in case another thread landed the identical model while
        // we waited.
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
                // Negative counts mean "all layers" in llama.cpp; clamp to u32 max.
                .with_n_gpu_layers(if gpu_layers < 0 { u32::MAX / 2 } else { gpu_layers as u32 });
            // load_from_file takes a backend reference as proof-of-init (0.1.154 API).
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

    // â”€â”€ Context creation (cheap; per-request) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Context size rides inside the params struct (positional n_ctx removed
    // in the 0.1 series).
    let ctx_size = context_len.min(model.n_ctx_train());
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(ctx_size.max(1)));
    let mut ctx = model
        .new_context(backend, ctx_params)
        .map_err(|e| format!("Failed to create inference context: {}", e))?;

    // â”€â”€ Tokenize prompt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let mut tokens = model
        .str_to_token(prompt, AddBos::Always)
        .map_err(|e| format!("Tokenization failed: {}", e))?;
    if tokens.is_empty() {
        return Err("Prompt produced zero tokens".to_string());
    }

    // Reserve head-room for the generation window: an over-long prompt is
    // truncated to its LAST `ctx_size - max_new_tokens` tokens (the tail of
    // the prompt carries the immediate ask) so prompt + generation always
    // fits the context. llama.cpp hard-fails a decode that exceeds n_ctx.
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

    // Prefill decode in bounded slices of <=512 tokens: llama.cpp requires
    // bounded batches, and very long prompts previously blew past internal
    // batch limits. Logits are requested ONLY on the final chunk's final
    // token so sampling sees exactly the last prompt position.
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

    // â”€â”€ Sampling chain: temperature -> distribution pick â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Seed entropy: the previous constant (42) made every run of the same
    // prompt produce byte-identical text; derive the seed from wall-clock
    // sub-second nanos instead. Falls back to the old constant only if the
    // clock is somehow before the epoch.
    let seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(42);
    let mut sampler = LlamaSampler::chain_simple([
        LlamaSampler::temp(temperature.clamp(0.05, 1.5)),
        LlamaSampler::dist(seed), // time-derived per-request entropy
    ]);

    // â”€â”€ Incremental generation loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let mut generated_text = String::new();
    let mut generated_count: usize = 0;
    let mut n_cur = prompt_len;
    // Pending UTF-8 bytes: a token piece can SPLIT a multi-byte character
    // across stream ticks; pushing raw per-token strings previously aborted
    // generation on split emoji/quotes. Bytes accumulate here and only the
    // longest VALID UTF-8 prefix is emitted; the undecoded tail is carried.
    let mut pending_utf8: Vec<u8> = Vec::new();

    while generated_count < max_new_tokens && n_cur < ctx_size as usize {
        let next_token = sampler.sample(&ctx, -1);
        sampler.accept(next_token);

        if model.is_eog_token(next_token) {
            break;
        }

        let piece = model
            // Plaintext = do NOT render special tokens into the output stream
            // (variant set is {Tokenize, Plaintext} on llama-cpp-2 0.1.154;
            // method itself is deprecated in favor of token_to_piece+Decoder,
            // accepted here as a warning until that migration).
            .token_to_str(next_token, Special::Plaintext)
            .map_err(|e| format!("Token decode failed: {}", e))?;
        pending_utf8.extend_from_slice(piece.as_bytes());
        generated_count += 1;

        // Emit only the valid UTF-8 prefix of the buffer (O(tail), not O(n^2)
        // over the whole response).
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
                    // Guaranteed-valid prefix per Utf8Error::valid_up_to().
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

        // Single-token continuation batch.
        let mut step_batch = LlamaBatch::new(1, 1);
        step_batch
            .add(next_token, n_cur as i32, &[0], true)
            .map_err(|e| format!("Continuation batch failed: {}", e))?;
        ctx.decode(&mut step_batch)
            .map_err(|e| format!("Decode failed mid-generation: {}", e))?;
        n_cur += 1;
    }

    // Flush the remaining tail: an incomplete sequence at loop end can never
    // complete, so lossy conversion is correct here.
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
