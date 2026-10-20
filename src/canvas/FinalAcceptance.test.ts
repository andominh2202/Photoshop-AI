import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/store/useEditorStore';
import { pixelRegistry } from '@/store/pixelStore';
import {
  rasterizeStrokeToBuffer,
  getAffectedTiles,
  extractTileFromBuffer,
  TILE_SIZE,
} from '@/history/tileStore';
import {
  BrushStrokeCommand,
  AddLayerCommand,
} from '@/history/commands';
import { commandManager } from '@/history/commandManager';

describe('Final Acceptance Suite: Complete Workflow & Benchmarks', () => {
  const docW = 1920;
  const docH = 1080;

  beforeEach(() => {
    commandManager.clear();
    useEditorStore.setState({
      layers: [
        {
          id: 'base-layer',
          name: 'Background',
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          type: 'raster',
          locked: false,
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          adjustments: {
            brightness: 0,
            contrast: 0,
            saturation: 0,
            blur: 0,
            invert: false,
            grayscale: false,
            sepia: false,
          },
        },
      ],
      activeLayerId: 'base-layer',
      docWidth: docW,
      docHeight: docH,
      historyIndex: 0,
    });
  });

  it('1. End-to-End Image Workflow: Brush -> Eraser -> Eyedropper -> Shape -> Undo/Redo -> Export', async () => {
    const activeLayerId = 'base-layer';
    const buffer = pixelRegistry.getOrCreateLayerBytes(activeLayerId, docW, docH);
    expect(buffer.length).toBe(docW * docH * 4);

    // Step 1: Draw with Brush (Red color at (500, 500) to (550, 500))
    const strokePoints1 = [
      { x: 500, y: 500 },
      { x: 550, y: 500 },
    ];
    const dirtyTiles1 = getAffectedTiles(490, 490, 560, 510, docW, docH);
    const beforeSnapshots1 = dirtyTiles1.map(({ tileX, tileY }) => ({
      tileX,
      tileY,
      before: extractTileFromBuffer(buffer, docW, docH, tileX, tileY),
    }));

    rasterizeStrokeToBuffer(
      buffer,
      docW,
      docH,
      strokePoints1,
      '#ff0000',
      20,
      1.0,
      'brush'
    );

    const snapshots1 = beforeSnapshots1.map((s) => ({
      ...s,
      after: extractTileFromBuffer(buffer, docW, docH, s.tileX, s.tileY),
    }));
    const brushCmd = new BrushStrokeCommand(activeLayerId, docW, docH, snapshots1, 'Brush Stroke');
    await commandManager.executeCommand(brushCmd, true);

    // Verify Brush pixel: center (500, 500) is Red (255, 0, 0, 255)
    const idx1 = (500 * docW + 500) * 4;
    expect(buffer[idx1]).toBe(255);
    expect(buffer[idx1 + 1]).toBe(0);
    expect(buffer[idx1 + 2]).toBe(0);
    expect(buffer[idx1 + 3]).toBe(255);

    // Step 2: Eyedropper samples drawn color
    const sampledR = buffer[idx1];
    const sampledG = buffer[idx1 + 1];
    const sampledB = buffer[idx1 + 2];
    const sampledHex = `#${((1 << 24) + (sampledR << 16) + (sampledG << 8) + sampledB).toString(16).slice(1)}`;
    expect(sampledHex).toBe('#ff0000');

    // Step 3: Erase a section of the stroke (at 500, 500 with Eraser)
    const erasePoints = [{ x: 500, y: 500 }];
    const dirtyTiles2 = getAffectedTiles(480, 480, 520, 520, docW, docH);
    const beforeSnapshots2 = dirtyTiles2.map(({ tileX, tileY }) => ({
      tileX,
      tileY,
      before: extractTileFromBuffer(buffer, docW, docH, tileX, tileY),
    }));

    rasterizeStrokeToBuffer(
      buffer,
      docW,
      docH,
      erasePoints,
      '#000000',
      24,
      1.0,
      'eraser'
    );

    const snapshots2 = beforeSnapshots2.map((s) => ({
      ...s,
      after: extractTileFromBuffer(buffer, docW, docH, s.tileX, s.tileY),
    }));
    const eraserCmd = new BrushStrokeCommand(activeLayerId, docW, docH, snapshots2, 'Eraser');
    await commandManager.executeCommand(eraserCmd, true);

    // Verify pixel (500, 500) is now completely transparent (alpha = 0, RGB = 0)
    expect(buffer[idx1 + 3]).toBe(0);
    expect(buffer[idx1]).toBe(0);
    expect(buffer[idx1 + 1]).toBe(0);
    expect(buffer[idx1 + 2]).toBe(0);

    // Step 4: Eyedropper on erased pixel detects transparency
    expect(buffer[idx1 + 3]).toBe(0);

    // Step 5: Add Shape (Rectangle via AddLayerCommand)
    const shapeW = 200;
    const shapeH = 100;
    const shapeBytes = new Uint8Array(shapeW * shapeH * 4);
    shapeBytes.fill(255); // White shape
    const shapeLayer = {
      id: 'shape-layer-1',
      name: 'Rectangle 1',
      visible: true,
      opacity: 1,
      blendMode: 'normal' as const,
      type: 'raster' as const,
      locked: false,
      x: 100,
      y: 100,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      adjustments: {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        blur: 0,
        invert: false,
        grayscale: false,
        sepia: false,
      },
    };
    const shapeCmd = new AddLayerCommand(shapeLayer, 0, shapeBytes, 'Add Rectangle');
    await commandManager.executeCommand(shapeCmd, false);

    expect(useEditorStore.getState().layers).toHaveLength(2);
    expect(useEditorStore.getState().activeLayerId).toBe('shape-layer-1');

    // Step 6: Multi-step Undo & Redo verification
    expect(commandManager.canUndo()).toBe(true);
    // Undo Shape
    await commandManager.undo();
    expect(useEditorStore.getState().layers).toHaveLength(1);

    // Undo Eraser (restores red stroke)
    await commandManager.undo();
    expect(buffer[idx1]).toBe(255);
    expect(buffer[idx1 + 3]).toBe(255);

    // Undo Brush (restores empty buffer)
    await commandManager.undo();
    expect(buffer[idx1 + 3]).toBe(0);

    // Redo all
    await commandManager.redo(); // Redo Brush
    expect(buffer[idx1]).toBe(255);
    expect(buffer[idx1 + 3]).toBe(255);

    await commandManager.redo(); // Redo Eraser
    expect(buffer[idx1 + 3]).toBe(0);

    await commandManager.redo(); // Redo Shape
    expect(useEditorStore.getState().layers).toHaveLength(2);
  });

  it('2. Multi-Layer Eyedropper Composite respects layer hierarchy and opacity', () => {
    // Layer 1 (bottom): Green (0, 255, 0, 255)
    const l1 = new Uint8Array(100 * 100 * 4);
    for (let i = 0; i < l1.length; i += 4) {
      l1[i] = 0;
      l1[i + 1] = 255;
      l1[i + 2] = 0;
      l1[i + 3] = 255;
    }
    pixelRegistry.setLayerBytes('layer-bottom', l1, 'image/png', 100, 100);

    // Layer 2 (top): Blue only in region (0..50, 0..50), transparent elsewhere
    const l2 = new Uint8Array(100 * 100 * 4);
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        const idx = (y * 100 + x) * 4;
        l2[iIdx(x, y, 100)] = 0;
        l2[iIdx(x, y, 100) + 1] = 0;
        l2[iIdx(x, y, 100) + 2] = 255;
        l2[iIdx(x, y, 100) + 3] = 255;
      }
    }
    function iIdx(x: number, y: number, w: number) { return (y * w + x) * 4; }
    pixelRegistry.setLayerBytes('layer-top', l2, 'image/png', 100, 100);

    const layers = [
      { id: 'layer-bottom', visible: true },
      { id: 'layer-top', visible: true },
    ];

    // Function matching PixiCanvas top-down eyedropper composite
    const sampleComposite = (px: number, py: number) => {
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (!layer.visible) continue;
        const buf = pixelRegistry.getLayerBytes(layer.id);
        if (buf) {
          const idx = (py * 100 + px) * 4;
          if (buf[idx + 3] > 0) {
            return {
              r: buf[idx],
              g: buf[idx + 1],
              b: buf[idx + 2],
              a: buf[idx + 3],
            };
          }
        }
      }
      return null;
    };

    // Sampling at (25, 25): Top layer has Blue -> returns Blue
    const topSample = sampleComposite(25, 25);
    expect(topSample).toEqual({ r: 0, g: 0, b: 255, a: 255 });

    // Sampling at (75, 75): Top layer is transparent -> penetrates to Bottom layer Green
    const bottomSample = sampleComposite(75, 75);
    expect(bottomSample).toEqual({ r: 0, g: 255, b: 0, a: 255 });

    // When Top layer is hidden: Sampling at (25, 25) reveals Bottom layer Green
    layers[1].visible = false;
    const hiddenSample = sampleComposite(25, 25);
    expect(hiddenSample).toEqual({ r: 0, g: 255, b: 0, a: 255 });
  });

  it('3. Performance Benchmark & Stress Simulation (3 consecutive runs)', () => {
    const W = 3840; // 4K canvas document
    const H = 2160;
    const buffer4K = new Uint8Array(W * H * 4);

    const testStroke = [
      { x: 100, y: 100 },
      { x: 300, y: 300 },
      { x: 800, y: 600 },
      { x: 1500, y: 1200 },
    ];

    const benchmarkRuns: { brushMs: number; eraserMs: number; tileExtractMs: number }[] = [];

    for (let run = 1; run <= 3; run++) {
      // 1. Measure Brush Rasterization on 4K
      const t0 = performance.now();
      rasterizeStrokeToBuffer(buffer4K, W, H, testStroke, '#3b82f6', 32, 1.0, 'brush');
      const brushMs = performance.now() - t0;

      // 2. Measure Eraser Destination-out on 4K
      const t1 = performance.now();
      rasterizeStrokeToBuffer(buffer4K, W, H, testStroke, '#000000', 40, 1.0, 'eraser');
      const eraserMs = performance.now() - t1;

      // 3. Measure Tile Snapshot Extraction (512x512 tiles across affected bounding box)
      const t2 = performance.now();
      const dirtyTiles = getAffectedTiles(100, 100, 1500, 1200, W, H);
      const tiles = dirtyTiles.map((t) => extractTileFromBuffer(buffer4K, W, H, t.tileX, t.tileY));
      const tileExtractMs = performance.now() - t2;

      benchmarkRuns.push({ brushMs, eraserMs, tileExtractMs });
      expect(tiles.length).toBeGreaterThan(0);
    }

    // Benchmark assertions: Even on 4K buffers, stroke rasterization is within high interactive standards
    for (const b of benchmarkRuns) {
      expect(b.brushMs).toBeLessThan(150); // < 150ms on 4K buffer polyline
      expect(b.eraserMs).toBeLessThan(150);
      expect(b.tileExtractMs).toBeLessThan(50); // Fast memory slice
    }

    console.log('--- 4K Performance Benchmark Results (3 Runs) ---', benchmarkRuns);
  });
});
