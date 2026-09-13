//! Process-wide file and stdout logger.
//! Purpose: Provides timestamped log writing and size-based rotation into the local logs directory.
//! Communication Matrix: Invoked across backend modules via crate::logger::Logger::{info, warn, error, log}.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_LOG_FILE_BYTES: u64 = 5 * 1024 * 1024;
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
        }

        Self::log("INFO", "CineVault Logging System initialized successfully.");
        Ok(())
    }

    pub fn log(level: &str, message: &str) {
        let timestamp = format_utc_timestamp();
        let formatted = format!("[{}] [{}] {}\n", timestamp, level, message);

        let guard = GLOBAL_LOGGER
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if let Some(logger) = guard.as_ref() {
            logger.rotate_if_oversized();
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&logger.log_path) {
                let _ = file.write_all(formatted.as_bytes());
                let _ = file.flush();
            }
        }
        drop(guard);

        print!("{}", formatted);
    }

    fn rotate_if_oversized(&self) {
        let oversized = fs::metadata(&self.log_path)
            .map(|meta| meta.len() > MAX_LOG_FILE_BYTES)
            .unwrap_or(false);

        if !oversized {
            return;
        }

        let backup_path = self.backup_log_path();
        if let Err(e) = fs::remove_file(&backup_path) {
            if e.kind() != std::io::ErrorKind::NotFound {
                eprintln!("[cinevault][warn] Log rotation: could not clear backup {:?}: {}", backup_path, e);
            }
        }
        if let Err(e) = fs::rename(&self.log_path, &backup_path) {
            eprintln!("[cinevault][warn] Log rotation rename failed (file may be locked): {}", e);
        }
    }

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
