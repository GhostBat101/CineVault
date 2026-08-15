use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct InferenceRequest {
    pub prompt: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InferenceResponse {
    pub generated_text: String,
    pub model_used: String,
    pub total_tokens: usize,
}
