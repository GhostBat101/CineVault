use serde::{Deserialize, Serialize};
use sysinfo::System;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
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
}

impl HardwareMonitor {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        Self {
            sys: Mutex::new(sys),
        }
    }

    pub fn sample_telemetry(&self, forced_cpu_mode: bool, model_size_mb: u64) -> TelemetryData {
        let mut sys = self.sys.lock().unwrap();
        sys.refresh_cpu_usage();
        sys.refresh_memory();

        let cpu_usage = sys.global_cpu_info().cpu_usage();
        let ram_total = sys.total_memory() / (1024 * 1024);
        let ram_used = sys.used_memory() / (1024 * 1024);

        // Hardware VRAM Budget Enforcer (< 2.0 GB Hard Cap)
        let vram_total = 2048; // Standard 2GB VRAM allocation target
        let os_headroom_buffer = 250; // Reserve 250MB for OS/Desktop compositing
        let effective_vram_budget = vram_total - os_headroom_buffer;

        let total_layers = 28; // Standard layers for 1B/1.5B SLMs

        let (active_offload_mode, gpu_layers, vram_used) = if forced_cpu_mode {
            ("cpu_only".to_string(), 0, 0)
        } else if model_size_mb <= effective_vram_budget {
            // Fits 100% within VRAM safely
            ("gpu_auto".to_string(), total_layers, model_size_mb + 120) // model + KV cache
        } else {
            // Dynamic Partial Layer Offload to CPU
            let layer_cost_mb = model_size_mb / total_layers as u64;
            let max_safe_layers = (effective_vram_budget / layer_cost_mb.max(1)) as u32;
            let safe_layers = max_safe_layers.min(total_layers);
            let used = (safe_layers as u64 * layer_cost_mb) + 100;
            ("gpu_partial_cpu".to_string(), safe_layers, used)
        };

        let is_vram_critical = vram_used >= (vram_total - 200);

        TelemetryData {
            cpu_usage_percent: (cpu_usage * 10.0).round() / 10.0,
            ram_used_mb: ram_used,
            ram_total_mb: ram_total,
            gpu_name: Some("DirectX 12 / Vulkan Hardware Accelerator".to_string()),
            vram_used_mb: vram_used,
            vram_total_mb: vram_total,
            is_vram_critical,
            active_offload_mode,
            gpu_layers_offloaded: gpu_layers,
            total_gpu_layers: total_layers,
        }
    }
}
