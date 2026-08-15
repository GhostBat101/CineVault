use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
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
