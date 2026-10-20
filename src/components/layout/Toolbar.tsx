import React, { memo } from 'react';
import {
  MousePointer2,
  Scan,
  Wand2,
  Crop,
  Pipette,
  Paintbrush,
  Eraser,
  PaintBucket,
  Type,
  Square,
  Sparkles,
  Bandage,
  Hand,
  ZoomIn,
  ArrowRightLeft,
} from 'lucide-react';
import { useEditorStore, ToolType } from '@/store/useEditorStore';

interface ToolDef {
  id: ToolType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hotkey: string;
  isAi?: boolean;
}

const TOOLS: ToolDef[] = [
  { id: 'move', label: 'Move Tool', icon: MousePointer2, hotkey: 'V' },
  { id: 'marquee', label: 'Rectangular Marquee', icon: Scan, hotkey: 'M' },
  { id: 'wand', label: 'Magic Wand & AI Select', icon: Wand2, hotkey: 'W', isAi: true },
  { id: 'crop', label: 'Crop Tool', icon: Crop, hotkey: 'C' },
  { id: 'eyedropper', label: 'Eyedropper Tool', icon: Pipette, hotkey: 'I' },
  { id: 'brush', label: 'Brush Tool', icon: Paintbrush, hotkey: 'B' },
  { id: 'eraser', label: 'Eraser Tool', icon: Eraser, hotkey: 'E' },
  { id: 'paint-bucket', label: 'Paint Bucket Tool', icon: PaintBucket, hotkey: 'G' },
  { id: 'text', label: 'Horizontal Type Tool', icon: Type, hotkey: 'T' },
  { id: 'shape', label: 'Rectangle & Shape Tool', icon: Square, hotkey: 'U' },
  { id: 'ai-rmbg', label: 'AI Background Removal', icon: Sparkles, hotkey: 'R', isAi: true },
  { id: 'ai-inpaint', label: 'AI Inpaint & Healing Brush', icon: Bandage, hotkey: 'J', isAi: true },
  { id: 'hand', label: 'Hand Tool (Pan)', icon: Hand, hotkey: 'H' },
  { id: 'zoom', label: 'Zoom Tool', icon: ZoomIn, hotkey: 'Z' },
];

export const Toolbar: React.FC = memo(() => {
  // Narrow selectors: only re-render when activeTool or palette colors change
  const activeTool = useEditorStore((s) => s.activeTool);
  const brushColor = useEditorStore((s) => s.brushColor);
  const secondaryColor = useEditorStore((s) => s.secondaryColor);

  // Stable actions
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const setBrushColor = useEditorStore((s) => s.setBrushColor);
  const swapColors = useEditorStore((s) => s.swapColors);

  return (
    <aside
      role="toolbar"
      aria-label="Công cụ thiết kế Photoshop AI"
      className="w-12 bg-zinc-950 border-r border-zinc-800/80 flex flex-col items-center py-2 justify-between select-none z-20"
    >
      {/* Tool Palette Icons */}
      <div className="flex flex-col items-center gap-1 w-full px-1 overflow-y-auto" role="group" aria-label="Danh sách công cụ">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;

          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              aria-label={`${tool.label} (Phím tắt: ${tool.hotkey})`}
              aria-pressed={isActive}
              title={`${tool.label} (${tool.hotkey})`}
              className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 ring-1 ring-blue-400/50'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850'
              }`}
            >
              <Icon className="w-4 h-4" />

              {/* AI Badge indicator */}
              {tool.isAi && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              )}

              {/* Hotkey small label in bottom-right corner */}
              <span className="absolute bottom-0.5 right-1 text-[8px] font-mono text-zinc-500 group-hover:text-zinc-300" aria-hidden="true">
                {tool.hotkey}
              </span>
            </button>
          );
        })}
      </div>

      {/* Photoshop Color Swatches (Foreground / Background) */}
      <div className="flex flex-col items-center gap-2 pt-2 border-t border-zinc-800/80 w-full px-1" role="group" aria-label="Bảng màu vẽ">
        <div className="relative w-8 h-8 flex items-center justify-center">
          {/* Secondary / Background Color Box */}
          <div
            className="absolute bottom-0 right-0 w-5 h-5 rounded border border-zinc-700 shadow-sm z-0"
            style={{ backgroundColor: secondaryColor }}
            title={`Màu phụ: ${secondaryColor}`}
            aria-label={`Màu phụ: ${secondaryColor}`}
          />

          {/* Primary / Foreground Color Box with native picker */}
          <label
            className="absolute top-0 left-0 w-5 h-5 rounded border border-zinc-600 shadow-md cursor-pointer z-10 overflow-hidden hover:scale-105 transition"
            title={`Màu chính: ${brushColor}`}
          >
            <input
              type="color"
              aria-label={`Chọn màu vẽ chính, hiện tại là ${brushColor}`}
              value={brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              className="opacity-0 w-0 h-0 cursor-pointer"
            />
            <div className="w-full h-full" style={{ backgroundColor: brushColor }} />
          </label>
        </div>

        {/* Swap Colors Icon (X hotkey) */}
        <button
          onClick={swapColors}
          aria-label="Đổi màu chính và màu phụ (Phím tắt: X)"
          title="Switch Foreground and Background Colors (X)"
          className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <ArrowRightLeft className="w-3 h-3 rotate-45" />
        </button>
      </div>
    </aside>
  );
});
