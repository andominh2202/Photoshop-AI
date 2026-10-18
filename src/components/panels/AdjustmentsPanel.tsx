import React from 'react';
import { Sliders, RotateCcw, Sun, Contrast, Droplets, CloudFog } from 'lucide-react';
import { useEditorStore } from '@/store/useEditorStore';

export const AdjustmentsPanel: React.FC = () => {
  const { layers, activeLayerId, setLayerAdjustments } = useEditorStore();
  const activeLayer = layers.find((l) => l.id === activeLayerId);

  if (!activeLayer) return null;

  const { brightness, contrast, saturation, blur } = activeLayer.adjustments;

  const handleReset = () => {
    setLayerAdjustments(activeLayer.id, {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      blur: 0,
    });
  };

  return (
    <div className="flex flex-col bg-zinc-950 text-xs text-zinc-300 border-t border-zinc-800/80 p-3 select-none">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
          <Sliders className="w-3.5 h-3.5 text-blue-400" />
          <span>GPU Live Filters</span>
        </div>
        <button
          onClick={handleReset}
          title="Reset Adjustments"
          className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
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
            onChange={(e) =>
              setLayerAdjustments(activeLayer.id, { brightness: parseFloat(e.target.value) })
            }
            className="w-full h-1 bg-zinc-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Contrast */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Contrast className="w-3 h-3 text-cyan-400" /> Contrast
            </span>
            <span className="font-mono text-zinc-300">{Math.round(contrast * 100)}%</span>
          </div>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.02"
            value={contrast}
            onChange={(e) =>
              setLayerAdjustments(activeLayer.id, { contrast: parseFloat(e.target.value) })
            }
            className="w-full h-1 bg-zinc-800 rounded-lg cursor-pointer"
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
            onChange={(e) =>
              setLayerAdjustments(activeLayer.id, { saturation: parseFloat(e.target.value) })
            }
            className="w-full h-1 bg-zinc-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Gaussian Blur */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <CloudFog className="w-3 h-3 text-purple-400" /> Gaussian Blur
            </span>
            <span className="font-mono text-zinc-300">{blur}px</span>
          </div>
          <input
            type="range"
            min="0"
            max="20"
            step="0.5"
            value={blur}
            onChange={(e) =>
              setLayerAdjustments(activeLayer.id, { blur: parseFloat(e.target.value) })
            }
            className="w-full h-1 bg-zinc-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
