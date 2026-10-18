pub mod rmbg;

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProgressPayload {
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

/// Global State for AI Engine
pub struct AiEngineState {
    pub model_path: Option<String>,
    pub rmbg_engine: Arc<Mutex<rmbg::RmbgEngine>>,
}

impl Default for AiEngineState {
    fn default() -> Self {
        Self {
            model_path: None,
            rmbg_engine: Arc::new(Mutex::new(rmbg::RmbgEngine::new())),
        }
    }
}
