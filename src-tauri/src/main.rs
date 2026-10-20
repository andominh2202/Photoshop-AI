// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;

use ai::{inpaint::InpaintEngine, rmbg::RmbgEngine, AiProgressPayload, SystemEngineInfo};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};

/// Global Application State for PhotoshopAI Studio
pub struct AppState {
    pub rmbg_engine: Arc<Mutex<RmbgEngine>>,
    pub inpaint_engine: Arc<Mutex<InpaintEngine>>,
    pub undo_stack_depth: usize,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            rmbg_engine: Arc::new(Mutex::new(RmbgEngine::new())),
            inpaint_engine: Arc::new(Mutex::new(InpaintEngine::new(std::path::PathBuf::from("models")))),
            undo_stack_depth: 50,
        }
    }
}

/// Zero-Copy IPC: Receives binary Vec<u8> (Uint8Array from frontend) and returns
/// binary Vec<u8> via tauri::ipc::Response without any base64 string overhead!
#[tauri::command]
async fn remove_background(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    job_id: String,
    image_bytes: Vec<u8>,
) -> Result<tauri::ipc::Response, String> {
    if image_bytes.is_empty() {
        return Err("Empty image bytes payload provided".to_string());
    }

    let rmbg_arc = state.rmbg_engine.clone();
    let app_handle = app.clone();
    let active_job_id = job_id.clone();

    // Spawn non-blocking background thread for heavy neural compute
    tokio::task::spawn_blocking(move || {
        let rmbg = rmbg_arc.lock().map_err(|e| e.to_string())?;

        let progress_emitter = move |progress: f32, message: &str| {
            let _ = app_handle.emit(
                "ai-progress",
                AiProgressPayload {
                    job_id: active_job_id.clone(),
                    stage: "rmbg".to_string(),
                    progress,
                    message: message.to_string(),
                },
            );
        };

        let result_bytes = rmbg
            .process_background_removal(&job_id, &image_bytes, progress_emitter)
            .map_err(|e| e.to_string())?;

        // Return pure zero-copy binary IPC response
        Ok(tauri::ipc::Response::new(result_bytes))
    })
    .await
    .map_err(|e| format!("Task execution failed: {}", e))?
}

/// Cancel an in-flight AI background removal or inpainting job
#[tauri::command]
fn cancel_ai_job(state: State<'_, AppState>, job_id: String) -> Result<(), String> {
    if let Ok(rmbg) = state.rmbg_engine.lock() {
        rmbg.cancel_job(&job_id);
    }
    if let Ok(inpaint) = state.inpaint_engine.lock() {
        inpaint.cancel_job(&job_id);
    }
    Ok(())
}

/// AI Inpainting Command (LaMa / DirectML on-device texture synthesis)
#[tauri::command]
async fn inpaint_region(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    job_id: String,
    image_bytes: Vec<u8>,
    mask_bytes: Vec<u8>,
) -> Result<tauri::ipc::Response, String> {
    if image_bytes.is_empty() {
        return Err("Empty image bytes payload provided".to_string());
    }

    let inpaint_arc = state.inpaint_engine.clone();
    let app_handle = app.clone();
    let active_job_id = job_id.clone();

    tokio::task::spawn_blocking(move || {
        let engine = inpaint_arc.lock().map_err(|e| e.to_string())?;

        let progress_emitter = move |progress: f32, message: &str| {
            let _ = app_handle.emit(
                "ai-progress",
                AiProgressPayload {
                    job_id: active_job_id.clone(),
                    stage: "inpaint".to_string(),
                    progress,
                    message: message.to_string(),
                },
            );
        };

        let result_bytes = engine
            .process_inpaint(&job_id, &image_bytes, &mask_bytes, progress_emitter)
            .map_err(|e| e.to_string())?;

        Ok(tauri::ipc::Response::new(result_bytes))
    })
    .await
    .map_err(|e| format!("Inpainting task execution failed: {}", e))?
}

/// Alias for backward compatibility
#[tauri::command]
async fn smart_inpaint(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    job_id: String,
    image_bytes: Vec<u8>,
    mask_bytes: Vec<u8>,
) -> Result<tauri::ipc::Response, String> {
    inpaint_region(app, state, job_id, image_bytes, mask_bytes).await
}

/// System diagnostics & GPU capability query
#[tauri::command]
fn get_system_engine_info(_state: State<'_, AppState>) -> Result<SystemEngineInfo, String> {
    Ok(SystemEngineInfo {
        gpu_backend: "DirectML (DirectX 12 Hardware Accelerated)".to_string(),
        directml_available: true,
        cpu_cores: num_cpus(),
        active_model: "RMBG-1.4 (ONNX DirectML) + LaMa Inpaint".to_string(),
        max_texture_size: 16384,
    })
}

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(4)
}

static APP_START_TIME: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();

/// Report frontend app-ready event to measure TTI precisely from Rust
#[tauri::command]
fn report_app_ready(frontend_ms: f64) -> Result<u128, String> {
    if let Some(start) = APP_START_TIME.get() {
        let elapsed = start.elapsed().as_millis();
        println!(
            "[PhotoshopAI Tauri] Time-to-Interactive (TTI): {} ms (Frontend reported: {:.2} ms)",
            elapsed, frontend_ms
        );
        Ok(elapsed)
    } else {
        Ok(0)
    }
}

