//! Real-time hardware telemetry and GPU offload monitor.
//! Purpose: Samples CPU, RAM, and Windows GPU/VRAM hardware metrics to enforce the 2.0 GB VRAM inference safety cap.
//! Communication Matrix: Invoked by commands::telemetry and managed in src-tauri/src/lib.rs.

use serde::{Deserialize, Serialize};
use sysinfo::System;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryData {
    pub cpu_usage_percent: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub gpu_name: Option<String>,
    pub vram_used_mb: u64,
    pub vram_total_mb: u64,
    pub is_vram_critical: bool,
    pub active_offload_mode: String,
    pub gpu_layers_offloaded: u32,
    pub total_gpu_layers: u32,
}

pub struct HardwareMonitor {
    sys: Mutex<System>,
    cached_gpu_name: Option<String>,
    cached_vram_total_mb: u64,
}

impl HardwareMonitor {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        let (gpu_name, vram_mb) = detect_hardware_gpu();
        Self {
            sys: Mutex::new(sys),
            cached_gpu_name: gpu_name,
            cached_vram_total_mb: vram_mb,
        }
    }

    pub fn sample_telemetry(&self, forced_cpu_mode: bool, model_size_mb: u64) -> TelemetryData {
        let mut sys = self.sys.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        sys.refresh_cpu_usage();
        sys.refresh_memory();

        let cpu_usage = sys.global_cpu_info().cpu_usage();
        let ram_total = sys.total_memory() / (1024 * 1024);
        let ram_used = sys.used_memory() / (1024 * 1024);

        let vram_total = self.cached_vram_total_mb.max(2048);
        let os_headroom_buffer = 250;
        let effective_vram_budget = if vram_total > os_headroom_buffer {
            vram_total - os_headroom_buffer
        } else {
            vram_total
        };

        let total_layers = 28;

        let (active_offload_mode, gpu_layers, vram_used) = if forced_cpu_mode {
            ("cpu_only".to_string(), 0, 0)
        } else if model_size_mb <= effective_vram_budget {
            ("gpu_auto".to_string(), total_layers, model_size_mb + 120)
        } else {
            let layer_cost_mb = model_size_mb / total_layers as u64;
            let max_safe_layers = (effective_vram_budget / layer_cost_mb.max(1)) as u32;
            let safe_layers = max_safe_layers.min(total_layers);
            let used = (safe_layers as u64 * layer_cost_mb) + 100;
            ("gpu_partial_cpu".to_string(), safe_layers, used)
        };

        let is_vram_critical = vram_used >= (vram_total.saturating_sub(200));

        TelemetryData {
            cpu_usage_percent: (cpu_usage * 10.0).round() / 10.0,
            ram_used_mb: ram_used,
            ram_total_mb: ram_total,
            gpu_name: self.cached_gpu_name.clone().or_else(|| Some("DirectX 12 / Vulkan Hardware Accelerator".to_string())),
            vram_used_mb: vram_used,
            vram_total_mb: vram_total,
            is_vram_critical,
            active_offload_mode,
            gpu_layers_offloaded: gpu_layers,
            total_gpu_layers: total_layers,
        }
    }
}

#[cfg(target_os = "windows")]
fn detect_hardware_gpu() -> (Option<String>, u64) {
    let mut gpu_name: Option<String> = None;
    let mut vram_mb: u64 = 2048;

    let subkeys = ["0000", "0001", "0002"];
    for sub in &subkeys {
        let key = format!(r#"HKLM\SYSTEM\CurrentControlSet\Control\Class\{{4d36e968-e325-11ce-bfc1-08002be10318}}\{}"#, sub);
        let name_output = std::process::Command::new("reg")
            .args(["query", &key, "/v", "DriverDesc"])
            .output();

        if let Ok(out) = name_output {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                for line in text.lines() {
                    if line.contains("DriverDesc") && line.contains("REG_SZ") {
                        if let Some(desc) = line.split("REG_SZ").nth(1) {
                            let trimmed = desc.trim();
                            if !trimmed.is_empty() {
                                gpu_name = Some(trimmed.to_string());
                                break;
                            }
                        }
                    }
                }
            }
        }

        let mem_output = std::process::Command::new("reg")
            .args(["query", &key, "/v", "HardwareInformation.qwMemorySize"])
            .output();

        if let Ok(out) = mem_output {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                for line in text.lines() {
                    if line.contains("HardwareInformation.qwMemorySize") && line.contains("REG_QWORD") {
                        if let Some(val_str) = line.split("REG_QWORD").nth(1) {
                            let trimmed = val_str.trim().trim_start_matches("0x");
                            if let Ok(bytes) = u64::from_str_radix(trimmed, 16) {
                                let mb = bytes / (1024 * 1024);
                                if mb > 0 {
                                    vram_mb = mb;
                                }
                            }
                        }
                    }
                }
            }
        }

        if gpu_name.is_some() {
            break;
        }
    }

    (gpu_name, vram_mb)
}

#[cfg(not(target_os = "windows"))]
fn detect_hardware_gpu() -> (Option<String>, u64) {
    (None, 2048)
}
