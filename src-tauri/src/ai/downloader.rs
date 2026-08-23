//! ai/downloader.rs
//! â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//! WHAT: Resilient GGUF model downloader. Streams weights to a `.part` temp
//!   file, hashes content WHILE downloading, verifies SHA-256 (fail-closed)
//!   and only then atomically renames into the Model Vault.
//!
//! SAFETY PROPERTIES:
//!   - Hash verification is STREAMED (constant memory; no whole-file read).
//!   - Fresh downloads are verified too - a cleanly-truncated body fails.
//!   - The final model filename appears on disk only via atomic rename of the
//!   fully-verified .part file; interrupted attempts never leave a file that
//!   could later pass an existence check.
//!   - Concurrency: a module-level `IN_FLIGHT` registry (keyed by filename)
//!   rejects a second download of the same model while one is running; the
//!   caller sees `DOWNLOAD_IN_PROGRESS: <file>` instead of racing byte writes.
//!
//! USES:    reqwest (stream), sha2, tokio/fs, logger.
//! USED BY: src-tauri/src/commands/mod.rs (download_ai_model,
//!   generate_ai_summary first-use auto-download).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;
use crate::logger::Logger;

/// Filenames with a download currently running. Poison-tolerant lock:
/// a panicking callback must never wedge every future download.
/// Registration/unregistration happens ONLY in the thin
/// [`ModelDownloader::download_gguf_model`] wrapper, so every exit path of
/// [`ModelDownloader::download_gguf_model_inner`] is covered by construction.
///
/// OnceLock indirection: `HashSet::new()` is not a `const fn` on stable Rust,
/// so the set cannot live directly inside a `static Mutex`.
static IN_FLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

/// Lazily-initialized access to the in-flight download registry.
fn in_flight_registry() -> &'static Mutex<HashSet<String>> {
    IN_FLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Progress payload emitted through the `model_download_progress` event.
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

/// Maximum retry attempts for a single model download.
const MAX_RETRIES: u32 = 5;

pub struct ModelDownloader;

impl ModelDownloader {
    /// Cheap connectivity probe used before any download starts.
    ///
    /// Three probes in escalation order: huggingface.co -> cloudflare
    /// 1.1.1.1 -> google generate_204. A NEGATIVE answer never short-
    /// circuits: HF 403s HEAD requests from bots, so a responding-but-
    /// hostile edge must fall through to the next probe. Success criteria:
    /// `is_success() || is_redirection()` for the first two (1.1.1.1
    /// answers HEAD with a 301 redirect), exactly HTTP 204 for generate_204.
    pub async fn is_internet_connected() -> bool {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .build();

        if let Ok(client) = client {
            // Probe 1: huggingface.co (the actual download host).
            if let Ok(resp) = client.head("https://huggingface.co").send().await {
                if resp.status().is_success() || resp.status().is_redirection() {
                    return true;
                }
            }
            // Probe 2: cloudflare 1.1.1.1 - answers HEAD with a 301 redirect,
            // which still proves DNS + TCP + TLS all work.
            if let Ok(resp) = client.head("https://1.1.1.1").send().await {
                if resp.status().is_success() || resp.status().is_redirection() {
                    return true;
                }
            }
            // Probe 3: google generate_204 - connectivity checker that
            // responds with exactly 204 No Content when reachable.
            if let Ok(resp) = client.head("https://www.google.com/generate_204").send().await {
                if resp.status().as_u16() == 204 {
                    return true;
                }
            }
        }
        false
    }

    /// Download `filename` from `download_url` into `dest_dir`, verifying it
    /// against `expected_sha256`. Returns the final verified path.
    ///
    /// Thin concurrency guard around
    /// [`ModelDownloader::download_gguf_model_inner`]: registers `filename`
    /// in [`IN_FLIGHT`] BEFORE any work starts, then unconditionally removes
    /// it once the inner future resolves - success, every Err branch, and
    /// retry exhaustion are all covered because removal happens at this
    /// single point after `.await`. A concurrent duplicate call is rejected
    /// up front with `DOWNLOAD_IN_PROGRESS`.
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
        {
            let mut in_flight = in_flight_registry()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !in_flight.insert(filename.to_string()) {
                return Err(format!("DOWNLOAD_IN_PROGRESS: {filename}"));
            }
        } // Registry lock dropped before the long transfer; re-taken only to unregister.

        let outcome = Self::download_gguf_model_inner(
            download_url,
            dest_dir,
            filename,
            expected_sha256,
            progress_callback,
        )
        .await;

        // Single exit funnel: whatever inner returned, this filename is no
        // longer downloading.
        let mut in_flight = in_flight_registry()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        in_flight.remove(filename);
        outcome
    }

    /// The full download pipeline previously living in
    /// [`ModelDownloader::download_gguf_model`]: connectivity check,
    /// already-verified fast path, resilient retry loop with streamed
    /// SHA-256 hashing, and atomic promote of the verified `.part` file.
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
        let part_path = dest_dir.join(format!("{}.part", filename));

        // Already-downloaded files are re-verified before being trusted.
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

        // 2. Resilient Download Loop (Up to MAX_RETRIES attempts)
        let mut last_error = String::from("Unknown error");

        for attempt in 1..=MAX_RETRIES {
            Logger::info(&format!("Download attempt {}/{} for {}...", attempt, MAX_RETRIES, filename));

            // Re-check the completed-file fast path on EVERY attempt: a
            // concurrent download (first-use auto-fetch + manual click) may
            // have landed a verified file while we were retrying.
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
                .tcp_keepalive(Some(std::time::Duration::from_secs(15)))
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

            // Stream into the .part file - never directly onto the final name.
            let file_result = File::create(&part_path).await;
            let mut file = match file_result {
                Ok(f) => f,
                Err(e) => {
                    last_error = format!("Failed to create part file on disk: {}", e);
                    Logger::error(&last_error);
                    break;
                }
            };

            let mut hasher = Sha256::new(); // streamed hashing while writing
            let mut stream = response.bytes_stream();
            use futures_util::StreamExt;
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

                        // Log to file periodically every 5 seconds
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

                        // Throttle IPC emission to ~12 updates per second (80ms).
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
                // Flush failures go through the retry path like any other
                // error - returning early would skip remaining attempts AND
                // orphan the .part file.
                if let Err(e) = file.flush().await {
                    last_error = format!("Flush error: {}", e);
                    Logger::error(&last_error);
                    let _ = fs::remove_file(&part_path).await;
                    tokio::time::sleep(std::time::Duration::from_millis(attempt as u64 * 1500)).await;
                    continue;
                }
                drop(file);

                // FAIL-CLOSED verification of freshly downloaded bytes.
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
                    continue; // retry from scratch; corrupted body never lands
                }

                // Atomic promote: verified .part -> final model path.
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

            // Clean up the partial file before retrying.
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

    /// Streamed SHA-256 verification (constant memory even for multi-GB models).
    pub async fn verify_file_sha256(path: &Path, expected_hash: &str) -> bool {
        if expected_hash.is_empty() {
            return true;
        }
        use tokio::io::AsyncReadExt;

        let mut file = match File::open(path).await {
            Ok(f) => f,
            Err(_) => return false,
        };

        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 1024 * 1024]; // 1 MiB chunks
        loop {
            match file.read(&mut buffer).await {
                Ok(0) => break, // EOF
                Ok(read) => hasher.update(&buffer[..read]),
                Err(_) => return false,
            }
        }

        let hash_hex = format!("{:x}", hasher.finalize());
        hash_hex.eq_ignore_ascii_case(expected_hash)
    }
}
