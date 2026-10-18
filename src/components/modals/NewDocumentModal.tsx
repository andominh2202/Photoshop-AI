import React, { useState } from 'react';
import { X, Sparkles, Monitor, Smartphone, Image as ImageIcon, Printer } from 'lucide-react';
import { useEditorStore } from '@/store/useEditorStore';

interface Preset {
  name: string;
  width: number;
  height: number;
  dpi: number;
  icon: React.ComponentType<{ className?: string }>;
}

const PRESETS: Preset[] = [
  { name: 'Full HD Web (1080p)', width: 1920, height: 1080, dpi: 72, icon: Monitor },
  { name: '4K Ultra HD', width: 3840, height: 2160, dpi: 150, icon: Monitor },
  { name: 'Instagram Square', width: 1080, height: 1080, dpi: 72, icon: ImageIcon },
  { name: 'TikTok / Story (9:16)', width: 1080, height: 1920, dpi: 72, icon: Smartphone },
  { name: 'A4 Print (300 DPI)', width: 2480, height: 3508, dpi: 300, icon: Printer },
];

export const NewDocumentModal: React.FC = () => {
  const { isNewDocModalOpen, setNewDocModalOpen, createNewDocument } = useEditorStore();

  const [title, setTitle] = useState('Untitled-1.psai');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [dpi, setDpi] = useState(300);
  const [background, setBackground] = useState<'white' | 'black' | 'transparent'>('white');

  if (!isNewDocModalOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createNewDocument(width, height, dpi, title, background);
  };

  const applyPreset = (preset: Preset) => {
    setWidth(preset.width);
    setHeight(preset.height);
    setDpi(preset.dpi);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden text-zinc-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
              Ps
            </div>
            <h2 className="text-sm font-semibold">New Document</h2>
          </div>
          <button
            onClick={() => setNewDocModalOpen(false)}
            className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleCreate} className="p-5 space-y-5">
          {/* Presets */}
          <div>
            <label className="text-xs text-zinc-400 font-medium block mb-2">
              Preset Templates
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESETS.map((p) => {
                const Icon = p.icon;
                const isSelected = width === p.width && height === p.height;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600/15 border-blue-500 text-blue-200'
                        : 'bg-zinc-800/40 border-zinc-700/60 hover:bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-blue-400 mb-1" />
                    <span className="text-xs font-medium truncate w-full">{p.name}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {p.width} × {p.height}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Document Properties */}
          <div className="space-y-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800">
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Document Name</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Width (px)</label>
                <input
                  type="number"
                  min="64"
                  max="16384"
                  value={width}
                  onChange={(e) => setWidth(parseInt(e.target.value) || 100)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Height (px)</label>
                <input
                  type="number"
                  min="64"
                  max="16384"
                  value={height}
                  onChange={(e) => setHeight(parseInt(e.target.value) || 100)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Resolution (DPI)</label>
                <input
                  type="number"
                  min="72"
                  max="1200"
                  value={dpi}
                  onChange={(e) => setDpi(parseInt(e.target.value) || 72)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Background Content */}
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1.5">Background Contents</label>
              <div className="flex gap-2">
                {(['white', 'transparent', 'black'] as const).map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    onClick={() => setBackground(bg)}
                    className={`flex-1 py-1.5 px-3 rounded-lg border text-xs capitalize transition cursor-pointer font-medium ${
                      background === bg
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {bg}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setNewDocModalOpen(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:bg-zinc-800 cursor-pointer transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 cursor-pointer transition"
            >
              Create Canvas
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
