use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelMetadata {
    pub id: String,
    pub name: String,
    pub parameter_size: String,
    pub quantization: String,
    pub file_size_mb: u64,
    pub download_url: String,
    pub filename: String,
    pub sha256_checksum: String,
    pub context_length: usize,
    pub is_default: bool,
    pub prompt_format: String, // 'llama3' | 'chatml' | 'custom'
}

pub fn get_supported_models() -> Vec<ModelMetadata> {
    vec![
        ModelMetadata {
            id: "llama-3.2-1b-instruct-q4km".to_string(),
            name: "Llama 3.2 1B Instruct".to_string(),
            parameter_size: "1.23B".to_string(),
            quantization: "Q4_K_M".to_string(),
            file_size_mb: 808,
            download_url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf".to_string(),
            filename: "Llama-3.2-1B-Instruct-Q4_K_M.gguf".to_string(),
            sha256_checksum: "5723b7b8449c25f4a13f70e704874c721c5f3e46c7ad7f5f745778dc652c7ab9".to_string(),
            context_length: 4096,
            is_default: true,
            prompt_format: "llama3".to_string(),
        },
        ModelMetadata {
            id: "qwen-2.5-1.5b-instruct-q4km".to_string(),
            name: "Qwen 2.5 1.5B Instruct".to_string(),
            parameter_size: "1.54B".to_string(),
            quantization: "Q4_K_M".to_string(),
            file_size_mb: 1110,
            download_url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf".to_string(),
            filename: "qwen2.5-1.5b-instruct-q4_k_m.gguf".to_string(),
            sha256_checksum: "7c39ad0030a5975db35824b0718d7f999901416bfbf6ff0dbd63f0d463b27b9c".to_string(),
            context_length: 4096,
            is_default: false,
            prompt_format: "chatml".to_string(),
        },
    ]
}

pub fn get_default_model() -> ModelMetadata {
    get_supported_models().remove(0)
}
