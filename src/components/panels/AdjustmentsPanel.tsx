import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Sliders, RotateCcw, Sun, Contrast, Droplets, CloudFog, Loader2 } from 'lucide-react';
import { useEditorStore, LayerAdjustments } from '@/store/useEditorStore';
import { pixelRegistry } from '@/store/pixelStore';
import { workerPool } from '@/workers/workerPool';
import type { OpParams } from '@/workers/colorWorker';
import { FilterAdjustCommand } from '@/history/commands';

export const AdjustmentsPanel: React.FC = memo(() => {
  const activeLayer = useEditorStore((s) => s.layers.find((l) => l.id === s.activeLayerId));
  const docWidth = useEditorStore((s) => s.docWidth);
  const docHeight = useEditorStore((s) => s.docHeight);
  const setLayerAdjustments = useEditorStore((s) => s.setLayerAdjustments);
  const executeCommand = useEditorStore((s) => s.executeCommand);

  const [isProcessing, setIsProcessing] = useState(false);
  const [localValues, setLocalValues] = useState<LayerAdjustments>({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    blur: 0,
    invert: false,
    grayscale: false,
    sepia: false,
  });

  const initialAdjustmentsRef = useRef<LayerAdjustments>({ ...localValues });
  const isDraggingRef = useRef(false);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPreviewJobId = useRef<string | null>(null);

  // Synchronize when activeLayer changes or when adjustments change (e.g. Undo/Redo)
  useEffect(() => {
    if (activeLayer) {
      setLocalValues({ ...activeLayer.adjustments });
      if (!isDraggingRef.current) {
        initialAdjustmentsRef.current = { ...activeLayer.adjustments };
      }
    }
  }, [activeLayer?.id, activeLayer?.adjustments]);

  const commitAdjustments = useCallback(
    async (finalValues: LayerAdjustments) => {
      if (!activeLayer) return;

      setIsProcessing(true);
      try {
        const layerBytes = pixelRegistry.getLayerBytes(activeLayer.id);
        if (layerBytes && layerBytes.byteLength > 0) {
          const { buffer, isShared } = pixelRegistry.getSharedBuffer(activeLayer.id);
          const taskId = `filter-commit-${Date.now()}`;

          const op: OpParams = {
            brightness: finalValues.brightness,
            contrast: finalValues.contrast,
            saturation: finalValues.saturation,
            blur: finalValues.blur,
            invert: finalValues.invert,
            grayscale: finalValues.grayscale,
            sepia: finalValues.sepia,
          };

          const result = await workerPool.runTiled({
            id: taskId,
            buffer,
            isShared,
            width: docWidth,
            height: docHeight,
            op,
          });

          pixelRegistry.commitSharedBuffer(activeLayer.id, result.buffer);
        }

        // Push FilterAdjustCommand for Undo/Redo tracking
        const cmd = new FilterAdjustCommand(
          activeLayer.id,
          initialAdjustmentsRef.current,
          finalValues,
          'Adjust Layer Filters'
        );
        await executeCommand(cmd, true);
        initialAdjustmentsRef.current = { ...finalValues };
      } catch (err) {
        console.error('[AdjustmentsPanel] Error committing adjustments:', err);
      } finally {
        setIsProcessing(false);
      }
    },
    [activeLayer, docWidth, docHeight, executeCommand]
  );

  const handleSliderChange = useCallback(
    (field: keyof LayerAdjustments, value: number) => {
      if (!activeLayer) return;

      const nextValues = { ...localValues, [field]: value };
      setLocalValues(nextValues);

      // Instant live preview
      setLayerAdjustments(activeLayer.id, { [field]: value });

      // Debounce preview 16ms (1 frame)
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }

      previewTimeoutRef.current = setTimeout(async () => {
        if (currentPreviewJobId.current) {
          workerPool.cancel(currentPreviewJobId.current);
        }

        const previewId = `preview-${Date.now()}`;
        currentPreviewJobId.current = previewId;

        try {
          const layerBytes = pixelRegistry.getLayerBytes(activeLayer.id);
          if (layerBytes && layerBytes.byteLength > 0) {
            const { buffer, isShared } = pixelRegistry.getSharedBuffer(activeLayer.id);
            await workerPool.run({
              id: previewId,
              buffer,
              isShared,
              width: docWidth,
              height: docHeight,
              op: {
                brightness: nextValues.brightness,
                contrast: nextValues.contrast,
                saturation: nextValues.saturation,
                blur: nextValues.blur,
                invert: nextValues.invert,
                grayscale: nextValues.grayscale,
                sepia: nextValues.sepia,
              },
            });
          }
        } catch (_) {
          // Cancelled preview ignores gracefully
        }
      }, 16);
    },
    [activeLayer, docWidth, docHeight, localValues, setLayerAdjustments]
  );

  const handlePointerDown = useCallback(() => {
    isDraggingRef.current = true;
    if (activeLayer) {
      initialAdjustmentsRef.current = { ...activeLayer.adjustments };
    }
  }, [activeLayer]);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    commitAdjustments(localValues);
  }, [commitAdjustments, localValues]);

  const handleReset = useCallback(() => {
    if (!activeLayer) return;
    const resetValues: LayerAdjustments = {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      blur: 0,
      invert: false,
      grayscale: false,
      sepia: false,
    };
    setLocalValues(resetValues);
    setLayerAdjustments(activeLayer.id, resetValues);
    commitAdjustments(resetValues);
  }, [activeLayer, commitAdjustments, setLayerAdjustments]);

  if (!activeLayer) return null;

  const { brightness, contrast, saturation, blur } = localValues;

  return (
    <div className="flex flex-col bg-zinc-950 text-xs text-zinc-300 border-t border-zinc-800/80 p-3 select-none">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
          <Sliders className="w-3.5 h-3.5 text-blue-400" />
          <span>Worker CPU / GPU Filters</span>
          {isProcessing && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 ml-1" />
          )}
        </div>
        <button
          onClick={handleReset}
          disabled={isProcessing}
          title="Reset Adjustments"
          className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition cursor-pointer disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        {/* Brightness */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Sun className="w-3 h-3 text-amber-400" /> Brightness
            </span>
            <span className="font-mono text-zinc-300">{Math.round(brightness * 100)}%</span>
          </div>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.02"
            value={brightness}
            onPointerDown={handlePointerDown}
            onChange={(e) => handleSliderChange('brightness', parseFloat(e.target.value))}
            onPointerUp={handlePointerUp}
            className="w-full h-1 bg-zinc-800 rounded-lg cursor-pointer accent-blue-500"
          />
        </div>

        {/* Contrast */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Contrast className="w-3 h-3 text-blue-400" /> Contrast
            </span>
            <span className="font-mono text-zinc-300">{Math.round(contrast * 100)}%</span>
          </div>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.02"
            value={contrast}
            onPointerDown={handlePointerDown}
            onChange={(e) => handleSliderChange('contrast', parseFloat(e.target.value))}
            onPointerUp={handlePointerUp}
            className="w-full h-1 bg-zinc-800 rounded-lg cursor-pointer accent-blue-500"
          />
        </div>

        {/* Saturation */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Droplets className="w-3 h-3 text-pink-400" /> Saturation
            </span>
            <span className="font-mono text-zinc-300">{Math.round(saturation * 100)}%</span>
          </div>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.02"
            value={saturation}
            onPointerDown={handlePointerDown}
            onChange={(e) => handleSliderChange('saturation', parseFloat(e.target.value))}
            onPointerUp={handlePointerUp}
            className="w-full h-1 bg-zinc-800 rounded-lg cursor-pointer accent-blue-500"
          />
        </div>

        {/* Blur */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <CloudFog className="w-3 h-3 text-indigo-400" /> Gaussian Blur
            </span>
            <span className="font-mono text-zinc-300">{Math.round(blur)} px</span>
          </div>
          <input
            type="range"
            min="0"
            max="20"
            step="0.5"
            value={blur}
            onPointerDown={handlePointerDown}
            onChange={(e) => handleSliderChange('blur', parseFloat(e.target.value))}
            onPointerUp={handlePointerUp}
            className="w-full h-1 bg-zinc-800 rounded-lg cursor-pointer accent-blue-500"
          />
        </div>
      </div>
    </div>
  );
});
