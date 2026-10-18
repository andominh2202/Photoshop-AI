import React from 'react';
import {
  Paintbrush,
  Eraser,
  Type,
  Square,
  Sparkles,
  MousePointer2,
  Sliders,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Circle,
  X,
  Layers,
  Wand2,
} from 'lucide-react';
import { useEditorStore } from '@/store/useEditorStore';

export const ToolOptionsBar: React.FC = () => {
  const {
    activeTool,
    brushSize,
    setBrushSize,
    brushHardness,
    setBrushHardness,
    brushOpacity,
    setBrushOpacity,
    brushColor,
    setBrushColor,
    textFont,
    setTextFont,
    textSize,
    setTextSize,
    shapeType,
    setShapeType,
    selection,
    clearSelection,
    addTextLayer,
    aiState,
  } = useEditorStore();

  return (
    <div className="h-9 bg-zinc-900 border-b border-zinc-800 flex items-center px-3 text-xs text-zinc-300 gap-4 select-none overflow-x-auto z-25">
      {/* Tool Identity badge */}
      <div className="flex items-center gap-1.5 font-medium text-zinc-200 shrink-0 pr-2 border-r border-zinc-800">
        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
        <span className="capitalize text-[12px]">{activeTool} Tool</span>
      </div>

      {/* 1. Brush & Eraser Options */}
      {(activeTool === 'brush' || activeTool === 'eraser') && (
        <div className="flex items-center gap-4 shrink-0">
          {/* Size */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400">Size:</span>
            <input
              type="range"
              min="1"
              max="200"
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              className="w-20 h-1 bg-zinc-800 rounded cursor-pointer"
            />
            <span className="font-mono text-[11px] text-zinc-200 w-8">{brushSize}px</span>
          </div>

          {/* Hardness */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400">Hardness:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={brushHardness}
              onChange={(e) => setBrushHardness(parseFloat(e.target.value))}
              className="w-16 h-1 bg-zinc-800 rounded cursor-pointer"
            />
            <span className="font-mono text-[11px] text-zinc-200 w-8">
              {Math.round(brushHardness * 100)}%
            </span>
          </div>

          {/* Opacity */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400">Opacity:</span>
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={brushOpacity}
              onChange={(e) => setBrushOpacity(parseFloat(e.target.value))}
              className="w-16 h-1 bg-zinc-800 rounded cursor-pointer"
            />
            <span className="font-mono text-[11px] text-zinc-200 w-8">
              {Math.round(brushOpacity * 100)}%
            </span>
          </div>

          {/* Color for Brush */}
          {activeTool === 'brush' && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-800">
              <span className="text-[11px] text-zinc-400">Color:</span>
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="w-5 h-5 rounded border border-zinc-700 cursor-pointer p-0"
              />
            </div>
          )}
        </div>
      )}

      {/* 2. Type / Text Tool Options */}
      {activeTool === 'text' && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-zinc-400">Font:</span>
          <select
            value={textFont}
            onChange={(e) => setTextFont(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-[11px] text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="Inter">Inter</option>
            <option value="Roboto">Roboto</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Impact">Impact</option>
          </select>

          <span className="text-[11px] text-zinc-400">Size:</span>
          <input
            type="number"
            min="12"
            max="180"
            value={textSize}
            onChange={(e) => setTextSize(parseInt(e.target.value) || 24)}
            className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px] font-mono text-zinc-200 text-center"
          />
          <span className="text-[10px] text-zinc-500">pt</span>

          <button
            onClick={() => addTextLayer('PhotoshopAI Text', 400, 300)}
            className="flex items-center gap-1 px-2.5 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-medium transition cursor-pointer shadow-sm"
          >
            <Type className="w-3 h-3" />
            <span>Add Text Box</span>
          </button>
        </div>
      )}

      {/* 3. Shape Tool Options */}
      {activeTool === 'shape' && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-zinc-400">Shape:</span>
          <div className="flex items-center bg-zinc-800 rounded p-0.5 border border-zinc-700">
            <button
              onClick={() => setShapeType('rectangle')}
              className={`p-1 rounded ${shapeType === 'rectangle' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="Rectangle"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShapeType('ellipse')}
              className={`p-1 rounded ${shapeType === 'ellipse' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="Ellipse / Circle"
            >
              <Circle className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-zinc-400">Fill:</span>
            <input
              type="color"
              value={brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              className="w-5 h-5 rounded border border-zinc-700 cursor-pointer p-0"
            />
          </div>
        </div>
      )}

      {/* 4. Marquee Selection Options */}
      {activeTool === 'marquee' && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-zinc-400">Marquee:</span>
          <span className="text-[11px] text-zinc-300">Click & Drag on canvas to select area</span>
          {selection && (
            <button
              onClick={clearSelection}
              className="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] border border-zinc-700 transition cursor-pointer"
            >
              <X className="w-3 h-3 text-red-400" />
              <span>Deselect (Ctrl+D)</span>
            </button>
          )}
        </div>
      )}

      {/* 5. AI RMBG & AI Inpaint Options */}
      {(activeTool === 'ai-rmbg' || activeTool === 'ai-inpaint') && (
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-blue-400 font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[11px]">Model: Bria RMBG-1.4 (ONNX DirectML)</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-300 rounded border border-blue-500/20 font-mono">
            Zero-Copy IPC
          </span>
        </div>
      )}

      {/* 6. Move Tool Options */}
      {activeTool === 'move' && (
        <div className="flex items-center gap-4 shrink-0 text-[11px] text-zinc-400">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded border-zinc-700" />
            <span>Show Transform Handles</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded border-zinc-700" />
            <span>Auto-Select Layer</span>
          </label>
        </div>
      )}
    </div>
  );
};
