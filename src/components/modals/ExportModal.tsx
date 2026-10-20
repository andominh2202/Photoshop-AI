import React, { useState, memo } from 'react';
import { X, Download, FileImage, Check } from 'lucide-react';
import { useEditorStore } from '@/store/useEditorStore';
import { getCanvasExportProvider } from '@/canvas/canvasBridge';
import { showToast } from '@/store/toastStore';

export const ExportModal: React.FC = memo(() => {
  const isExportModalOpen = useEditorStore((s) => s.isExportModalOpen);
  const setExportModalOpen = useEditorStore((s) => s.setExportModalOpen);
  const docTitle = useEditorStore((s) => s.docTitle);
  const docWidth = useEditorStore((s) => s.docWidth);
  const docHeight = useEditorStore((s) => s.docHeight);
  const backgroundColor = useEditorStore((s) => s.backgroundColor);

  const [filename, setFilename] = useState(docTitle.replace('.psai', ''));
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [quality, setQuality] = useState(0.92);
  const [isExporting, setIsExporting] = useState(false);

  if (!isExportModalOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);

    const provider = getCanvasExportProvider();
    const app = provider?.getApp();
    const worldContainer = provider?.getWorldContainer();

    if (!provider || !app || !worldContainer) {
      showToast('Không tìm thấy khung vẽ Pixi để xuất ảnh', 'error');
      setIsExporting(false);
      return;
    }

    const selectionGfx = provider.getSelectionGraphics();
    const transformBox = provider.getTransformBox();
    const drawingGfx = provider.getDrawingGraphics();
    const artboardBg = provider.getArtboardBg?.() || null;

    // 1. Temporarily hide UI overlays and artboard background (if transparent) before render extraction
    const prevSelectionVisible = selectionGfx ? selectionGfx.visible : false;
    const prevTransformVisible = transformBox ? transformBox.visible : false;
    const prevDrawingVisible = drawingGfx ? drawingGfx.visible : false;
    const prevArtboardVisible = artboardBg ? artboardBg.visible : true;

    if (selectionGfx) selectionGfx.visible = false;
    if (transformBox) transformBox.visible = false;
    if (drawingGfx) drawingGfx.visible = false;
    if (artboardBg && backgroundColor === 'transparent' && (format === 'png' || format === 'webp')) {
      artboardBg.visible = false;
    }

    try {
      // 2. Extract canvas with exact document dimensions
      interface ExtractableRenderer {
        extract?: {
          canvas: (
            target: unknown,
            options?: { width?: number; height?: number }
          ) => HTMLCanvasElement | Promise<HTMLCanvasElement>;
        };
      }

      const renderer = app.renderer as unknown as ExtractableRenderer;

      if (!renderer?.extract || typeof renderer.extract.canvas !== 'function') {
        throw new Error('Tính năng app.renderer.extract.canvas không khả dụng');
      }

      const canvasOrPromise = renderer.extract.canvas(worldContainer, {
        width: docWidth,
        height: docHeight,
      });

      const extractedCanvas =
        canvasOrPromise instanceof Promise ? await canvasOrPromise : canvasOrPromise;

      if (!extractedCanvas || typeof extractedCanvas.toDataURL !== 'function') {
        throw new Error('Canvas trích xuất không hợp lệ');
      }

      let finalCanvas = extractedCanvas;
      if (format === 'jpeg') {
        const bgCanvas = document.createElement('canvas');
        bgCanvas.width = extractedCanvas.width;
        bgCanvas.height = extractedCanvas.height;
        const bgCtx = bgCanvas.getContext('2d');
        if (bgCtx) {
          bgCtx.fillStyle = '#ffffff';
          bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
          bgCtx.drawImage(extractedCanvas, 0, 0);
          finalCanvas = bgCanvas;
        }
      }

      // 3. Generate data URL & trigger download
      const mime =
        format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';
      const dataUrl = finalCanvas.toDataURL(mime, quality);

      const link = document.createElement('a');
      link.download = `${filename}.${format}`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast(`Đã xuất ảnh thành công: ${filename}.${format}`, 'success');
      setExportModalOpen(false);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Lỗi không xác định khi xuất ảnh';
      console.error('[ExportModal] Export failed:', err);
      showToast(`Lỗi xuất ảnh: ${errMsg}`, 'error');
    } finally {
      // 4. Restore visible states of all UI layers
      if (selectionGfx) selectionGfx.visible = prevSelectionVisible;
      if (transformBox) transformBox.visible = prevTransformVisible;
      if (drawingGfx) drawingGfx.visible = prevDrawingVisible;
      if (artboardBg) artboardBg.visible = prevArtboardVisible;

      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-zinc-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold">Export Image</h2>
          </div>
          <button
            onClick={() => setExportModalOpen(false)}
            className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">File Name</label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 block mb-1.5">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormat(fmt)}
                  className={`py-2 px-3 rounded-lg border text-xs uppercase font-mono font-medium transition cursor-pointer text-center ${
                    format === fmt
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  .{fmt}
                </button>
              ))}
            </div>
          </div>

          {format !== 'png' && (
            <div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                <span>Quality</span>
                <span className="font-mono text-zinc-200">{Math.round(quality * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={quality}
                onChange={(e) => setQuality(parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded cursor-pointer"
              />
            </div>
          )}

          <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/80 text-[11px] text-zinc-400 space-y-1 font-mono">
            <div className="flex justify-between">
              <span>Canvas Size:</span>
              <span className="text-zinc-200">{docWidth} × {docHeight} px</span>
            </div>
            <div className="flex justify-between">
              <span>Color Space:</span>
              <span className="text-zinc-200">sRGB 8-bit</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setExportModalOpen(false)}
            className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:bg-zinc-800 cursor-pointer transition"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 cursor-pointer transition disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Exporting...' : 'Export File'}</span>
          </button>
        </div>
      </div>
    </div>
  );
});
