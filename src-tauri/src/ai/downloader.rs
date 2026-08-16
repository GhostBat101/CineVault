use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;

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
}

pub struct ModelDownloader;

impl ModelDownloader {
    pub async fn download_gguf_model<F>(
        download_url: &str,
        dest_dir: &Path,
        filename: &str,
        expected_sha256: &str,
        progress_callback: F,
    ) -> Result<PathBuf, String>
    where
        F: Fn(DownloadProgress) + Send + 'static,
    {
        fs::create_dir_all(dest_dir)
            .await
            .map_err(|e| format!("Failed to create Model Vault dir: {}", e))?;

        let target_path = dest_dir.join(filename);

        // Check if file exists and verify checksum
        if target_path.exists() {
            if Self::verify_file_sha256(&target_path, expected_sha256).await {
                progress_callback(DownloadProgress {
                    model_id: filename.to_string(),
                    downloaded_bytes: 1,
                    total_bytes: 1,
                    percentage: 100.0,
                    speed_mbps: 0.0,
                    is_completed: true,
                    error: None,
                });
                return Ok(target_path);
            }
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|e| e.to_string())?;

        let response = client
            .get(download_url)
            .send()
            .await
            .map_err(|e| format!("Network connection to Hugging Face failed: {}", e))?;

        let total_bytes = response.content_length().unwrap_or(0);
        let mut downloaded_bytes = 0u64;

        let mut file = File::create(&target_path)
            .await
            .map_err(|e| format!("Failed to create model file: {}", e))?;

        let mut stream = response.bytes_stream();
        use futures_util::StreamExt;

        let start_time = std::time::Instant::now();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| format!("Error during chunk download: {}", e))?;
            file.write_all(&chunk)
                .await
                .map_err(|e| format!("Error writing chunk to disk: {}", e))?;

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
            });
        }

        progress_callback(DownloadProgress {
            model_id: filename.to_string(),
            downloaded_bytes,
            total_bytes,
            percentage: 100.0,
            speed_mbps: 0.0,
            is_completed: true,
            error: None,
        });

        Ok(target_path)
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
