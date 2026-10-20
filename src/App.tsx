import React, { useEffect, Suspense, lazy } from 'react';
import { UpdateNotificationBanner } from '@/components/layout/UpdateNotificationBanner';
import { TopMenuBar } from '@/components/layout/TopMenuBar';
import { ToolOptionsBar } from '@/components/layout/ToolOptionsBar';
import { Toolbar } from '@/components/layout/Toolbar';
import { PixiCanvas } from '@/canvas/PixiCanvas';
import { RightSidebar } from '@/components/layout/RightSidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { useEditorStore } from '@/store/useEditorStore';

import { ToastContainer } from '@/components/common/ToastContainer';

import { KeyboardProvider, useKeyboardContext } from '@/context/KeyboardContext';

// Code-split modals via React.lazy to reduce initial bundle evaluation overhead
const NewDocumentModal = lazy(() =>
  import('@/components/modals/NewDocumentModal').then((m) => ({ default: m.NewDocumentModal }))
);
const ExportModal = lazy(() =>
  import('@/components/modals/ExportModal').then((m) => ({ default: m.ExportModal }))
);
const InpaintingModal = lazy(() =>
  import('@/components/modals/InpaintingModal').then((m) => ({ default: m.InpaintingModal }))
);

const AppContent: React.FC = () => {
  const { isSpacePressedRef } = useKeyboardContext();

  // Global Photoshop Hotkeys Listener: use store.getState() to avoid subscribing App to any state
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

      // Track Spacebar for temporary pan mode without preventing default in text fields
      if (e.code === 'Space' || e.key === ' ') {
        if (isSpacePressedRef.current !== undefined) {
          (isSpacePressedRef as React.MutableRefObject<boolean>).current = true;
        }
      }

      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      const state = useEditorStore.getState();

      if (ctrlOrCmd) {
        // 1. Ctrl/Cmd + S: Prevent OS save HTML dialog and open export dialog
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          e.stopPropagation();
          state.setExportModalOpen(true);
          return;
        }

        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            state.redo();
          } else {
            state.undo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          state.redo();
        } else if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          state.setNewDocModalOpen(true);
        } else if (e.key === 'e' || e.key === 'E') {
          if (e.shiftKey) {
            e.preventDefault();
            state.setExportModalOpen(true);
          }
        } else if (e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          if (state.activeLayerId) state.duplicateLayer(state.activeLayerId);
        } else if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          state.clearSelection();
        } else if (e.key === '0') {
          e.preventDefault();
          state.resetView();
        } else if (e.key === 'i' || e.key === 'I') {
          e.preventDefault();
          if (state.activeLayerId) state.invertLayerColors(state.activeLayerId);
        } else if (e.key === ']') {
          e.preventDefault();
          if (state.activeLayerId) state.moveLayerUp(state.activeLayerId);
        } else if (e.key === '[') {
          e.preventDefault();
          if (state.activeLayerId) state.moveLayerDown(state.activeLayerId);
        } else if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          state.setActiveTool('move');
        }
      } else {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          state.deleteActiveLayer();
          return;
        }

        // 2. Brush size hotkeys: [ to decrease, ] to increase (1 to 500)
        if (e.key === '[') {
          e.preventDefault();
          const current = state.brushSize;
          const next = Math.max(1, current <= 10 ? current - 1 : current <= 50 ? current - 5 : current - 10);
          state.setBrushSize(next);
          return;
        }
        if (e.key === ']') {
          e.preventDefault();
          const current = state.brushSize;
          const next = Math.min(500, current < 10 ? current + 1 : current < 50 ? current + 5 : current + 10);
          state.setBrushSize(next);
          return;
        }

        // Single Key Photoshop Tools
        switch (e.key.toLowerCase()) {
          case 'v':
            state.setActiveTool('move');
            break;
          case 'm':
            state.setActiveTool('marquee');
            break;
          case 'w':
            state.setActiveTool('wand');
            break;
          case 'c':
            state.setActiveTool('crop');
            break;
          case 'i':
            state.setActiveTool('eyedropper');
            break;
          case 'b':
            state.setActiveTool('brush');
            break;
          case 'e':
            state.setActiveTool('eraser');
            break;
          case 'g':
            state.setActiveTool('paint-bucket');
            break;
          case 't':
            state.setActiveTool('text');
            break;
          case 'u':
            state.setActiveTool('shape');
            break;
          case 'r':
            state.setActiveTool('ai-rmbg');
            break;
          case 'j':
            state.setActiveTool('ai-inpaint');
            break;
          case 'h':
            state.setActiveTool('hand');
            break;
          case 'z':
            state.setActiveTool('zoom');
            break;
          case 'x':
            state.swapColors();
            break;
          default:
            break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        if (isSpacePressedRef.current !== undefined) {
          (isSpacePressedRef as React.MutableRefObject<boolean>).current = false;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressedRef]);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-zinc-950 text-zinc-100 select-none">
      {/* 0. Non-blocking Auto-Update Notification Banner */}
      <UpdateNotificationBanner />

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

      {/* 5. Photoshop Modals (Lazy Loaded) */}
      <Suspense fallback={null}>
        <NewDocumentModal />
        <ExportModal />
        <InpaintingModal />
      </Suspense>

      {/* 6. Global User Feedback Toasts */}
      <ToastContainer />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <KeyboardProvider>
      <AppContent />
    </KeyboardProvider>
  );
};

export default App;
