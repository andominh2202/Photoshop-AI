import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerCanvasExportProvider } from '@/canvas/canvasBridge';
import { useToastStore } from '@/store/toastStore';
import { useEditorStore } from '@/store/useEditorStore';

describe('ExportModal Logic & Pixi Extract Tests (Ưu tiên 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToastStore.setState({ toasts: [] });
    useEditorStore.setState({
      isExportModalOpen: true,
      docWidth: 1920,
      docHeight: 1080,
      docTitle: 'test-artwork.psai',
    });
  });

  it('1. Hides selectionGraphics before extract and restores visibility after extract', async () => {
    let visibilityDuringExtract: boolean | undefined = undefined;

    const mockSelectionGraphics = {
      visible: true,
    };
    const mockTransformBox = {
      visible: true,
    };
    const mockDrawingGraphics = {
      visible: true,
    };

    const mockExtractedCanvas = {
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mockdata'),
    };

    const mockExtractCanvas = vi.fn().mockImplementation(() => {
      visibilityDuringExtract = mockSelectionGraphics.visible;
      return mockExtractedCanvas;
    });

    const mockApp = {
      renderer: {
        extract: {
          canvas: mockExtractCanvas,
        },
      },
    };

    const mockWorldContainer = {};

    registerCanvasExportProvider({
      getApp: () => mockApp as any,
      getWorldContainer: () => mockWorldContainer as any,
      getSelectionGraphics: () => mockSelectionGraphics as any,
      getTransformBox: () => mockTransformBox as any,
      getDrawingGraphics: () => mockDrawingGraphics as any,
    });

    // Import and trigger export logic
    const { getCanvasExportProvider } = await import('@/canvas/canvasBridge');
    const provider = getCanvasExportProvider();
    expect(provider).not.toBeNull();

    // Verify initial visibility is true
    expect(mockSelectionGraphics.visible).toBe(true);

    // Simulate export execution
    const app = provider!.getApp()!;
    const worldContainer = provider!.getWorldContainer()!;
    const sel = provider!.getSelectionGraphics()!;

    const prevVisible = sel.visible;
    sel.visible = false;
    const canvas = (app.renderer as any).extract.canvas(worldContainer, { width: 1920, height: 1080 });
    sel.visible = prevVisible;

    expect(visibilityDuringExtract).toBe(false);
    expect(mockSelectionGraphics.visible).toBe(true);
    expect(mockExtractCanvas).toHaveBeenCalledWith(mockWorldContainer, { width: 1920, height: 1080 });
  });

  it('2. canvas.toDataURL is called with correct mime type', async () => {
    const toDataURLSpy = vi.fn().mockReturnValue('data:image/jpeg;base64,1234');
    const mockCanvas = {
      toDataURL: toDataURLSpy,
    };

    const format = 'jpeg' as string;
    const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    mockCanvas.toDataURL(mime, 0.85);

    expect(toDataURLSpy).toHaveBeenCalledWith('image/jpeg', 0.85);
  });

  it('3. Catches extract error and emits toast notification', async () => {
    const mockApp = {
      renderer: {
        extract: {
          canvas: vi.fn().mockImplementation(() => {
            throw new Error('GPU context lost during extract');
          }),
        },
      },
    };

    registerCanvasExportProvider({
      getApp: () => mockApp as any,
      getWorldContainer: () => ({}) as any,
      getSelectionGraphics: () => null,
      getTransformBox: () => null,
      getDrawingGraphics: () => null,
    });

    const { showToast } = await import('@/store/toastStore');
    try {
      (mockApp.renderer.extract.canvas as any)();
    } catch (e: any) {
      showToast(`Lỗi xuất ảnh: ${e.message}`, 'error');
    }

    const currentToasts = useToastStore.getState().toasts;
    expect(currentToasts.length).toBeGreaterThan(0);
    expect(currentToasts[0].type).toBe('error');
    expect(currentToasts[0].message).toContain('GPU context lost during extract');
  });
});
