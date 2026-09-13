//! Auto-updater and window control IPC commands.
//! Purpose: Handles binary setup wizard download with mandatory SHA-256 verification, CDN redirect validation, and native window chrome.
//! Communication Matrix: Invoked by frontend api.downloadAndInstallUpdate() and window controls; interfaces with tauri runtime.

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const ALLOWED_UPDATE_HOSTS: [&str; 3] = [
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];

const ALLOWED_UPDATE_PATH_PREFIX: &str = "/ghostbat101/cinevault/releases/download/";

fn is_allowed_update_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    if ALLOWED_UPDATE_HOSTS.iter().any(|&h| h == host) {
        return true;
    }
    if host.starts_with("github-production-release-asset-")
        && (host.ends_with(".s3.amazonaws.com") || (host.contains(".s3.") && host.ends_with(".amazonaws.com")))
    {
        return true;
    }
    false
}

fn sanitize_installer_filename(filename: &str) -> Option<String> {
    let cleaned: String = filename
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .collect();
    if cleaned.is_empty() || cleaned.starts_with('.') {
        return None;
    }
    Some(cleaned)
}

fn validate_installer_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|_| "Invalid installer URL".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Installer download must use HTTPS".to_string());
    }
    let host = parsed.host_str().unwrap_or_default().to_lowercase();
    if !is_allowed_update_host(&host) {
        return Err(format!("Installer host '{}' is not an allowed update source", host));
    }
    let path = parsed.path().to_lowercase();
    if !path.starts_with(ALLOWED_UPDATE_PATH_PREFIX) {
        return Err(
            "Installer URL must point at GhostBat101/CineVault's official release download path"
                .to_string(),
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn download_and_install_update(
    installer_url: String,
    filename: String,
    expected_sha256: Option<String>,
    app_handle: AppHandle,
) -> Result<bool, String> {
    validate_installer_url(&installer_url)?;

    let safe_filename = sanitize_installer_filename(&filename)
        .ok_or_else(|| "Invalid installer filename".to_string())?;
    let safe_filename = if safe_filename.ends_with(".exe") {
        safe_filename
    } else {
        format!("{}.exe", safe_filename)
    };

    crate::logger::Logger::info(&format!("Starting download of update installer from {}", installer_url));

    let temp_dir = std::env::temp_dir();
    let target_path = temp_dir.join(&safe_filename);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .connect_timeout(std::time::Duration::from_secs(15))
        .tcp_keepalive(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&installer_url).send().await
        .map_err(|e| format!("Failed to initiate installer download: {}", e))?;

    if let Some(final_host) = response.url().host_str() {
        if !is_allowed_update_host(final_host) {
            return Err(format!("Redirected to non-allow-listed host '{}'", final_host));
        }
    }

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&target_path).await
        .map_err(|e| format!("Failed to create destination file: {}", e))?;

    let mut downloaded_bytes = 0u64;
    let mut stream = response.bytes_stream();
    let start_time = std::time::Instant::now();
    let mut last_emit_time = std::time::Instant::now();
    let mut hasher = Sha256::new();

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                hasher.update(&chunk);
                file.write_all(&chunk).await.map_err(|e| format!("Disk write error: {}", e))?;
                downloaded_bytes += chunk.len() as u64;
                let elapsed = start_time.elapsed().as_secs_f32().max(0.1);
                let speed_mbps = ((downloaded_bytes as f32) / (1024.0 * 1024.0)) / elapsed;
                let percentage = if total_bytes > 0 {
                    ((downloaded_bytes as f32 / total_bytes as f32) * 100.0).min(100.0)
                } else {
                    0.0
                };

                if last_emit_time.elapsed().as_millis() >= 80 {
                    let _ = app_handle.emit("app_update_progress", serde_json::json!({
                        "downloadedBytes": downloaded_bytes,
                        "totalBytes": total_bytes,
                        "percentage": percentage,
                        "speedMbps": speed_mbps,
                        "isCompleted": false
                    }));
                    last_emit_time = std::time::Instant::now();
                }
            }
            Err(e) => return Err(format!("Download interrupted: {}", e)),
        }
    }

    file.flush().await.map_err(|e| format!("Flush error: {}", e))?;

    let expected = match expected_sha256.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
        Some(digest) => digest.trim_start_matches("sha256:").to_ascii_lowercase(),
        None => {
            let _ = tokio::fs::remove_file(&target_path).await;
            return Err("UPDATE_CHECKSUM_MISSING: Expected SHA-256 verification checksum was not provided".to_string());
        }
    };

    if expected.len() != 64 || !expected.chars().all(|c| c.is_ascii_hexdigit()) {
        let _ = tokio::fs::remove_file(&target_path).await;
        return Err(format!(
            "UPDATE_CHECKSUM_INVALID: Provided checksum '{}' is not a valid 64-character SHA-256 hex string",
            expected
        ));
    }

    let actual = format!("{:x}", hasher.finalize());
    if !actual.eq_ignore_ascii_case(&expected) {
        let _ = tokio::fs::remove_file(&target_path).await;
        return Err(format!(
            "UPDATE_CHECKSUM_MISMATCH: expected {} got {}",
            expected, actual
        ));
    }
    crate::logger::Logger::info("Update installer SHA-256 verification passed.");

    let _ = app_handle.emit("app_update_progress", serde_json::json!({
        "downloadedBytes": downloaded_bytes,
        "totalBytes": total_bytes,
        "percentage": 100.0,
        "speedMbps": 0.0,
        "isCompleted": true
    }));

    crate::logger::Logger::info(&format!("Installer downloaded to {:?}. Spawning setup wizard...", target_path));

    std::process::Command::new(&target_path)
        .spawn()
        .map_err(|e| format!("Failed to launch installer: {}", e))?;

    app_handle.exit(0);
    Ok(true)
}

#[tauri::command]
pub fn app_minimize(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = tauri::Manager::get_webview_window(&app_handle, "main") {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn app_maximize(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = tauri::Manager::get_webview_window(&app_handle, "main") {
        if window.is_maximized().unwrap_or(false) {
            window.unmaximize().map_err(|e| e.to_string())?;
        } else {
            window.maximize().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn app_close(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = tauri::Manager::get_webview_window(&app_handle, "main") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
