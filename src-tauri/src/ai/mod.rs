//! ai/mod.rs
//! ─────────────────────────────────────────────────────────────
//! WHAT: AI subsystem root. Wires together the model catalog, prompt builders,
//!       the GGUF downloader, and the inference engine.
//!
//! MODULES:
//!   models      - curated GGUF catalog metadata (Llama 3.2 1B / Qwen 2.5 1.5B).
//!   prompts     - (legacy) prompt text builders.
//!   downloader  - resilient SHA-verified model downloader.
//!   engine      - LocalAIEngine facade: dispatches real vs template inference
//!                 and owns vault/active-model state.
//!   llama_engine- REAL token generation via llama-cpp-2. Only compiled when
//!                 the `real-inference` feature is enabled; without it the
//!                 crate stays dependency-free and compiles everywhere.

pub mod models;
pub mod prompts;
pub mod downloader;
pub mod engine;

/// Genuine llama.cpp-backed generation (feature-gated: `--features real-inference`).
#[cfg(feature = "real-inference")]
pub mod llama_engine;

pub use models::*;
pub use prompts::*;
pub use downloader::*;
pub use engine::*;