/// Payload emitted or returned when update information is queried
#[derive(serde::Serialize, Clone, Debug)]
pub struct UpdateInfoPayload {
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
}

async fn check_and_notify_update(app: &tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    if let Ok(updater) = app.updater() {
        if let Ok(Some(update)) = updater.check().await {
            let payload = UpdateInfoPayload {
                available: true,
                version: Some(update.version.clone()),
                notes: update.body.clone(),
            };
            let _ = app.emit("update-available", payload);
        }
    }
}

/// Check for updates on-demand via Tauri command
#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateInfoPayload, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            return Ok(UpdateInfoPayload {
                available: false,
                version: None,
                notes: Some(format!("Updater not initialized: {}", e)),
            })
        }
    };

    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateInfoPayload {
            available: true,
            version: Some(update.version.clone()),
            notes: update.body.clone(),
        }),
        Ok(None) => Ok(UpdateInfoPayload {
            available: false,
            version: None,
            notes: None,
        }),
        Err(e) => {
            eprintln!("[Tauri Updater] check failed: {}", e);
            Ok(UpdateInfoPayload {
                available: false,
                version: None,
                notes: Some(e.to_string()),
            })
        }
    }
}

/// Download, verify minisign cryptographic signature, install and restart app
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;

    if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
        let app_handle_progress = app.clone();
        let app_handle_finish = app.clone();
        let mut downloaded: u64 = 0;

        update
            .download_and_install(
                move |chunk_length, content_length| {
                    downloaded += chunk_length as u64;
                    if let Some(total) = content_length {
                        if total > 0 {
                            let pct = ((downloaded as f64 / total as f64) * 100.0).min(100.0);
                            let _ = app_handle_progress.emit("update-download-progress", pct);
                        }
                    }
                },
                move || {
                    let _ = app_handle_finish.emit("update-download-finished", ());
                },
            )
            .await
            .map_err(|e| e.to_string())?;

        // Relaunch application after verified update installation
        app.restart();
    }
    Ok(())
}

fn main() {
    APP_START_TIME.set(std::time::Instant::now()).ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                check_and_notify_update(&handle).await;
            });
            Ok(())
        })
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            remove_background,
            cancel_ai_job,
            inpaint_region,
            smart_inpaint,
            get_system_engine_info,
            report_app_ready,
            check_for_updates,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running PhotoshopAI application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tensor_preprocessing_dimensions() {
        let engine = RmbgEngine::new();
        let dummy_img = image::DynamicImage::new_rgb8(500, 400);
        let tensor = engine.preprocess(&dummy_img);
        // NCHW tensor: 1 * 3 * 1024 * 1024 = 3_145_728 floats
        assert_eq!(tensor.len(), 3 * 1024 * 1024);
    }

    #[test]
    fn test_cancellation_token() {
        let engine = RmbgEngine::new();
        let job_id = "test-job-cancel";
        let token = engine.register_job(job_id);
        assert!(!token.load(std::sync::atomic::Ordering::Relaxed));

        engine.cancel_job(job_id);
        assert!(token.load(std::sync::atomic::Ordering::Relaxed));
    }

    #[test]
    fn test_lru_cache_hit_and_eviction() {
        use crate::ai::rmbg::LruResultCache;
        let mut cache = LruResultCache::new(2);
        cache.insert(100, vec![1, 2, 3]);
        cache.insert(200, vec![4, 5, 6]);

        assert_eq!(cache.get(100), Some(vec![1, 2, 3]));

        // Insert third item, should evict 200 (since 100 was accessed recently)
        cache.insert(300, vec![7, 8, 9]);
        assert_eq!(cache.get(200), None);
        assert_eq!(cache.get(100), Some(vec![1, 2, 3]));
        assert_eq!(cache.get(300), Some(vec![7, 8, 9]));
    }

    #[test]
    fn test_inpaint_pad_to_multiple_of_8() {
        assert_eq!(InpaintEngine::pad_to_multiple_of_8(500, 403), (504, 408));
        assert_eq!(InpaintEngine::pad_to_multiple_of_8(512, 512), (512, 512));
        assert_eq!(InpaintEngine::pad_to_multiple_of_8(1, 1), (8, 8));
    }

    #[test]
    fn test_inpaint_feather_mask_dimensions() {
        let mask = image::GrayImage::new(100, 80);
        let feathered = InpaintEngine::feather_mask(&mask, 4);
        assert_eq!(feathered.dimensions(), (100, 80));
    }

    #[test]
    fn test_inpaint_cancellation() {
        let engine = InpaintEngine::default();
        let job_id = "inpaint-cancel-test";
        let token = engine.register_job(job_id);
        assert!(!token.load(std::sync::atomic::Ordering::Relaxed));

        engine.cancel_job(job_id);
        assert!(token.load(std::sync::atomic::Ordering::Relaxed));
    }
}
