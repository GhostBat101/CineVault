use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

pub struct Logger {
    log_file: Mutex<PathBuf>,
}

static GLOBAL_LOGGER: Mutex<Option<Logger>> = Mutex::new(None);

impl Logger {
    pub fn init<P: AsRef<Path>>(logs_dir: P) -> Result<(), String> {
        let dir = logs_dir.as_ref();
        fs::create_dir_all(dir).map_err(|e| format!("Failed to create logs directory: {}", e))?;
        
        let log_path = dir.join("cinevault.log");
        let logger = Logger {
            log_file: Mutex::new(log_path),
        };

        let mut global = GLOBAL_LOGGER.lock().map_err(|e| e.to_string())?;
        *global = Some(logger);
        
        Self::log("INFO", "CineVault Logging System initialized successfully.");
        Ok(())
    }

    pub fn log(level: &str, message: &str) {
        let timestamp = chrono_format_now();
        let formatted = format!("[{}] [{}] {}\n", timestamp, level, message);

        if let Ok(guard) = GLOBAL_LOGGER.lock() {
            if let Some(logger) = guard.as_ref() {
                if let Ok(path) = logger.log_file.lock() {
                    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&*path) {
                        let _ = file.write_all(formatted.as_bytes());
                    }
                }
            }
        }
        print!("{}", formatted);
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

fn chrono_format_now() -> String {
    let now = SystemTime::now();
    let duration = now.duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    
    let days = secs / 86400;
    let rem_secs = secs % 86400;
    let hours = rem_secs / 3600;
    let minutes = (rem_secs % 3600) / 60;
    let seconds = rem_secs % 60;

    let mut y = 1970;
    let mut d = days;
    loop {
        let leap = if (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0) { 1 } else { 0 };
        let days_in_year = 365 + leap;
        if d >= days_in_year {
            d -= days_in_year;
            y += 1;
        } else {
            break;
        }
    }
    let leap = if (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0) { 1 } else { 0 };
    let month_days = [31, 28 + leap, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0;
    for (idx, &md) in month_days.iter().enumerate() {
        if d >= md {
            d -= md;
        } else {
            m = idx + 1;
            break;
        }
    }
    if m == 0 { m = 12; }
    let day = d + 1;

    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02} UTC", y, m, day, hours, minutes, seconds)
}
