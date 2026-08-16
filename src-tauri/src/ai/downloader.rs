use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;
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

pub struct ModelDownloader;

impl ModelDownloader {
    pub async fn is_internet_connected() -> bool {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(4))
            .build();
        
        if let Ok(client) = client {
            // Ping Hugging Face or Cloudflare DNS
            if let Ok(resp) = client.head("https://huggingface.co").send().await {
                return resp.status().is_success() || resp.status().is_redirection();
            }
            if let Ok(resp) = client.head("https://1.1.1.1").send().await {
                return resp.status().is_success();
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
        // 1. Check Internet Connectivity First
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

        // Check if file exists and verify checksum
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
                    max_attempts: 5,
                });
                return Ok(target_path);
            } else {
                Logger::warn(&format!("Existing file {:?} failed SHA-256. Redownloading...", target_path));
            }
        }

        // 2. Resilient Download Loop (Up to 5 Retries)
        let max_retries = 5;
        let mut last_error = String::from("Unknown error");

        for attempt in 1..=max_retries {
            Logger::info(&format!("Download attempt {}/{} for {}...", attempt, max_retries, filename));

            let client = match reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .build()
            {
                Ok(c) => c,
                Err(e) => {
                    last_error = e.to_string();
                    continue;
                }
            };

            let response_result = client.get(download_url).send().await;
            let response = match response_result {
                Ok(resp) if resp.status().is_success() => resp,
                Ok(resp) => {
                    last_error = format!("HTTP error: {}", resp.status());
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

            let file_result = File::create(&target_path).await;
            let mut file = match file_result {
                Ok(f) => f,
                Err(e) => {
                    last_error = format!("Failed to create model file: {}", e);
                    break;
                }
            };

            let mut stream = response.bytes_stream();
            use futures_util::StreamExt;
            let start_time = std::time::Instant::now();
            let mut stream_success = true;

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(chunk) => {
                        if let Err(e) = file.write_all(&chunk).await {
                            last_error = format!("Error writing to disk: {}", e);
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

                        progress_callback(DownloadProgress {
                            model_id: filename.to_string(),
                            downloaded_bytes,
                            total_bytes,
                            percentage,
                            speed_mbps,
                            is_completed: false,
                            error: None,
                            attempt,
                            max_attempts: max_retries,
                        });
                    }
                    Err(e) => {
                        last_error = format!("Stream interrupted: {}", e);
                        stream_success = false;
                        break;
                    }
                }
            }

            if stream_success && downloaded_bytes > 0 {
                let _ = file.flush().await;
                Logger::info(&format!("Download completed successfully for {} on attempt {}/{} ({} bytes)", filename, attempt, max_retries, downloaded_bytes));
                progress_callback(DownloadProgress {
                    model_id: filename.to_string(),
                    downloaded_bytes,
                    total_bytes: downloaded_bytes,
                    percentage: 100.0,
                    speed_mbps: 0.0,
                    is_completed: true,
                    error: None,
                    attempt,
                    max_attempts: max_retries,
                });
                return Ok(target_path);
            }

            // Clean up partial file before retry
            let _ = tokio::fs::remove_file(&target_path).await;
            tokio::time::sleep(std::time::Duration::from_millis(attempt as u64 * 1500)).await;
        }

        let fatal_err = format!("DOWNLOAD_FAILED_AFTER_RETRIES: Failed after 5 download attempts for {}. Last error: {}", filename, last_error);
        Logger::error(&fatal_err);
        Err(fatal_err)
    }

    pub async fn verify_file_sha256(path: &Path, expected_hash: &str) -> bool {
        if expected_hash.is_empty() {
            return true;
        }
        if let Ok(bytes) = fs::read(path).await {
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            let hash_hex = format!("{:x}", hasher.finalize());
            return hash_hex.eq_ignore_ascii_case(expected_hash);
        }
        false
    }
}
