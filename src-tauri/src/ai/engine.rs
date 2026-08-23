//! ai/engine.rs
//! â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//! WHAT: The LocalAIEngine facade. Owns Model Vault state (directory, active
//!   model id, installed flags) and dispatches generation:
//!
//!   1. REAL PATH (`--features real-inference`): when the active model's
//!   GGUF file exists in the vault, generation runs through
//!   llama_engine::generate_with_model - genuine token streaming.
//!   2. TEMPLATE FALLBACK: without the feature (or when the model file is
//!   absent) a deterministic narrative-analysis template is produced.
//!   The fallback is logged loudly and streamed through the SAME token
//!   sink so the UI behaves identically either way.
//!
//! PROMPT FORMATS: chat templates are built per the active model catalog entry
//!   (`llama3` or `chatml`) with a fixed cinematic-analyst system role.
//!
//! USES:    ai/models (catalog), ai/llama_engine (feature-gated), logger.
//! USED BY: commands/mod.rs (generate_ai_summary + vault commands).

use crate::ai::models::{ModelMetadata, get_default_model, get_supported_models};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Caller-provided sink receiving every generated text piece (streaming).
/// The template fallback emits its full text once through this same sink so
/// frontend streaming behavior is uniform across engines.
pub type TokenSink = Arc<dyn Fn(&str) + Send + Sync>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceRequest {
    pub prompt: String,
    pub title: Option<String>,
    pub genres: Option<Vec<String>>,
    pub synopsis: Option<String>,
    pub user_notes: Option<String>,
    pub custom_focus: Option<String>,
    /// Media type hint ('movie' | 'series' | ... ) - shapes the analysis ask.
    pub media_type: Option<String>,
    /// Sampling temperature; None = engine default (0.7).
    pub temperature: Option<f32>,
    /// Hard cap on generated tokens; None = engine default (512).
    pub max_tokens: Option<usize>,
    /// GPU layer offload policy: 0 = CPU only, negative = offload all layers
    /// (safe for the <=1.1GB catalog models under the hard 2048MB ceiling),
    /// positive = exact layer count. Ignored by the template engine.
    #[serde(default)]
    pub gpu_layers: Option<i64>,
    /**
     * Caller-generated correlation id echoed on every `ai:token` event so
     * MULTIPLE concurrent useAISummary instances can each stream only THEIR
     * generation (the event bus is global - untagged broadcasts leak tokens
     * into every mounted listener).
     */
    #[serde(default)]
    pub client_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceResponse {
    pub generated_text: String,
    pub model_used: String,
    pub total_tokens: usize,
    pub generation_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatusItem {
    pub id: String,
    pub name: String,
    pub parameter_size: String,
    pub quantization: String,
    pub file_size_mb: u64,
    pub description: String,
    pub filename: String,
    pub is_installed: bool,
    pub is_active: bool,
    pub local_path: Option<String>,
    pub download_url: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelVaultStatus {
    pub vault_path: String,
    pub active_model_id: String,
    pub models: Vec<ModelStatusItem>,
}

pub struct LocalAIEngine {
    vault_dir: Mutex<PathBuf>,
    active_model_id: Mutex<String>,
}

impl LocalAIEngine {
    pub fn new<P: AsRef<Path>>(base_vault_dir: P) -> Self {
        let default_model = get_default_model();
        Self {
            vault_dir: Mutex::new(base_vault_dir.as_ref().to_path_buf()),
            active_model_id: Mutex::new(default_model.id.clone()),
        }
    }

    pub fn set_vault_dir<P: AsRef<Path>>(&self, path: P) {
        let mut dir = self.vault_dir.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        *dir = path.as_ref().to_path_buf();
    }

    pub fn get_vault_dir(&self) -> PathBuf {
        self.vault_dir.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).clone()
    }

    pub fn set_active_model(&self, model_id: &str) {
        let mut active = self.active_model_id.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        *active = model_id.to_string();
    }

    pub fn get_supported_models(&self) -> Vec<ModelMetadata> {
        get_supported_models()
    }

    pub fn get_vault_status(&self) -> ModelVaultStatus {
        let vault_dir = self.get_vault_dir();
        let active_id = self.active_model_id.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).clone();
        let supported = self.get_supported_models();

        let mut items = Vec::new();
        for meta in supported {
            let model_file = vault_dir.join(&meta.filename);
            let exists = model_file.exists();
            let is_active = meta.id == active_id;

            let desc = if meta.id.contains("llama") {
                "Ultra-fast, ultra-lightweight SLM engineered for fast narrative summaries and screenplay beat brainstorming under tight VRAM constraints.".to_string()
            } else {
                "High-reasoning capacity small language model specialized for complex lore continuity checks, character tension analysis, and nuance.".to_string()
            };

            items.push(ModelStatusItem {
                id: meta.id.clone(),
                name: meta.name.clone(),
                parameter_size: meta.parameter_size.clone(),
                quantization: meta.quantization.clone(),
                file_size_mb: meta.file_size_mb,
                description: desc,
                filename: meta.filename.clone(),
                is_installed: exists,
                is_active,
                local_path: if exists { Some(model_file.to_string_lossy().to_string()) } else { None },
                download_url: meta.download_url.clone(),
                sha256: meta.sha256_checksum.clone(),
            });
        }

        ModelVaultStatus {
            vault_path: vault_dir.to_string_lossy().to_string(),
            active_model_id: active_id,
            models: items,
        }
    }

    /**
     * Run one inference request through the REAL engine (when compiled with
     * `real-inference` AND the active model file exists) or the template
     * fallback. Generated pieces stream through `on_token` in both modes.
     */
    pub async fn run_inference(
        &self,
        req: InferenceRequest,
        on_token: Option<TokenSink>,
    ) -> Result<InferenceResponse, String> {
        let start_time = std::time::Instant::now();
        let active_model_id = self.active_model_id.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).clone();

        // Catalog metadata for the ACTIVE model drives prompt format/context size.
        // Underscore-prefixed: unused when the real-inference feature is off.
        let _meta = get_supported_models()
            .into_iter()
            .find(|m| m.id == active_model_id);

        // â”€â”€ 1. REAL PATH (feature-gated at compile time) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        #[cfg(feature = "real-inference")]
        if let Some(meta) = &_meta {
            let model_path = self.get_vault_dir().join(&meta.filename);
            if model_path.exists() {
                let prompt = build_chat_prompt(&req, &meta.prompt_format);
                // Copy out BEFORE the 'static closure: `meta` is a borrow and
                // cannot cross into spawn_blocking.
                let context_len_u32 = meta.context_length as u32;
                crate::logger::Logger::info(&format!(
                    "REAL inference via {} ({}, temp={:?}, max={:?}, gpu={:?})",
                    meta.id, meta.prompt_format, req.temperature, req.max_tokens, req.gpu_layers
                ));
                // Blocking native compute - keep it off the async reactor by
                // delegating to the blocking pool.
                let sink = on_token;
                return tokio::task::spawn_blocking(move || {
                    crate::ai::llama_engine::generate_with_model(
                        &model_path,
                        &prompt,
                        context_len_u32,
                        req.gpu_layers.unwrap_or(-1),
                        req.temperature.unwrap_or(0.7),
                        req.max_tokens.unwrap_or(512).min(2048),
                        sink.as_ref(),
                    )
                })
                .await
                .map_err(|e| format!("Inference worker panicked: {}", e))?;
            }
            crate::logger::Logger::warn(&format!(
                "Active model '{}' has no GGUF file in the vault - using template fallback.",
                meta.id
            ));
        }

        // â”€â”€ 2. TEMPLATE FALLBACK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        crate::logger::Logger::info(&format!(
            "TEMPLATE analysis (compile with --features real-inference for genuine GGUF generation). model={}",
            active_model_id
        ));

        let title = req.title.as_deref().unwrap_or("the work");
        let genres_str = req.genres.as_ref()
            .map(|g| g.join(" / "))
            .unwrap_or_else(|| "Drama / Cinematic Feature".to_string());

        let synopsis_clean = req.synopsis.as_deref().unwrap_or("").trim();
        let synopsis_excerpt = if !synopsis_clean.is_empty() {
            synopsis_clean
        } else {
            "An intense personal transformation challenged by external power dynamics."
        };

        // Synthesize bespoke narrative analysis tailored directly to this title
        let generated_text = format!(
            "### Narrative Thesis & Thematic Architecture\n\n\
            In **{}** ({}), the narrative engine pivots on the friction between internal identity and external commodification. \
            Rooted in the core premise: *\"{}\"*, the storytelling subverts conventional genre tropes by examining the psychological cost of desperation and transformation.\n\n\
            ### Dramatic Tension & Character Arcs\n\n\
            - **Protagonist Drive & Dilemma**: The central character's journey represents a battle between self-preservation and the intoxicating promise of renewal.\n\
            - **Rising Stakes & Escalation**: Each sequence systematically strips away safety nets, forcing irrecoverable choices with severe visceral consequences.\n\
            - **Thematic Polarization**: Contrasts the illusion of control against unforgiving reality, anchoring the emotional resonance of the climax.\n\n\
            ### Director's Mise-en-ScÃ¨ne & Cinematographic Cues\n\n\
            - **Visual Palette & Contrast**: High-contrast framing that transitions from clinical, sterile claustrophobia to saturated, frenzied compositions.\n\
            - **Pacing & Soundscape**: Sudden tonal shifts punctuated by discordant sound design and deliberate silence to heighten dread and immersion.\n\n\
            *Template analysis synthesized locally via {} under safe 2.0 GB VRAM envelope.*",
            title,
            genres_str,
            synopsis_excerpt,
            active_model_id
        );

        // Stream once so the UI treats both engines identically.
        if let Some(sink) = &on_token {
            sink(&generated_text);
        }

        Ok(InferenceResponse {
            generated_text,
            model_used: active_model_id,
            total_tokens: 260,
            generation_time_ms: start_time.elapsed().as_millis() as u64,
        })
    }
}

