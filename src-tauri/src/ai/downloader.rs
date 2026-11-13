//! GGUF model asset downloader.
//! Purpose: Downloads, streams, and verifies SHA-256 integrity for local AI models into the Model Vault.
//! Communication Matrix: Invoked by commands::ai::download_ai_model; interfaces with tauri runtime for download progress events.

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tokio::fs::{self, File};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use crate::logger::Logger;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub model_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f32,
    pub speed_mbps: f32,
    pub is_completed: bool,
    pub error: Option<String>,
    pub attempt: u32,
    pub max_attempts: u32,
}

struct InFlightGuard(String);

pub struct ModelDownloader;

const MAX_RETRIES: u32 = 5;
static IN_FLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn in_flight_registry() -> &'static Mutex<HashSet<String>> {
    IN_FLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

impl InFlightGuard {
    fn register(filename: &str) -> Option<Self> {
        let mut in_flight = in_flight_registry()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        in_flight
            .insert(filename.to_string())
            .then(|| Self(filename.to_string()))
    }
}

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        let mut in_flight = in_flight_registry()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        in_flight.remove(self.0.as_str());
    }
}

impl ModelDownloader {
    pub async fn is_internet_connected() -> bool {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .build();

        let Ok(client) = client else {
            return false;
        };

        if let Ok(resp) = client.head("https://huggingface.co").send().await {
            if resp.status().is_success() || resp.status().is_redirection() {
                return true;
            }
        }

        if let Ok(resp) = client.head("https://1.1.1.1").send().await {
            if resp.status().is_success() || resp.status().is_redirection() {
                return true;
            }
        }

        if let Ok(resp) = client.get("https://www.google.com/generate_204").send().await {
            if resp.status() == reqwest::StatusCode::NO_CONTENT || resp.status().is_success() {
                return true;
            }
        }

        false
    }

    pub async fn download_gguf_model<F>(
        download_url: &str,
        dest_dir: &Path,
        filename: &str,
        expected_sha256: &str,
        progress_callback: F,
    ) -> Result<PathBuf, String>
    where
        F: Fn(DownloadProgress) + Send + Sync + 'static,
    {
        let _in_flight = match InFlightGuard::register(filename) {
            Some(guard) => guard,
            None => return Err(format!("DOWNLOAD_IN_PROGRESS: {filename}")),
        };

        Self::download_gguf_model_inner(
            download_url,
            dest_dir,
            filename,
            expected_sha256,
            progress_callback,
        )
        .await
    }

    async fn download_gguf_model_inner<F>(
        download_url: &str,
        dest_dir: &Path,
        filename: &str,
        expected_sha256: &str,
        progress_callback: F,
    ) -> Result<PathBuf, String>
    where
        F: Fn(DownloadProgress) + Send + Sync + 'static,
    {
        Logger::info(&format!("Checking internet connection before downloading model: {}", filename));
        if !Self::is_internet_connected().await {
            let err_msg = "OFFLINE_NO_INTERNET: No active internet connection detected. Please connect to the internet to download AI model weights.".to_string();
            Logger::warn(&err_msg);
            return Err(err_msg);
        }

        fs::create_dir_all(dest_dir)
            .await
            .map_err(|e| format!("Failed to create Model Vault dir: {}", e))?;

        let target_path = dest_dir.join(filename);
        let part_path = dest_dir.join(format!("{}.part", filename));

        if target_path.exists() {
            Logger::info(&format!("Model file {:?} already exists on disk. Verifying SHA-256 integrity...", target_path));
            if Self::verify_file_sha256(&target_path, expected_sha256).await {
                Logger::info(&format!("SHA-256 verification passed for {:?}", target_path));
                progress_callback(DownloadProgress {
                    model_id: filename.to_string(),
                    downloaded_bytes: 1,
                    total_bytes: 1,
                    percentage: 100.0,
                    speed_mbps: 0.0,
                    is_completed: true,
                    error: None,
                    attempt: 1,
                    max_attempts: MAX_RETRIES,
                });
                return Ok(target_path);
            }
            Logger::warn(&format!("Existing file {:?} failed SHA-256 or is incomplete. Removing before download...", target_path));
            let _ = fs::remove_file(&target_path).await;
        }

        let mut last_error = String::from("Unknown error");

        for attempt in 1..=MAX_RETRIES {
            Logger::info(&format!("Download attempt {}/{} for {}...", attempt, MAX_RETRIES, filename));

            if target_path.exists() && Self::verify_file_sha256(&target_path, expected_sha256).await {
                Logger::info(&format!("Model file appeared mid-retry and verifies - reusing {:?}.", target_path));
                progress_callback(DownloadProgress {
                    model_id: filename.to_string(),
                    downloaded_bytes: 1,
                    total_bytes: 1,
                    percentage: 100.0,
                    speed_mbps: 0.0,
                    is_completed: true,
                    error: None,
                    attempt,
                    max_attempts: MAX_RETRIES,
                });
                return Ok(target_path);
            }

            let client = match reqwest::Client::builder()
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                .connect_timeout(std::time::Duration::from_secs(15))
                .read_timeout(std::time::Duration::from_secs(30))
                .tcp_keepalive(std::time::Duration::from_secs(15))
                .redirect(reqwest::redirect::Policy::limited(10))
                .build()
            {
                Ok(c) => c,
                Err(e) => {
                    last_error = format!("Client build error: {}", e);
                    Logger::error(&last_error);
                    continue;
                }
            };

            let response_result = client.get(download_url).send().await;
            let response = match response_result {
                Ok(resp) if resp.status().is_success() => {
                    Logger::info(&format!("Connected! HTTP Status: {} | Content-Length: {:?}", resp.status(), resp.content_length()));
                    resp
                }
                Ok(resp) => {
                    last_error = format!("HTTP error status: {}", resp.status());
                    Logger::warn(&format!("Attempt {} HTTP status failed: {}", attempt, last_error));
                    tokio::time::sleep(std::time::Duration::from_millis(attempt as u64 * 1500)).await;
                    continue;
                }
                Err(e) => {
                    last_error = format!("Network connection failed: {}", e);
                    Logger::warn(&format!("Attempt {} network error: {}", attempt, last_error));
                    tokio::time::sleep(std::time::Duration::from_millis(attempt as u64 * 1500)).await;
                    continue;
                }
            };

            let total_bytes = response.content_length().unwrap_or(0);
            let mut downloaded_bytes = 0u64;

            let file_result = File::create(&part_path).await;
            let mut file = match file_result {
                Ok(f) => f,
                Err(e) => {
                    last_error = format!("Failed to create part file on disk: {}", e);
                    Logger::error(&last_error);
                    break;
                }
            };

            let mut hasher = Sha256::new();
            let mut stream = response.bytes_stream();
            let start_time = std::time::Instant::now();
            let mut last_emit_time = std::time::Instant::now();
            let mut last_log_time = std::time::Instant::now();
            let mut stream_success = true;

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(chunk) => {
                        hasher.update(&chunk);
                        if let Err(e) = file.write_all(&chunk).await {
                            last_error = format!("Error writing chunk to disk: {}", e);
                            Logger::error(&last_error);
                            stream_success = false;
                            break;
                        }
                        downloaded_bytes += chunk.len() as u64;
                        let elapsed_secs = start_time.elapsed().as_secs_f32().max(0.1);
                        let speed_mbps = ((downloaded_bytes as f32) / (1024.0 * 1024.0)) / elapsed_secs;
                        let percentage = if total_bytes > 0 {
                            ((downloaded_bytes as f32 / total_bytes as f32) * 100.0).min(100.0)
                        } else {
                            0.0
                        };

                        if last_log_time.elapsed().as_secs() >= 5 {
                            Logger::info(&format!(
                                "Streaming {}: {:.1}% ({:.1} MB / {:.1} MB) @ {:.1} MB/s",
                                filename,
                                percentage,
                                downloaded_bytes as f32 / (1024.0 * 1024.0),
                                total_bytes as f32 / (1024.0 * 1024.0),
                                speed_mbps
                            ));
                            last_log_time = std::time::Instant::now();
                        }

                        if last_emit_time.elapsed().as_millis() >= 80 {
                            progress_callback(DownloadProgress {
                                model_id: filename.to_string(),
                                downloaded_bytes,
                                total_bytes,
                                percentage,
                                speed_mbps,
                                is_completed: false,
                                error: None,
                                attempt,
                                max_attempts: MAX_RETRIES,
                            });
                            last_emit_time = std::time::Instant::now();
                        }
                    }
                    Err(e) => {
                        last_error = format!("Stream interrupted: {}", e);
                        Logger::warn(&last_error);
                        stream_success = false;
                        break;
                    }
                }
            }

