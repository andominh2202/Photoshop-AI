pub mod rmbg;
pub mod inpaint;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProgressPayload {
    pub job_id: String,
    pub stage: String,
    pub progress: f32, // 0.0 to 1.0
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemEngineInfo {
    pub gpu_backend: String,
    pub directml_available: bool,
    pub cpu_cores: usize,
    pub active_model: String,
    pub max_texture_size: u32,
}
