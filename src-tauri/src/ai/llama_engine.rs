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
    let tokens = model
        .str_to_token(prompt, AddBos::Always)
        .map_err(|e| format!("Tokenization failed: {}", e))?;
    if tokens.is_empty() {
        return Err("Prompt produced zero tokens".to_string());
    }
    let prompt_len = tokens.len();

    // Prefill batch: evaluate whole prompt; logits needed only on the final token.
    let mut batch = LlamaBatch::new(prompt_len.max(1), 1);
    for (i, token) in tokens.iter().enumerate() {
        let is_last = i == prompt_len - 1;
        batch
            .add(*token, i as i32, &[0], is_last)
            .map_err(|e| format!("Batch add failed: {}", e))?;
    }
    ctx.decode(&mut batch).map_err(|e| format!("Prefill decode failed: {}", e))?;

    // â”€â”€ Sampling chain: temperature -> distribution pick â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let mut sampler = LlamaSampler::chain_simple([
        LlamaSampler::temp(temperature.clamp(0.05, 1.5)),
        LlamaSampler::dist(42), // deterministic-ish seed; quality fine for summaries
    ]);

    // â”€â”€ Incremental generation loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let mut generated_text = String::new();
    let mut generated_count: usize = 0;
    let mut n_cur = prompt_len;

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
        generated_text.push_str(&piece);
        generated_count += 1;

        // Stream the piece to the caller (UI event) before continuing.
        if let Some(sink) = on_token {
            sink(&piece);
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
