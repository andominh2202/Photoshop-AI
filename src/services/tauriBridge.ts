/**
 * Backward compatibility adapter for legacy callers.
 * Strictly redirects all binary operations to the unified src/platform/api.ts.
 */
import { sendImageToAI, onAIProgress, getRuntime } from '@/platform/api';

export const isTauriEnvironment = (): boolean => {
  return getRuntime() === 'tauri';
};

export interface AiProgressEvent {
  stage: string;
  progress: number;
  message: string;
}

export interface SystemEngineInfo {
  gpu_backend: string;
  directml_available: boolean;
  cpu_cores: number;
  active_model: string;
  max_texture_size: number;
}

export async function invokeRemoveBackground(
  imageBytes: Uint8Array,
  onProgress?: (event: AiProgressEvent) => void
): Promise<Uint8Array> {
  const jobId = `legacy-${Date.now()}`;
  let cleanup: (() => void) | undefined;

  if (onProgress) {
    cleanup = onAIProgress((incomingJobId, pct, msg) => {
      if (incomingJobId === jobId) {
        onProgress({
          stage: 'rmbg',
          progress: pct,
          message: msg || '',
        });
      }
    });
  }

  try {
    return await sendImageToAI('layer-legacy', imageBytes, jobId);
  } finally {
    if (cleanup) cleanup();
  }
}
