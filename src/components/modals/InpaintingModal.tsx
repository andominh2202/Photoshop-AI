import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { X, Sparkles, AlertCircle, CheckCircle2, Loader2, Eraser } from 'lucide-react';
import { useEditorStore } from '@/store/useEditorStore';
import { pixelRegistry } from '@/store/pixelStore';
import { inpaintToolManager } from '@/tools/InpaintTool';
import { sendInpaintRequest, cancelAIJob, onAIProgress } from '@/platform/api';
import { AIResultCommand } from '@/history/commands';

export const InpaintingModal: React.FC = memo(() => {
  const isOpen = useEditorStore((s) => s.isInpaintingModalOpen);
  const setOpen = useEditorStore((s) => s.setInpaintingModalOpen);
  const activeLayer = useEditorStore((s) => s.layers.find((l) => l.id === s.activeLayerId));
  const docWidth = useEditorStore((s) => s.docWidth);
  const docHeight = useEditorStore((s) => s.docHeight);
  const executeCommand = useEditorStore((s) => s.executeCommand);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageMessage, setStageMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const activeJobIdRef = useRef<string | null>(null);

  // Generate preview when modal opens
  useEffect(() => {
    if (!isOpen || !activeLayer) {
      setPreviewUrl(null);
      setError(null);
      setIsProcessing(false);
      setProgress(0);
      return;
    }

    const layerUrl = pixelRegistry.getLayerUrl(activeLayer.id) || activeLayer.textureUrl;
    setPreviewUrl(layerUrl || null);
  }, [isOpen, activeLayer]);

  // Subscribe to AI progress events
  useEffect(() => {
    if (!isOpen) return;

    const unbind = onAIProgress((jobId, pct, message) => {
      if (activeJobIdRef.current === jobId) {
        setProgress(pct);
        if (message) setStageMessage(message);
      }
    });

    return () => unbind();
  }, [isOpen]);

  const handleApply = useCallback(async () => {
    if (!activeLayer) return;

    const imageBytes = pixelRegistry.getLayerBytes(activeLayer.id);
    if (!imageBytes || imageBytes.byteLength === 0) {
      setError('Active layer has no raster pixel data to inpaint.');
      return;
    }

    if (!inpaintToolManager.hasMask()) {
      setError('Please draw an inpaint mask on the canvas first using the Inpaint Brush.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress(0.05);
    setStageMessage('Rasterizing mask strokes to binary buffer...');

    const jobId = `inpaint-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    activeJobIdRef.current = jobId;

    try {
      const maskBytes = await inpaintToolManager.generateMaskPng(docWidth, docHeight);
      const oldUrl = pixelRegistry.getLayerUrl(activeLayer.id);

      const resultBytes = await sendInpaintRequest(
        activeLayer.id,
        imageBytes,
        maskBytes,
        jobId
      );

      // Wrap in AIResultCommand for Undo / Redo
      const cmd = new AIResultCommand({
        layerId: activeLayer.id,
        docWidth,
        docHeight,
        oldBytes: imageBytes,
        newBytes: resultBytes,
        oldUrl,
        description: 'AI Inpainting (LaMa)',
      });

      await executeCommand(cmd);

      // Clear mask after successful synthesis
      inpaintToolManager.clearMask();
      setOpen(false);
    } catch (err: any) {
      if (err.message && err.message.includes('cancelled')) {
        setStageMessage('Inpainting cancelled.');
      } else {
        setError(err?.message || 'Inpainting failed to synthesize texture.');
      }
    } finally {
      setIsProcessing(false);
      activeJobIdRef.current = null;
    }
  }, [activeLayer, docWidth, docHeight, executeCommand, setOpen]);

  const handleCancelJob = useCallback(async () => {
    if (activeJobIdRef.current) {
      await cancelAIJob(activeJobIdRef.current);
    }
  }, []);

  const handleClearMask = useCallback(() => {
    inpaintToolManager.clearMask();
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h2 className="font-semibold text-sm">AI Inpainting & Object Removal (DirectML)</h2>
          </div>
          <button
            onClick={() => !isProcessing && setOpen(false)}
            disabled={isProcessing}
            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 text-xs">
          {/* Target Layer Info */}
          <div className="flex items-center justify-between bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/80">
            <div>
              <span className="text-zinc-400">Target Layer:</span>{' '}
              <span className="font-medium text-zinc-200">{activeLayer?.name || 'No Layer Selected'}</span>
            </div>
            <div className="text-zinc-400">
              {docWidth} × {docHeight} px
            </div>
          </div>

          {/* Preview Canvas Thumbnail */}
          {previewUrl && (
            <div className="relative aspect-video bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800 flex items-center justify-center">
              <img
                src={previewUrl}
                alt="Layer Preview"
                className="max-h-full max-w-full object-contain"
              />
              <div className="absolute inset-0 bg-red-500/15 pointer-events-none border border-red-500/30 flex items-center justify-center">
                <span className="bg-black/60 text-[10px] text-red-300 px-2 py-0.5 rounded backdrop-blur-xs">
                  Inpaint Area Highlighted
                </span>
              </div>
            </div>
          )}

          {/* Mask Information */}
          <div className="flex items-center justify-between text-zinc-400 bg-zinc-800/30 px-3 py-2 rounded">
            <span>Mask Strokes: {inpaintToolManager.getStrokes().length} registered</span>
            <button
              onClick={handleClearMask}
              disabled={isProcessing || !inpaintToolManager.hasMask()}
              className="flex items-center gap-1 text-red-400 hover:text-red-300 disabled:opacity-40 cursor-pointer text-[11px]"
            >
              <Eraser className="w-3 h-3" />
              <span>Clear Mask</span>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Progress Indicator */}
          {isProcessing && (
            <div className="space-y-2 bg-zinc-950/60 p-3.5 rounded-lg border border-zinc-800/80">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-300 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                  {stageMessage || 'Synthesizing replacement texture...'}
                </span>
                <span className="font-mono text-purple-400">{Math.round(progress * 100)}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-200"
                  style={{ width: `${Math.max(5, Math.min(100, progress * 100))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 bg-zinc-950/60 text-xs">
          {isProcessing ? (
            <button
              onClick={handleCancelJob}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
            >
              Cancel Operation
            </button>
          ) : (
            <button
              onClick={() => setOpen(false)}
              className="px-3.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            >
              Close
            </button>
          )}

          {!isProcessing && (
            <button
              onClick={handleApply}
              disabled={!inpaintToolManager.hasMask()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white font-medium transition shadow-sm cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Apply Inpainting (DirectML)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
