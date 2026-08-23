//! logger.rs
//! â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//! WHAT: Minimal process-wide file + stdout logger. Writes timestamped lines
//!   to `<logs_dir>/cinevault.log` via [`Logger::{init, info, warn,
//!   error, log}`], rotating the active file to `cinevault.1.log` when
//!   it exceeds [`MAX_LOG_FILE_BYTES`].
//!
//! DESIGN NOTES:
//!   - Static GLOBAL_LOGGER (`Mutex<Option<Logger>>`) holds only the log
//!   file path; every write opens the file in append mode, writes one
//!   line, explicitly flushes and closes it. Entries therefore hit disk
//!   immediately - there is no lingering handle or in-process buffer -
//!   which is what makes a graceful `window.close()` shutdown safe.
//!   - Rotation is size-based with ONE backup slot: once the active file
//!   passes the limit it is renamed to `<stem>.1.log` and the next write
//!   recreates a fresh active log. The previous backup is removed first
//!   because Windows renames fail onto existing files.
//!   - Rotation check + write happen under a single lock acquisition, so two
//!   threads can never race a rename against an open append handle.
//!   - Timestamps use Howard Hinnant's civil-from-days conversion (leap-day
//!   exact). The helper is duplicated from db::repository::iso_utc_now
//!   instead of shared because this logger is a leaf module that must not
//!   depend on the database layer.
//!
//! USES:    std only (fs, io, sync, time). No external crates.
//! USED BY: src-tauri/src/lib.rs (boot logging),
//!   src-tauri/src/db/repository.rs (migration warnings),
//!   src-tauri/src/commands/mod.rs, scraper/imdb.rs,
//!   ai/{engine,downloader}.rs via `crate::logger::Logger::*`.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// Rotate the active log once it grows past this size (5 MiB).
const MAX_LOG_FILE_BYTES: u64 = 5 * 1024 * 1024;
/// Backup slot suffix: `<stem>.1.log`. Older backups are removed, not chained.
const ROTATION_SUFFIX: &str = "1";

pub struct Logger {
    log_path: PathBuf,
}

static GLOBAL_LOGGER: Mutex<Option<Logger>> = Mutex::new(None);

impl Logger {
    pub fn init<P: AsRef<Path>>(logs_dir: P) -> Result<(), String> {
        let dir = logs_dir.as_ref();
        let _ = fs::create_dir_all(dir);

        let log_path = dir.join("cinevault.log");
        let logger = Logger { log_path };

        {
            let mut global = GLOBAL_LOGGER.lock().map_err(|e| e.to_string())?;
            *global = Some(logger);
        } // Lock is explicitly dropped here to prevent deadlocks!

        Self::log("INFO", "CineVault Logging System initialized successfully.");
        Ok(())
    }

    pub fn log(level: &str, message: &str) {
        let timestamp = format_utc_timestamp();
        let formatted = format!("[{}] [{}] {}\n", timestamp, level, message);

        // Poison tolerance: a panic mid-write must never wedge all future logs.
        let guard = GLOBAL_LOGGER
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if let Some(logger) = guard.as_ref() {
            logger.rotate_if_oversized();
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&logger.log_path) {
                let _ = file.write_all(formatted.as_bytes());
                // Flush now: guarantees immediacy regardless of buffering.
                let _ = file.flush();
            }
        }
        drop(guard);

        print!("{}", formatted);
    }

    /// Shift the active log aside when it exceeds [`MAX_LOG_FILE_BYTES`].
    /// Best-effort: any filesystem error silently keeps appending to the old file.
    fn rotate_if_oversized(&self) {
        let oversized = fs::metadata(&self.log_path)
            .map(|meta| meta.len() > MAX_LOG_FILE_BYTES)
            .unwrap_or(false); // Missing file -> nothing to rotate yet.

        if !oversized {
            return;
        }

        let backup_path = self.backup_log_path();
        // Single backup generation: remove stale backup so rename succeeds on Windows.
        if let Err(e) = fs::remove_file(&backup_path) {
            if e.kind() != std::io::ErrorKind::NotFound {
                Logger::warn(&format!("Log rotation: could not clear backup {:?}: {}", backup_path, e));
            }
        }
        // A locked file (external viewer / AV scanner) must not abort logging -
        // warn and keep appending to the oversized file until the next tick.
        if let Err(e) = fs::rename(&self.log_path, &backup_path) {
            Logger::warn(&format!("Log rotation rename failed (file may be locked): {}", e));
        }
    }

    /// Path of the rotated backup: same directory, `<stem>.<ROTATION_SUFFIX>.log`.
    fn backup_log_path(&self) -> PathBuf {
        let stem = self
            .log_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("cinevault");
        match self.log_path.parent() {
            Some(dir) => dir.join(format!("{}.{}.log", stem, ROTATION_SUFFIX)),
            None => PathBuf::from(format!("{}.{}.log", stem, ROTATION_SUFFIX)),
        }
    }

    pub fn info(msg: &str) {
        Self::log("INFO", msg);
    }

    pub fn warn(msg: &str) {
        Self::log("WARN", msg);
    }

    pub fn error(msg: &str) {
        Self::log("ERROR", msg);
    }
}

/// Current UTC time formatted as `YYYY-MM-DD HH:MM:SS UTC`.
///
/// Howard Hinnant's civil-from-days algorithm (identical math to
/// db::repository::iso_utc_now): pure integer division converts
/// days-since-epoch to Y/M/D correctly across Gregorian leap years,
/// including Feb 29 and century non-leap years. Replaces the previous
/// subtract-one-month-at-a-time loop whose boundary handling was wrong.
fn format_utc_timestamp() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs() as i64;

    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (hour, minute, second) = (rem / 3600, (rem % 3600) / 60, rem % 60);

    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };

    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02} UTC",
        year, month, day, hour, minute, second
    )
}
