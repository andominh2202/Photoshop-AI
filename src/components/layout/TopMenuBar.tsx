import React, { useState, useRef, useEffect } from 'react';
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  FolderOpen,
  Cpu,
  Layers,
  Sparkles,
  FilePlus,
  ChevronDown,
  Ruler,
} from 'lucide-react';
import { useEditorStore } from '@/store/useEditorStore';

export const TopMenuBar: React.FC = () => {
  const {
    docTitle,
    zoom,
    setZoom,
    resetView,
    toggleRulers,
    showRulers,
    undo,
    redo,
    history,
    historyIndex,
    fps,
    gpuBackend,
    setNewDocModalOpen,
    setExportModalOpen,
    addLayer,
    duplicateLayer,
    activeLayerId,
    invertLayerColors,
    desaturateLayer,
    clearSelection,
  } = useEditorStore();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Handle outside clicks to close dropdown menus
  useEffect(() => {
    const handleClickOutside = () => setOpenMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleOpenLocalImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      const reader = new FileReader();
      reader.onload = () => {
        const bytes = new Uint8Array(reader.result as ArrayBuffer);
        addLayer({
          name: file.name.replace(/\.[^/.]+$/, ''),
          textureUrl: url,
          data: bytes,
        }, `Open ${file.name}`);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  return (
    <header className="h-10 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between px-3 text-xs text-zinc-300 select-none z-40">
      {/* Hidden file input for Open Image */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleOpenLocalImage}
        accept="image/*"
        className="hidden"
      />

      {/* Left: Brand & Dropdown Menus */}
      <div className="flex items-center gap-3">
        {/* PhotoshopAI Iconic Logo */}
        <div className="flex items-center gap-2 font-bold tracking-tight text-zinc-100 pr-2 border-r border-zinc-800">
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-blue-700 via-blue-600 to-cyan-400 flex items-center justify-center text-white shadow-sm font-bold text-xs">
            Ps
          </div>
          <span className="font-bold text-[13px] tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            PhotoshopAI
          </span>
          <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-400 font-mono font-semibold border border-blue-500/30">
            PRO
          </span>
        </div>

        {/* Dropdown Menu Bars */}
        <nav className="flex items-center space-x-0.5 relative">
          {/* 1. File Menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === 'file' ? null : 'file');
              }}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-medium ${
                openMenu === 'file' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/80'
              }`}
            >
              File
            </button>
            {openMenu === 'file' && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-2xl py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    setNewDocModalOpen(true);
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>New...</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+N</span>
                </button>
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>Open Image...</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+O</span>
                </button>
                <div className="h-px bg-zinc-800 my-1" />
                <button
                  onClick={() => {
                    setExportModalOpen(true);
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>Export As...</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+Shift+E</span>
                </button>
              </div>
            )}
          </div>

          {/* 2. Edit Menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === 'edit' ? null : 'edit');
              }}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-medium ${
                openMenu === 'edit' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/80'
              }`}
            >
              Edit
            </button>
            {openMenu === 'edit' && (
              <div className="absolute left-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-2xl py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    undo();
                    setOpenMenu(null);
                  }}
                  disabled={!canUndo}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white disabled:opacity-40 flex items-center justify-between cursor-pointer"
                >
                  <span>Undo</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+Z</span>
                </button>
                <button
                  onClick={() => {
                    redo();
                    setOpenMenu(null);
                  }}
                  disabled={!canRedo}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white disabled:opacity-40 flex items-center justify-between cursor-pointer"
                >
                  <span>Redo</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+Y</span>
                </button>
                <div className="h-px bg-zinc-800 my-1" />
                <button
                  onClick={() => {
                    clearSelection();
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>Deselect</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+D</span>
                </button>
              </div>
            )}
          </div>

          {/* 3. Image Menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === 'image' ? null : 'image');
              }}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-medium ${
                openMenu === 'image' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/80'
              }`}
            >
              Image
            </button>
            {openMenu === 'image' && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-2xl py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    if (activeLayerId) invertLayerColors(activeLayerId);
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>Invert Colors</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+I</span>
                </button>
                <button
                  onClick={() => {
                    if (activeLayerId) desaturateLayer(activeLayerId);
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>Desaturate (Grayscale)</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+Shift+U</span>
                </button>
              </div>
            )}
          </div>

          {/* 4. Layer Menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === 'layer' ? null : 'layer');
              }}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-medium ${
                openMenu === 'layer' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/80'
              }`}
            >
              Layer
            </button>
            {openMenu === 'layer' && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-2xl py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    addLayer();
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>New Layer...</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+Shift+N</span>
                </button>
                <button
                  onClick={() => {
                    if (activeLayerId) duplicateLayer(activeLayerId);
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>Duplicate Layer</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+J</span>
                </button>
              </div>
            )}
          </div>

          {/* 5. View Menu */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === 'view' ? null : 'view');
              }}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-medium ${
                openMenu === 'view' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/80'
              }`}
            >
              View
            </button>
            {openMenu === 'view' && (
              <div className="absolute left-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-2xl py-1 z-50 text-xs">
                <button
                  onClick={() => {
                    toggleRulers();
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>{showRulers ? 'Hide Rulers' : 'Show Rulers'}</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+R</span>
                </button>
                <button
                  onClick={() => {
                    resetView();
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>Fit on Screen</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+0</span>
                </button>
                <button
                  onClick={() => {
                    setZoom(1.0);
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>100% Zoom</span>
                  <span className="text-zinc-500 text-[10px] font-mono">Ctrl+1</span>
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* Center: Quick Zoom & Undo/Redo Pill */}
      <div className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800 px-2 py-0.5 rounded-lg">
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-3 bg-zinc-800 mx-1" />

        <button
          onClick={() => setZoom((z) => z * 0.85)}
          title="Zoom Out"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="font-mono text-[11px] text-zinc-300 px-1.5 min-w-[42px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => z * 1.15)}
          title="Zoom In"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={resetView}
          title="Fit Canvas to Screen (Ctrl+0)"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={toggleRulers}
          title="Toggle Rulers (Ctrl+R)"
          className={`p-1 rounded transition cursor-pointer ${
            showRulers ? 'bg-blue-600/20 text-blue-400' : 'text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          <Ruler className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: Engine Indicator & Export */}
      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-zinc-400">
          <Cpu className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-mono">{gpuBackend}</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono font-medium border border-emerald-500/20">
            {fps} FPS
          </span>
        </div>

        <button
          onClick={() => setExportModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded text-white font-medium transition cursor-pointer shadow-sm shadow-blue-500/20"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
