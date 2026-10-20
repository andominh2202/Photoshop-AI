import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Plus,
  Layers,
  Copy,
  ArrowDownToLine,
  SlidersHorizontal,
  Type,
  ChevronUp,
  ChevronDown,
  Edit2,
  Check,
  PaintBucket,
} from 'lucide-react';
import { useEditorStore, BlendModeType, LayerItem } from '@/store/useEditorStore';
import { useVirtualizer } from '@tanstack/react-virtual';

const BLEND_MODES: { value: BlendModeType; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'difference', label: 'Difference' },
];

interface LayerRowProps {
  layer: LayerItem;
  isActive: boolean;
  isEditing: boolean;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onStartRename: (id: string, name: string) => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
  onRemove: (id: string) => void;
}

// Memoized individual layer row: only re-renders when its own layer data or active state changes
const LayerRow = memo<LayerRowProps>(
  ({
    layer,
    isActive,
    isEditing,
    onSelect,
    onToggleVisibility,
    onToggleLock,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onRemove,
  }) => {
    const [localName, setLocalName] = useState(layer.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (isEditing) {
        setLocalName(layer.name);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 10);
      }
    }, [isEditing, layer.name]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onCommitRename(localName);
      } else if (e.key === 'Escape') {
        onCancelRename();
      }
    };

    return (
      <div
        onClick={() => onSelect(layer.id)}
        className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer h-[48px] select-none ${
          isActive
            ? 'bg-blue-600/20 border-blue-500/50 text-zinc-100 shadow-sm'
            : 'bg-zinc-900/60 border-zinc-800/60 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
        }`}
      >
        {/* Visibility Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(layer.id);
          }}
          className="p-1 hover:text-zinc-100 rounded cursor-pointer shrink-0"
          title={layer.visible ? 'Hide layer' : 'Show layer'}
        >
          {layer.visible ? (
            <Eye className="w-3.5 h-3.5 text-zinc-300" />
          ) : (
            <EyeOff className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </button>

        {/* Lock Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock(layer.id);
          }}
          className="p-1 hover:text-zinc-100 rounded cursor-pointer shrink-0"
          title={layer.locked ? 'Unlock layer' : 'Lock layer'}
        >
          {layer.locked ? (
            <Lock className="w-3 h-3 text-amber-500" />
          ) : (
            <Unlock className="w-3 h-3 text-zinc-600 opacity-30 hover:opacity-100" />
          )}
        </button>

        {/* Layer Thumbnail */}
        <div className="w-8 h-8 rounded bg-zinc-800 border border-zinc-700/60 overflow-hidden flex items-center justify-center shrink-0 checkerboard-pattern">
          {layer.type === 'text' ? (
            <Type className="w-4 h-4 text-blue-400" />
          ) : layer.textureUrl ? (
            <img
              src={layer.textureUrl}
              alt={layer.name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <SlidersHorizontal className="w-4 h-4 text-zinc-500" />
          )}
        </div>

        {/* Layer Title (Double Click to Rename) */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {isEditing ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                ref={inputRef}
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={() => onCommitRename(localName)}
                onKeyDown={handleKeyDown}
                className="w-full bg-zinc-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
              />
              <button
                onClick={() => onCommitRename(localName)}
                className="p-1 bg-blue-600 rounded text-white hover:bg-blue-500 cursor-pointer shrink-0"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div
              onDoubleClick={() => onStartRename(layer.id, layer.name)}
              className="flex items-center justify-between"
            >
              <span
                className="truncate font-medium text-[12px] hover:text-blue-300"
                title="Double click to rename"
              >
                {layer.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartRename(layer.id, layer.name);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-zinc-100 text-zinc-500 cursor-pointer shrink-0"
                title="Rename Layer"
              >
                <Edit2 className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
          <span className="text-[10px] text-zinc-500 capitalize">
            {layer.blendMode} • {Math.round(layer.opacity * 100)}%
          </span>
        </div>

        {/* Delete Layer Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(layer.id);
          }}
          className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition cursor-pointer shrink-0"
          title="Delete Layer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }
);

export const LayerPanel: React.FC = memo(() => {
  // Narrow selectors: isolated subscriptions
  const layers = useEditorStore((s) => s.layers);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const brushColor = useEditorStore((s) => s.brushColor);

  // Stable action references (never cause re-render)
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const addLayer = useEditorStore((s) => s.addLayer);
  const addTextLayer = useEditorStore((s) => s.addTextLayer);
  const duplicateLayer = useEditorStore((s) => s.duplicateLayer);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const renameLayer = useEditorStore((s) => s.renameLayer);
  const moveLayerUp = useEditorStore((s) => s.moveLayerUp);
  const moveLayerDown = useEditorStore((s) => s.moveLayerDown);
  const mergeDown = useEditorStore((s) => s.mergeDown);
  const toggleLayerVisibility = useEditorStore((s) => s.toggleLayerVisibility);
  const toggleLayerLock = useEditorStore((s) => s.toggleLayerLock);
  const setLayerOpacity = useEditorStore((s) => s.setLayerOpacity);
  const setLayerBlendMode = useEditorStore((s) => s.setLayerBlendMode);
  const updateLayerText = useEditorStore((s) => s.updateLayerText);
  const fillActiveLayer = useEditorStore((s) => s.fillActiveLayer);
  const invertLayerColors = useEditorStore((s) => s.invertLayerColors);
  const desaturateLayer = useEditorStore((s) => s.desaturateLayer);

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const activeLayer = layers.find((l) => l.id === activeLayerId) || layers[0];

  // Virtualizer for smooth 60 FPS scrolling with large layer counts (up to 100+ layers)
  const rowVirtualizer = useVirtualizer({
    count: layers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 4,
  });

  const handleStartRename = useCallback((id: string) => {
    setEditingLayerId(id);
  }, []);

  const handleCommitRename = useCallback(
    (name: string) => {
      if (editingLayerId && name.trim()) {
        renameLayer(editingLayerId, name.trim());
      }
      setEditingLayerId(null);
    },
    [editingLayerId, renameLayer]
  );

  const handleCancelRename = useCallback(() => {
    setEditingLayerId(null);
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-xs text-zinc-300 select-none">
      {/* 1. Panel Header */}
      <div className="px-3 py-2 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40 shrink-0">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
          <Layers className="w-4 h-4 text-blue-400" />
          <span>Layers</span>
          <span className="text-[11px] font-mono text-zinc-500 font-normal">
            ({layers.length})
          </span>
        </div>

        {/* Quick layer action buttons */}
        {activeLayer && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => moveLayerUp(activeLayer.id)}
              title="Move Layer Up (Ctrl+])"
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => moveLayerDown(activeLayer.id)}
              title="Move Layer Down (Ctrl+[)"
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-3 bg-zinc-800 mx-0.5" />
            <button
              onClick={() => duplicateLayer(activeLayer.id)}
              title="Duplicate Layer (Ctrl+J)"
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => mergeDown(activeLayer.id)}
              title="Merge Down (Ctrl+E)"
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 2. Layer Options: Blend Mode & Opacity */}
      {activeLayer && (
        <div className="p-3 border-b border-zinc-800/80 space-y-2.5 bg-zinc-900/30 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-400 font-medium">Blend Mode</span>
            <select
              value={activeLayer.blendMode}
              onChange={(e) => setLayerBlendMode(activeLayer.id, e.target.value as BlendModeType)}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {BLEND_MODES.map((bm) => (
                <option key={bm.value} value={bm.value}>
                  {bm.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-400 font-medium">Opacity</span>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={activeLayer.opacity}
                onChange={(e) => setLayerOpacity(activeLayer.id, parseFloat(e.target.value))}
                className="w-24 h-1 bg-zinc-800 rounded-lg cursor-pointer"
              />
              <span className="font-mono text-[11px] w-9 text-right text-zinc-300">
                {Math.round(activeLayer.opacity * 100)}%
              </span>
            </div>
          </div>

          {/* If Active Layer is a Text Layer, allow direct text edit */}
          {activeLayer.type === 'text' && (
            <div className="pt-2 border-t border-zinc-800/60">
              <label className="text-[10px] text-zinc-400 block mb-1 font-medium">
                Edit Text Content:
              </label>
              <input
                type="text"
                value={activeLayer.text || ''}
                onChange={(e) => updateLayerText(activeLayer.id, e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
                placeholder="Type your text..."
              />
            </div>
          )}
        </div>
      )}

      {/* 3. Virtualized Layers Stack List */}
      <div ref={parentRef} className="flex-1 overflow-y-auto p-2">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const layer = layers[virtualRow.index];
            if (!layer) return null;

            return (
              <div
                key={layer.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <LayerRow
                  layer={layer}
                  isActive={layer.id === activeLayerId}
                  isEditing={editingLayerId === layer.id}
                  onSelect={setActiveLayer}
                  onToggleVisibility={toggleLayerVisibility}
                  onToggleLock={toggleLayerLock}
                  onStartRename={handleStartRename}
                  onCommitRename={handleCommitRename}
                  onCancelRename={handleCancelRename}
                  onRemove={removeLayer}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Quick Layer Actions: Invert, B&W, Fill */}
      {activeLayer && (
        <div className="px-3 py-1.5 border-t border-zinc-800/60 bg-zinc-900/30 flex items-center justify-between text-[11px] shrink-0">
          <span className="text-zinc-500">Quick FX:</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fillActiveLayer(brushColor)}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 cursor-pointer"
              title="Fill Layer with Current Color (Shift+F5)"
            >
              <PaintBucket className="w-3 h-3 text-amber-400" />
              <span>Fill</span>
            </button>
            <button
              onClick={() => invertLayerColors(activeLayer.id)}
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 cursor-pointer"
              title="Invert Colors (Ctrl+I)"
            >
              Invert
            </button>
            <button
              onClick={() => desaturateLayer(activeLayer.id)}
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 cursor-pointer"
              title="Desaturate (Ctrl+Shift+U)"
            >
              B&W
            </button>
          </div>
        </div>
      )}

      {/* 5. Photoshop Standard Panel Footer Controls */}
      <div className="p-2 border-t border-zinc-800/80 flex items-center justify-between bg-zinc-900/50 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (activeLayer) removeLayer(activeLayer.id);
            }}
            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded cursor-pointer transition"
            title="Delete Selected Layer (Delete)"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (activeLayer) duplicateLayer(activeLayer.id);
            }}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded cursor-pointer transition"
            title="Duplicate Layer (Ctrl+J)"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => addTextLayer('PhotoshopAI Text')}
            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded border border-zinc-700/60 cursor-pointer font-medium transition"
            title="Add Type Layer"
          >
            <Type className="w-3.5 h-3.5 text-blue-400" />
            <span>Type</span>
          </button>
          <button
            onClick={() => addLayer()}
            className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs rounded shadow-sm cursor-pointer font-medium transition"
            title="Create New Blank Layer (Ctrl+Shift+N)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Layer</span>
          </button>
        </div>
      </div>
    </div>
  );
});