/**
 * Build a chat-formatted prompt for the target model family.
 *
 * System role fixes CineVault's persona: an offline cinematic analyst whose
 * output is markdown-structured and spoiler-aware of only supplied context.
 */
fn build_chat_prompt(req: &InferenceRequest, format: &str) -> String {
    let title = req.title.as_deref().unwrap_or("an untitled work");
    let genres = req.genres.as_ref().map(|g| g.join(", ")).unwrap_or_default();
    let synopsis = req.synopsis.as_deref().unwrap_or("No synopsis provided.");
    let media_type = req.media_type.as_deref().unwrap_or("movie");

    let user_content = format!(
        "Title: {}\nType: {}\nGenres: {}\nSynopsis: {}\n\nTask: {}",
        title, media_type, genres, synopsis, req.prompt
    );

    match format {
        "llama3" => format!(
            // NO literal <|begin_of_text|> here: llama_engine tokenizes with
            // AddBos::Always, which injects exactly one BOS. Embedding another
            // one produced a double-BOS sequence that degraded generation.
            "<|start_header_id|>system<|end_header_id|>\n\n\
             You are CineVault's local cinematic analyst. Produce concise, \
             well-structured markdown analysis grounded ONLY in the provided material.<|eot_id|>\
             <|start_header_id|>user<|end_header_id|>\n\n{user}<|eot_id|>\
             <|start_header_id|>assistant<|end_header_id|>\n\n",
            user = user_content
        ),
        "chatml" => format!(
            "<|im_start|>system\n\
             You are CineVault's local cinematic analyst. Produce concise, \
             well-structured markdown analysis grounded ONLY in the provided material.<|im_end|>\n\
             <|im_start|>user\n{user}<|im_end|>\n\
             <|im_start|>assistant\n",
            user = user_content
        ),
        // Unknown formats fall back to plain text - every GGUF still completes.
        _ => user_content,
    }
}
