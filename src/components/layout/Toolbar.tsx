import React from 'react';
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
  { id: 'hand', label: 'Hand Tool (Pan)', icon: Hand, hotkey: 'H' },
  { id: 'zoom', label: 'Zoom Tool', icon: ZoomIn, hotkey: 'Z' },
];

export const Toolbar: React.FC = () => {
  const {
    activeTool,
    setActiveTool,
    brushColor,
    setBrushColor,
    secondaryColor,
    swapColors,
  } = useEditorStore();

  return (
    <aside className="w-12 bg-zinc-950 border-r border-zinc-800/80 flex flex-col items-center py-2 justify-between select-none z-20">
      {/* Tool Palette Icons */}
      <div className="flex flex-col items-center gap-1 w-full px-1 overflow-y-auto">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;

          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              title={`${tool.label} (${tool.hotkey})`}
              className={`relative group w-8 h-8 rounded-md flex items-center justify-center transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-400/50'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tool.isAi && (
                <span className="absolute 1 top-1 right-1 w-1.5 h-1.5 rounded-full bg-cyan-400" />
              )}

              {/* Photoshop style tooltip */}
              <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-900 border border-zinc-700/80 rounded text-[11px] text-zinc-200 whitespace-nowrap shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{tool.label}</span>
                  <span className="px-1 py-0.2 bg-zinc-800 rounded font-mono text-[10px] text-zinc-400">
                    {tool.hotkey}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Photoshop Color Swatches (Foreground & Background with Swap) */}
      <div className="flex flex-col items-center pt-2 border-t border-zinc-800/80 w-full">
        <div className="relative w-8 h-8 mb-1">
          {/* Secondary / Background color */}
          <div
            className="absolute bottom-0 right-0 w-5 h-5 rounded border border-zinc-700 shadow-sm"
            style={{ backgroundColor: secondaryColor }}
            title="Background Color"
          />
          {/* Primary / Foreground color */}
          <input
            type="color"
            value={brushColor}
            onChange={(e) => setBrushColor(e.target.value)}
            className="absolute top-0 left-0 w-5 h-5 rounded border border-zinc-700 cursor-pointer p-0 opacity-100"
            title="Foreground Color (Click to change)"
          />
          {/* Swap Colors button */}
          <button
            onClick={swapColors}
            title="Switch Foreground and Background Colors (X)"
            className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 cursor-pointer border border-zinc-700"
          >
            <ArrowRightLeft className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
