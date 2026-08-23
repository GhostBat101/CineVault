//! scraper/cache.rs
//! â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//! WHAT: Content-addressed asset cache. [`AssetCacheManager::cache_image_from_url`]
//!   downloads a remote image once, names it by the SHA-256 of its URL, and
//!   returns the local path on every subsequent call (dedupe for free).
//!
//! DESIGN NOTES:
//!   - HTTP responses are validated (`is_success`) BEFORE any bytes are read
//!   or written - an error page must never land in the cache as a corrupt
//!   "poster" that then short-circuits future downloads via the existence
//!   fast path.
//!
//! USES:    reqwest, sha2, tokio/fs.
//! USED BY: scraper/mod.rs re-export; available to command layer for bulk
//!   poster pre-caching.

use std::path::{Path, PathBuf};
use sha2::{Digest, Sha256};
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;

pub struct AssetCacheManager {
    cache_dir: PathBuf,
}

impl AssetCacheManager {
    pub fn new<P: AsRef<Path>>(base_dir: P) -> Self {
        let cache_dir = base_dir.as_ref().join("cache").join("posters");
        Self { cache_dir }
    }

    pub async fn ensure_cache_dir(&self) -> Result<(), String> {
        fs::create_dir_all(&self.cache_dir)
            .await
            .map_err(|e| format!("Failed to create poster cache dir: {}", e))
    }

    pub async fn cache_image_from_url(&self, image_url: &str) -> Result<String, String> {
        self.ensure_cache_dir().await?;

        // Compute deterministic SHA-256 hash of the image URL
        let mut hasher = Sha256::new();
        hasher.update(image_url.as_bytes());
        let hash_hex = format!("{:x}", hasher.finalize());
        let file_path = self.cache_dir.join(format!("{}.jpg", hash_hex));

        // If file already cached, return local path
        if file_path.exists() {
            return Ok(file_path.to_string_lossy().to_string());
        }

        // Download image stream
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;

        let response = client
            .get(image_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .send()
            .await
            .map_err(|e| format!("Image download network error: {}", e))?;

        // Reject non-success statuses BEFORE touching disk: caching an error
        // page would poison the URL-keyed existence fast path forever.
        if !response.status().is_success() {
            return Err(format!(
                "Image download failed with HTTP status: {}",
                response.status()
            ));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read image bytes: {}", e))?;

        let mut file = File::create(&file_path)
            .await
            .map_err(|e| format!("Failed to create cache file: {}", e))?;

        file.write_all(&bytes)
            .await
            .map_err(|e| format!("Failed to write cache file: {}", e))?;

        Ok(file_path.to_string_lossy().to_string())
    }

    pub async fn get_cache_size_bytes(&self) -> u64 {
        let mut total_size = 0;
        if let Ok(mut entries) = fs::read_dir(&self.cache_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Ok(metadata) = entry.metadata().await {
                    total_size += metadata.len();
                }
            }
        }
        total_size
    }

    pub async fn purge_cache(&self) -> Result<(), String> {
        if self.cache_dir.exists() {
            fs::remove_dir_all(&self.cache_dir)
                .await
                .map_err(|e| format!("Failed to purge cache: {}", e))?;
        }
        self.ensure_cache_dir().await
    }
}
