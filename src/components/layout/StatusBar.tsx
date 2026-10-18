import React from 'react';
import { useEditorStore } from '@/store/useEditorStore';
import { Activity, ShieldCheck, Zap } from 'lucide-react';

export const StatusBar: React.FC = () => {
  const { docWidth, docHeight, dpi, fps, zoom, activeTool } = useEditorStore();

  return (
    <footer className="h-6 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between px-3 text-[11px] text-zinc-400 select-none z-30 font-mono">
      {/* Left: Document Info */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-zinc-300">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          <span>{docWidth} × {docHeight} px</span>
          <span className="text-zinc-600">|</span>
          <span>{dpi} DPI</span>
        </span>
        <span className="text-zinc-500">sRGB (RGBA 8-bit)</span>
      </div>

      {/* Center: Active Tool & Mode */}
      <div className="flex items-center gap-2 text-zinc-400">
        <span className="capitalize font-sans font-medium text-zinc-300">
          Tool: {activeTool}
        </span>
        <span className="text-zinc-600">|</span>
        <span className="text-zinc-400 font-sans flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>Non-Destructive Stack</span>
        </span>
      </div>

      {/* Right: Engine & Performance */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-zinc-400">
          <Zap className="w-3 h-3 text-amber-400" />
          <span>Zero-Copy IPC: Active</span>
        </span>
        <span className="text-zinc-600">|</span>
        <span className="flex items-center gap-1 text-emerald-400 font-semibold">
          <Activity className="w-3 h-3" />
          <span>{fps} FPS (WebGPU Target 120)</span>
        </span>
        <span className="text-zinc-600">|</span>
        <span className="text-zinc-300">{Math.round(zoom * 100)}%</span>
      </div>
    </footer>
  );
};
