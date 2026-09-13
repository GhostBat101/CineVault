//! Hardware telemetry IPC command.
//! Purpose: Exposes host CPU, RAM, and GPU/VRAM metrics to the webview HUD.
//! Communication Matrix: Invoked by frontend api.getTelemetry(); interfaces with HardwareMonitor in telemetry::hardware.

use tauri::State;
use crate::telemetry::hardware::{HardwareMonitor, TelemetryData};

#[tauri::command]
pub fn get_telemetry(
    hardware_monitor: State<'_, HardwareMonitor>,
    forced_cpu_mode: Option<bool>,
    model_size_mb: Option<u64>,
) -> Result<TelemetryData, String> {
    Ok(hardware_monitor.sample_telemetry(
        forced_cpu_mode.unwrap_or(false),
        model_size_mb.unwrap_or(808),
    ))
}