            if stream_success && downloaded_bytes > 0 {
                if let Err(e) = file.flush().await {
                    last_error = format!("Flush error: {}", e);
                    Logger::error(&last_error);
                    drop(file);
                    let _ = fs::remove_file(&part_path).await;
                    tokio::time::sleep(std::time::Duration::from_millis(attempt as u64 * 1500)).await;
                    continue;
                }
                drop(file);

                let hash_hex = format!("{:x}", hasher.finalize());
                let hash_matches = expected_sha256.is_empty()
                    || hash_hex.eq_ignore_ascii_case(expected_sha256);

                if !hash_matches {
                    last_error = format!(
                        "SHA-256 MISMATCH after download: expected {}, got {}",
                        expected_sha256, hash_hex
                    );
                    Logger::error(&last_error);
                    let _ = fs::remove_file(&part_path).await;
                    continue;
                }

                if let Err(e) = fs::rename(&part_path, &target_path).await {
                    last_error = format!("Failed to finalize model file: {}", e);
                    Logger::error(&last_error);
                    let _ = fs::remove_file(&part_path).await;
                    continue;
                }

                Logger::info(&format!("Download completed + verified for {} on attempt {}/{} ({} bytes)", filename, attempt, MAX_RETRIES, downloaded_bytes));
                progress_callback(DownloadProgress {
                    model_id: filename.to_string(),
                    downloaded_bytes,
                    total_bytes: downloaded_bytes,
                    percentage: 100.0,
                    speed_mbps: 0.0,
                    is_completed: true,
                    error: None,
                    attempt,
                    max_attempts: MAX_RETRIES,
                });
                return Ok(target_path);
            }

            drop(file);
            let _ = fs::remove_file(&part_path).await;
            tokio::time::sleep(std::time::Duration::from_millis(attempt as u64 * 1500)).await;
        }

        let fatal_err = format!(
            "DOWNLOAD_FAILED_AFTER_RETRIES: Failed after {} download attempts for {}. Last error: {}",
            MAX_RETRIES, filename, last_error
        );
        Logger::error(&fatal_err);
        Err(fatal_err)
    }

    pub async fn verify_file_sha256(path: &Path, expected_hash: &str) -> bool {
        if expected_hash.is_empty() {
            return true;
        }

        let mut file = match File::open(path).await {
            Ok(f) => f,
            Err(_) => return false,
        };

        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 1024 * 1024];
        loop {
            match file.read(&mut buffer).await {
                Ok(0) => break,
                Ok(read) => hasher.update(&buffer[..read]),
                Err(_) => return false,
            }
        }

        let hash_hex = format!("{:x}", hasher.finalize());
        hash_hex.eq_ignore_ascii_case(expected_hash)
    }
}
