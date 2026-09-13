//! AI narrative engine and model vault IPC commands.
//! Purpose: Handles model downloads, vault inventory inspection, custom GGUF imports, and local SLM inference invocation.
//! Communication Matrix: Invoked by frontend api.ts and hooks; interfaces with ai::engine, ai::downloader, db::repository, and telemetry::hardware.

use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncReadExt;
use crate::ai::downloader::ModelDownloader;
use crate::ai::engine::{
    InferenceRequest, InferenceResponse, LocalAIEngine, ModelStatusItem, ModelVaultStatus,
};
use crate::ai::models::ModelMetadata;
use crate::db::repository::Repository;
use crate::telemetry::hardware::HardwareMonitor;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CustomModelEntry {
    pub id: String,
    pub name: String,
    pub filename: String,
    #[serde(default = "default_custom_context_length")]
    pub context_length: u32,
    #[serde(default = "default_custom_prompt_format")]
    pub prompt_format: String,
}

fn default_custom_context_length() -> u32 {
    4096
}

fn default_custom_prompt_format() -> String {
    "chatml".to_string()
}

async fn load_stored_settings(
    repo: &State<'_, std::sync::Arc<Repository>>,
) -> Option<serde_json::Value> {
    let repo_handle = std::sync::Arc::clone(repo.inner());
    let raw = tauri::async_runtime::spawn_blocking(move || {
        repo_handle.get_app_settings_json().ok().flatten()
    })
    .await
    .ok()
    .flatten()?;

    serde_json::from_str::<serde_json::Value>(&raw).ok()
}

async fn hydrate_custom_models(
    repo: &State<'_, std::sync::Arc<Repository>>,
    engine: &State<'_, LocalAIEngine>,
) {
    let entries: Vec<CustomModelEntry> = load_stored_settings(repo)
        .await
        .and_then(|settings| settings.get("customModels").cloned())
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default();

    let vault_dir = engine.get_vault_dir();
    let mut metas = Vec::with_capacity(entries.len());
    for entry in entries {
        let file_size_mb = tokio::fs::metadata(vault_dir.join(&entry.filename))
            .await
            .map(|meta| meta.len() / (1024 * 1024))
            .unwrap_or(0);
        metas.push(ModelMetadata {
            id: entry.id.clone(),
            name: entry.name.clone(),
            parameter_size: "Unknown".to_string(),
            quantization: "GGUF".to_string(),
            file_size_mb,
            download_url: String::new(),
            filename: entry.filename.clone(),
            sha256_checksum: String::new(),
            context_length: entry.context_length as usize,
            prompt_format: entry.prompt_format.clone(),
        });
    }

    engine.set_custom_models(metas);
}

#[tauri::command]
pub async fn generate_ai_summary(
    mut request: InferenceRequest,
    engine: State<'_, LocalAIEngine>,
    repo: State<'_, std::sync::Arc<Repository>>,
    monitor: State<'_, HardwareMonitor>,
    app_handle: AppHandle,
) -> Result<InferenceResponse, String> {
    crate::logger::Logger::info(&format!("Generating AI Summary for prompt: {:.60}...", request.prompt));

    hydrate_custom_models(&repo, &engine).await;

    if request.gpu_layers.is_none() {
        let active_model_mb = engine
            .get_vault_status()
            .models
            .iter()
            .find(|m| m.is_active)
            .map(|m| m.file_size_mb)
            .unwrap_or(1500);
        let telemetry = monitor.sample_telemetry(false, active_model_mb);
        request.gpu_layers = Some(telemetry.gpu_layers_offloaded as i64);
    }

    if let Some(settings) = load_stored_settings(&repo).await {
        if request.temperature.is_none() {
            request.temperature = settings
                .get("temperature")
                .and_then(|t| t.as_f64())
                .map(|t| t as f32);
        }
        match settings.get("inferenceMode").and_then(|mode| mode.as_str()) {
            Some("cpu_only") => request.gpu_layers = Some(0),
            _ => {
                if let Some(user_layers) =
                    settings.get("gpuLayers").and_then(|layers| layers.as_i64())
                {
                    request.gpu_layers = Some(user_layers);
                }
            }
        }
    }

    let status = engine.get_vault_status();
    let active_item = status.models.iter().find(|m| m.is_active);

    if let Some(item) = active_item {
        if !item.is_installed {
            crate::logger::Logger::warn(&format!("Active model '{}' is not installed. Initiating resilient first-use auto-download...", item.id));

            if !ModelDownloader::is_internet_connected().await {
                let err_msg = "OFFLINE_NO_INTERNET: Cannot initialize local AI model without an internet connection. Please connect to download Llama 3.2 1B (808 MB) or import a local .GGUF in the Model Vault.".to_string();
                crate::logger::Logger::warn(&err_msg);
                return Err(err_msg);
            }

            let vault_dir = engine.get_vault_dir();
            let handle = app_handle.clone();
            let filename = item.filename.clone();
            let download_url = item.download_url.clone();
            let sha256 = item.sha256.clone();

            ModelDownloader::download_gguf_model(
                &download_url,
                &vault_dir,
                &filename,
                &sha256,
                move |progress| {
                    let _ = handle.emit("model_download_progress", progress);
                },
            ).await?;
        }
    }

    let sink_handle = app_handle.clone();
    let client_tag = request.client_id.clone().unwrap_or_default();
    let token_sink: crate::ai::engine::TokenSink =
        std::sync::Arc::new(move |piece: &str| {
            let _ = sink_handle.emit(
                "ai:token",
                serde_json::json!({ "clientId": client_tag, "piece": piece }),
            );
        });

    engine.run_inference(request, Some(token_sink)).await
}

