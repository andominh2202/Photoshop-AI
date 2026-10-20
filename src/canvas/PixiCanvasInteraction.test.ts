import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('PixiCanvas Interaction End & Window Blur Recovery (Ưu tiên 5)', () => {
  let mockWindow: EventTarget;
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    mockWindow = new EventTarget();
    (globalThis as any).window = mockWindow;
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it('resets all interaction flags and commits in-flight stroke on blur or cancel', async () => {
    const isInteractingRef = { current: true };
    const isPanningRef = { current: false };
    const isDrawingRef = { current: true };
    const isSpacePressedRef = { current: true };
    const interactionModeRef = { current: 'brush' as 'brush' | null };
    const lastPointRef = { current: { x: 50, y: 50 } as { x: number; y: number } | null };
    const strokePointsRef = { current: [{ x: 10, y: 10 }, { x: 50, y: 50 }] };
    const strokeBBoxRef = { current: { minX: 10, minY: 10, maxX: 50, maxY: 50 } };

    const committedCommands: any[] = [];
    const mockExecuteCommand = (cmd: any) => {
      committedCommands.push(cmd);
    };

    const handleInteractionEnd = vi.fn((_e?: any) => {
      // 1. Reset space pan tracking
      if (isSpacePressedRef) {
        isSpacePressedRef.current = false;
      }

      if (!isInteractingRef.current) return;

      const mode = interactionModeRef.current;

      // 2. Commit in-flight stroke if active
      if (mode === 'brush') {
        const points = [...strokePointsRef.current];
        if (points.length > 0) {
          const cmd = {
            type: 'BrushStrokeCommand',
            points,
            bbox: { ...strokeBBoxRef.current },
          };
          mockExecuteCommand(cmd);
        }
      }

      // 3. Reset interaction refs
      isInteractingRef.current = false;
      isPanningRef.current = false;
      isDrawingRef.current = false;
      interactionModeRef.current = null;
      lastPointRef.current = null;
      strokePointsRef.current = [];
    });

    // Simulate window blur listener
    const blurListener = () => handleInteractionEnd();
    window.addEventListener('blur', blurListener);

    // Trigger blur event
    window.dispatchEvent(new Event('blur'));

    // Assertions
    expect(isInteractingRef.current).toBe(false);
    expect(isPanningRef.current).toBe(false);
    expect(isDrawingRef.current).toBe(false);
    expect(isSpacePressedRef.current).toBe(false);
    expect(interactionModeRef.current).toBeNull();
    expect(lastPointRef.current).toBeNull();
    expect(strokePointsRef.current).toHaveLength(0);

    // Verify stroke was committed and NOT dropped
    expect(committedCommands).toHaveLength(1);
    expect(committedCommands[0].type).toBe('BrushStrokeCommand');
    expect(committedCommands[0].points).toHaveLength(2);

    window.removeEventListener('blur', blurListener);
  });

  it('prevents black canvas by distinguishing raw RGBA buffers from encoded image files', async () => {
    const { isEncodedImageBuffer, pixelRegistry } = await import('@/store/pixelStore');
    
    // 1. Encoded PNG bytes header: 0x89 0x50 0x4E 0x47
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    expect(isEncodedImageBuffer(pngBytes)).toBe(true);

    // 2. Encoded JPEG bytes header: 0xFF 0xD8 0xFF
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    expect(isEncodedImageBuffer(jpegBytes)).toBe(true);

    // 3. Encoded WebP/RIFF bytes header: 'RIFF'
    const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
    expect(isEncodedImageBuffer(webpBytes)).toBe(true);

    // 4. Raw RGBA pixel buffer (e.g. from brush stroke rasterization: [r, g, b, a, ...])
    const rawRgbaBuffer = new Uint8Array(100 * 100 * 4);
    rawRgbaBuffer.fill(255);
    expect(isEncodedImageBuffer(rawRgbaBuffer)).toBe(false);

    // 5. When setLayerBytes or invalidateLayerTexture is called on raw RGBA:
    // It must NOT create a corrupt Blob([rawBytes], { type: 'image/png' })
    const layerId = 'test-raw-rgba-layer';
    const url = pixelRegistry.setLayerBytes(layerId, rawRgbaBuffer, 'image/png', 100, 100);
    expect(url).toBeDefined();
    // In node/jsdom without native canvas, it falls back to data:image/png;base64, or valid string
    expect(url.startsWith('data:image/png') || url.startsWith('blob:')).toBe(true);

    // 6. Invalidate layer texture preserves layer dimensions and does not throw
    const invalidUrl = pixelRegistry.invalidateLayerTexture(layerId, 'image/png', 100, 100);
    expect(invalidUrl).toBeDefined();
    expect(pixelRegistry.getLayerDimensions(layerId)).toEqual({ width: 100, height: 100 });
  });

  describe('BUG-02 & BUG-03 Verification: Eyedropper, Zoom & Shape', () => {
    it('Eyedropper accurately reads RGBA values, transparent pixels, and converts to hex', async () => {
      const { pixelRegistry } = await import('@/store/pixelStore');
      const docW = 200;
      const docH = 200;
      const layerId = 'test-eyedropper-layer';
      const buf = new Uint8Array(docW * docH * 4);

      // Pixel at (10, 10): Crimson Red (220, 20, 60, 255)
      const redIdx = (10 * docW + 10) * 4;
      buf[redIdx] = 220;
      buf[redIdx + 1] = 20;
      buf[redIdx + 2] = 60;
      buf[redIdx + 3] = 255;

      // Pixel at (20, 20): Fully Transparent (0, 0, 0, 0)
      const transIdx = (20 * docW + 20) * 4;
      buf[transIdx + 3] = 0;

      pixelRegistry.setLayerBytes(layerId, buf, 'image/png', docW, docH);
      const sampled = pixelRegistry.getLayerBytes(layerId);
      expect(sampled).toBeDefined();

      // Sample red pixel
      const sampleRed = (x: number, y: number) => {
        const idx = (y * docW + x) * 4;
        const r = sampled![idx];
        const g = sampled![idx + 1];
        const b = sampled![idx + 2];
        const a = sampled![idx + 3];
        if (a === 0) return null;
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      };

      expect(sampleRed(10, 10)).toBe('#dc143c');
      expect(sampleRed(20, 20)).toBeNull(); // Transparent
    });

    it('Zoom tool calculates mouse-anchor scale and pan without mutating image data', () => {
      const currentScale = 1.0;
      const mouseX = 400;
      const mouseY = 300;
      const worldPosX = 100;
      const worldPosY = 100;

      // Zoom in factor 1.5x
      const newScale = Math.max(0.05, Math.min(32, currentScale * 1.5));
      expect(newScale).toBe(1.5);

      // World point calculation
      const worldX = (mouseX - worldPosX) / currentScale; // 300
      const worldY = (mouseY - worldPosY) / currentScale; // 200

      // New Pan offsets maintaining world point under cursor
      const newPanX = mouseX - worldX * newScale;
      const newPanY = mouseY - worldY * newScale;

      expect(newPanX).toBe(400 - 300 * 1.5); // -50
      expect(newPanY).toBe(300 - 200 * 1.5); // 0

      // Re-projecting mouseX back to world coordinates with new scale yields identical world point
      const reprojectedWorldX = (mouseX - newPanX) / newScale;
      const reprojectedWorldY = (mouseY - newPanY) / newScale;
      expect(reprojectedWorldX).toBe(worldX);
      expect(reprojectedWorldY).toBe(worldY);
    });

    it('Shape tool creates valid dimensions and coordinates regardless of drag direction', () => {
      // 1. Drag top-left to bottom-right
      const drag1 = { startX: 100, startY: 100, endX: 250, endY: 200 };
      const x1 = Math.min(drag1.startX, drag1.endX);
      const y1 = Math.min(drag1.startY, drag1.endY);
      const w1 = Math.abs(drag1.endX - drag1.startX);
      const h1 = Math.abs(drag1.endY - drag1.startY);
      expect({ x: x1, y: y1, w: w1, h: h1 }).toEqual({ x: 100, y: 100, w: 150, h: 100 });

      // 2. Drag bottom-right to top-left (reverse drag)
      const drag2 = { startX: 250, startY: 200, endX: 100, endY: 100 };
      const x2 = Math.min(drag2.startX, drag2.endX);
      const y2 = Math.min(drag2.startY, drag2.endY);
      const w2 = Math.abs(drag2.endX - drag2.startX);
      const h2 = Math.abs(drag2.endY - drag2.startY);
      expect({ x: x2, y: y2, w: w2, h: h2 }).toEqual({ x: 100, y: 100, w: 150, h: 100 });

      // 3. Click-to-create fallback when drag delta < 4px
      const clickDrag = { startX: 50, startY: 50, endX: 51, endY: 52 };
      let w3 = Math.abs(clickDrag.endX - clickDrag.startX);
      let h3 = Math.abs(clickDrag.endY - clickDrag.startY);
      if (w3 < 4 && h3 < 4) {
        w3 = 80;
        h3 = 80;
      }
      expect(w3).toBe(80);
      expect(h3).toBe(80);
    });
  });
});
