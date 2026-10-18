import React, { useEffect } from 'react';
import { TopMenuBar } from '@/components/layout/TopMenuBar';
import { ToolOptionsBar } from '@/components/layout/ToolOptionsBar';
import { Toolbar } from '@/components/layout/Toolbar';
import { PixiCanvas } from '@/canvas/PixiCanvas';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { NewDocumentModal } from '@/components/modals/NewDocumentModal';
import { ExportModal } from '@/components/modals/ExportModal';
import { useEditorStore } from '@/store/useEditorStore';

export const App: React.FC = () => {
  const {
    undo,
    redo,
    setNewDocModalOpen,
    setExportModalOpen,
    duplicateLayer,
    activeLayerId,
    clearSelection,
    resetView,
    setActiveTool,
    swapColors,
    invertLayerColors,
    moveLayerUp,
    moveLayerDown,
    deleteActiveLayer,
  } = useEditorStore();

  // Global Photoshop Hotkeys Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }

      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      if (ctrlOrCmd) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          redo();
        } else if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          setNewDocModalOpen(true);
        } else if (e.key === 'e' || e.key === 'E') {
          if (e.shiftKey) {
            e.preventDefault();
            setExportModalOpen(true);
          }
        } else if (e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          if (activeLayerId) duplicateLayer(activeLayerId);
        } else if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          clearSelection();
        } else if (e.key === '0') {
          e.preventDefault();
          resetView();
        } else if (e.key === 'i' || e.key === 'I') {
          e.preventDefault();
          if (activeLayerId) invertLayerColors(activeLayerId);
        } else if (e.key === ']') {
          e.preventDefault();
          if (activeLayerId) moveLayerUp(activeLayerId);
        } else if (e.key === '[') {
          e.preventDefault();
          if (activeLayerId) moveLayerDown(activeLayerId);
        } else if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          setActiveTool('move');
        }
      } else {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          deleteActiveLayer();
          return;
        }

        // Single Key Photoshop Tools
        switch (e.key.toLowerCase()) {
          case 'v':
            setActiveTool('move');
            break;
          case 'm':
            setActiveTool('marquee');
            break;
          case 'w':
            setActiveTool('wand');
            break;
          case 'c':
            setActiveTool('crop');
            break;
          case 'i':
            setActiveTool('eyedropper');
            break;
          case 'b':
            setActiveTool('brush');
            break;
          case 'e':
            setActiveTool('eraser');
            break;
          case 'g':
            setActiveTool('paint-bucket');
            break;
          case 't':
            setActiveTool('text');
            break;
          case 'u':
            setActiveTool('shape');
            break;
          case 'h':
            setActiveTool('hand');
            break;
          case 'z':
            setActiveTool('zoom');
            break;
          case 'x':
            swapColors();
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    undo,
    redo,
    setNewDocModalOpen,
    setExportModalOpen,
    duplicateLayer,
    activeLayerId,
    clearSelection,
    resetView,
    setActiveTool,
    swapColors,
    invertLayerColors,
    moveLayerUp,
    moveLayerDown,
    deleteActiveLayer,
  ]);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-zinc-950 text-zinc-100 select-none">
      {/* 1. Photoshop Desktop Top Menu Bar */}
      <TopMenuBar />

      {/* 2. Contextual Tool Options Bar */}
      <ToolOptionsBar />

      {/* 3. Main Workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Left Vertical Tool Palette */}
        <Toolbar />

        {/* Center Canvas Viewport */}
        <main className="flex-1 relative h-full overflow-hidden">
          <PixiCanvas />
        </main>

        {/* Right Dockable Inspector (Layers, History & Adjustments) */}
        <RightSidebar />
      </div>

      {/* 4. Bottom Diagnostics & Engine Status Bar */}
      <StatusBar />

      {/* 5. Photoshop Modals */}
      <NewDocumentModal />
      <ExportModal />
    </div>
  );
};

export default App;