#[tauri::command]
pub async fn get_model_vault_status(
    engine: State<'_, LocalAIEngine>,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<ModelVaultStatus, String> {
    hydrate_custom_models(&repo, &engine).await;
    Ok(engine.get_vault_status())
}

#[tauri::command]
pub async fn set_active_ai_model(
    model_id: String,
    engine: State<'_, LocalAIEngine>,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<bool, String> {
    hydrate_custom_models(&repo, &engine).await;
    if !engine.is_known_model(&model_id) {
        return Err(format!("Unknown model ID: {}", model_id));
    }
    engine.set_active_model(&model_id);
    Ok(true)
}

#[tauri::command]
pub async fn download_ai_model(
    model_id: String,
    engine: State<'_, LocalAIEngine>,
    repo: State<'_, std::sync::Arc<Repository>>,
    app_handle: AppHandle,
) -> Result<String, String> {
    hydrate_custom_models(&repo, &engine).await;

    let supported = engine.get_supported_models();
    let meta = supported.into_iter().find(|m| m.id == model_id)
        .ok_or_else(|| format!("Unknown model ID: {}", model_id))?;

    let vault_dir = engine.get_vault_dir();
    let handle = app_handle.clone();

    let target = ModelDownloader::download_gguf_model(
        &meta.download_url,
        &vault_dir,
        &meta.filename,
        &meta.sha256_checksum,
        move |progress| {
            let _ = handle.emit("model_download_progress", progress);
        },
    ).await?;

    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn import_custom_model(
    source_path: String,
    display_name: String,
    engine: State<'_, LocalAIEngine>,
    repo: State<'_, std::sync::Arc<Repository>>,
) -> Result<ModelStatusItem, String> {
    const GGUF_MAGIC: [u8; 4] = [0x47, 0x47, 0x55, 0x46];
    let mut source = tokio::fs::File::open(&source_path)
        .await
        .map_err(|e| format!("Cannot open source file: {}", e))?;
    let mut magic = [0u8; 4];
    source
        .read_exact(&mut magic)
        .await
        .map_err(|e| format!("File too small to be a GGUF model: {}", e))?;
    drop(source);
    if magic != GGUF_MAGIC {
        return Err(format!(
            "NOT_A_GGUF_FILE: '{}' lacks the GGUF magic header",
            display_name.trim()
        ));
    }

    let source_extension = std::path::Path::new(&source_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| format!(".{}", ext.to_ascii_lowercase()))
        .unwrap_or_else(|| ".gguf".to_string());
    let sanitized_base: String = display_name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .collect();
    let trimmed_base = sanitized_base.trim_matches('.').to_string();
    let base = if trimmed_base.is_empty() {
        "custom-model".to_string()
    } else {
        trimmed_base
    };

    let vault_dir = engine.get_vault_dir();
    tokio::fs::create_dir_all(&vault_dir)
        .await
        .map_err(|e| format!("Failed to create Model Vault dir: {}", e))?;

    let mut candidate_filename = format!("{}{}", base, source_extension);
    let mut suffix = 2u32;
    while vault_dir.join(&candidate_filename).exists() {
        candidate_filename = format!("{}_{}{}", base, suffix, source_extension);
        suffix += 1;
    }

    let target_path = vault_dir.join(&candidate_filename);
    tokio::fs::copy(&source_path, &target_path)
        .await
        .map_err(|e| format!("Failed to copy model into the Model Vault: {}", e))?;

    let entry = CustomModelEntry {
        id: format!("custom_{}", uuid::Uuid::new_v4()),
        name: if display_name.trim().is_empty() {
            base.clone()
        } else {
            display_name.trim().to_string()
        },
        filename: candidate_filename.clone(),
        context_length: default_custom_context_length(),
        prompt_format: default_custom_prompt_format(),
    };

    let repo_handle = std::sync::Arc::clone(repo.inner());
    let entry_for_save = entry.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let mut list: Vec<CustomModelEntry> = repo_handle
            .get_app_settings_json()
            .ok()
            .flatten()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .and_then(|settings| settings.get("customModels").cloned())
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default();
        list.retain(|existing| existing.id != entry_for_save.id);
        list.push(entry_for_save);

        let patch = serde_json::json!({ "customModels": list });
        let serialized =
            serde_json::to_string(&patch).map_err(|e| format!("Custom model payload not serializable: {}", e))?;
        repo_handle
            .save_app_settings_json(&serialized)
            .map_err(|e| format!("Failed to persist custom model metadata: {}", e))
    })
    .await
    .map_err(|e| format!("Database worker failed: {}", e))??;

    crate::logger::Logger::info(&format!(
        "Imported custom model '{}' as {} ({})",
        entry.name, entry.id, candidate_filename
    ));

    hydrate_custom_models(&repo, &engine).await;
    engine
        .get_vault_status()
        .models
        .into_iter()
        .find(|item| item.id == entry.id)
        .ok_or_else(|| format!("Imported model '{}' missing from catalog after hydration", entry.id))
}
