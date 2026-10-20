import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TILE_SIZE,
  TILE_BYTE_SIZE,
  tileBufferPool,
  getAffectedTiles,
  extractTileFromBuffer,
  writeTileToBuffer,
  rasterizeStrokeToBuffer,
  createTileSnapshot,
  disposeTileSnapshot,
} from './tileStore';
import {
  MoveCommand,
  FilterAdjustCommand,
  BrushStrokeCommand,
  AddLayerCommand,
  DeleteLayerCommand,
  AIResultCommand,
} from './commands';
import { commandManager } from './commandManager';
import { pixelRegistry } from '@/store/pixelStore';
import { useEditorStore, LayerItem } from '@/store/useEditorStore';

describe('Step 4: Command Pattern, Tile Delta & VRAM Memory Management', () => {
  beforeEach(() => {
    tileBufferPool.clear();
    commandManager.clear();
    pixelRegistry.clearAll();
    useEditorStore.getState().createNewDocument(1024, 1024, 300, 'TestDoc.psai');
  });

  describe('1. Tile Delta & Buffer Pool Architecture', () => {
    it('acquires and releases 1MB buffers without memory leak', () => {
      expect(tileBufferPool.getPoolCount()).toBe(0);

      const buf1 = tileBufferPool.acquire();
      expect(buf1.byteLength).toBe(TILE_BYTE_SIZE);
      expect(tileBufferPool.getPoolCount()).toBe(0);

      tileBufferPool.release(buf1);
      expect(tileBufferPool.getPoolCount()).toBe(1);

      // Re-acquiring should reuse the recycled buffer from the pool
      const buf2 = tileBufferPool.acquire();
      expect(buf2).toBe(buf1);
      expect(tileBufferPool.getPoolCount()).toBe(0);
    });

    it('calculates affected 512x512 tiles from bounding box accurately', () => {
      // Stroke within top-left tile (0, 0)
      const tiles1 = getAffectedTiles(10, 10, 100, 100, 2048, 2048);
      expect(tiles1).toEqual([{ tileX: 0, tileY: 0 }]);

      // Stroke crossing boundary from tile (0,0) to tile (1,1)
      const tiles2 = getAffectedTiles(450, 450, 550, 550, 2048, 2048);
      expect(tiles2).toHaveLength(4);
      expect(tiles2).toContainEqual({ tileX: 0, tileY: 0 });
      expect(tiles2).toContainEqual({ tileX: 1, tileY: 0 });
      expect(tiles2).toContainEqual({ tileX: 0, tileY: 1 });
      expect(tiles2).toContainEqual({ tileX: 1, tileY: 1 });
    });

    it('extracts and writes 512x512 tiles row by row into image buffer', () => {
      const imgWidth = 1024;
      const imgHeight = 1024;
      const fullBuffer = new Uint8Array(imgWidth * imgHeight * 4);

      // Fill a small region inside tile (0, 0)
      fullBuffer[0] = 255; // R
      fullBuffer[1] = 128; // G
      fullBuffer[2] = 64;  // B
      fullBuffer[3] = 255; // A

      const tile = extractTileFromBuffer(fullBuffer, imgWidth, imgHeight, 0, 0);
      expect(tile[0]).toBe(255);
      expect(tile[1]).toBe(128);
      expect(tile[2]).toBe(64);
      expect(tile[3]).toBe(255);

      // Mutate tile and write back
      tile[0] = 42;
      writeTileToBuffer(fullBuffer, imgWidth, imgHeight, 0, 0, tile);
      expect(fullBuffer[0]).toBe(42);

      tileBufferPool.release(tile);
    });

    it('rasterizeStrokeToBuffer draws line onto buffer deterministically', () => {
      const width = 200;
      const height = 200;
      const buffer = new Uint8Array(width * height * 4);

      // Draw a line with brush
      rasterizeStrokeToBuffer(
        buffer,
        width,
        height,
        [
          { x: 50, y: 50 },
          { x: 60, y: 50 },
        ],
        '#ff0000',
        10,
        1.0
      );

      // Pixel at (50, 50) should be colored red (RGBA: 255, 0, 0, 255)
      const idx = (50 * width + 50) * 4;
      expect(buffer[idx]).toBe(255); // Red
      expect(buffer[idx + 1]).toBe(0);
      expect(buffer[idx + 2]).toBe(0);
      expect(buffer[idx + 3]).toBe(255); // Alpha
    });

    it('rasterizeStrokeToBuffer in eraser mode reduces alpha to 0 for true transparency', () => {
      const width = 100;
      const height = 100;
      const buffer = new Uint8Array(width * height * 4);

      // Pre-fill canvas with solid blue (RGBA: 0, 0, 255, 255)
      for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = 0;
        buffer[i + 1] = 0;
        buffer[i + 2] = 255;
        buffer[i + 3] = 255;
      }

      // Erase at (50, 50) with size 16 and 100% opacity
      rasterizeStrokeToBuffer(
        buffer,
        width,
        height,
        [{ x: 50, y: 50 }],
        '#000000',
        16,
        1.0,
        'eraser'
      );

      // Center pixel at (50, 50) must have alpha = 0 (true transparent, NOT painted white)
      const centerIdx = (50 * width + 50) * 4;
      expect(buffer[centerIdx + 3]).toBe(0);
      expect(buffer[centerIdx]).toBe(0);
      expect(buffer[centerIdx + 1]).toBe(0);
      expect(buffer[centerIdx + 2]).toBe(0);

      // Pixels outside brush radius (e.g. at 10, 10) must remain unaffected blue
      const outsideIdx = (10 * width + 10) * 4;
      expect(buffer[outsideIdx + 2]).toBe(255);
      expect(buffer[outsideIdx + 3]).toBe(255);
    });

    it('rasterizeStrokeToBuffer partial opacity eraser reduces alpha proportionally without painting color', () => {
      const width = 100;
      const height = 100;
      const buffer = new Uint8Array(width * height * 4);

      // Fill with solid red
      for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = 255;
        buffer[i + 1] = 0;
        buffer[i + 2] = 0;
        buffer[i + 3] = 200;
      }

      // Erase with 50% opacity
      rasterizeStrokeToBuffer(
        buffer,
        width,
        height,
        [{ x: 50, y: 50 }],
        '#000000',
        20,
        0.5,
        'eraser'
      );

      const centerIdx = (50 * width + 50) * 4;
      // Alpha must be reduced from 200, strictly greater than 0 and less than 200
      expect(buffer[centerIdx + 3]).toBeLessThan(200);
      expect(buffer[centerIdx + 3]).toBeGreaterThanOrEqual(70);
      // Untouched pixel
      const farIdx = (5 * width + 5) * 4;
      expect(buffer[farIdx + 3]).toBe(200);
    });
  });

  describe('2. Concrete Command Implementations', () => {
    it('MoveCommand swaps position metadata without touching pixel bytes', async () => {
      const layerId = useEditorStore.getState().activeLayerId;
      const cmd = new MoveCommand(layerId, 0, 0, 150, 250);

      await cmd.execute();
      let layer = useEditorStore.getState().layers.find((l) => l.id === layerId);
      expect(layer?.x).toBe(150);
      expect(layer?.y).toBe(250);

      await cmd.undo();
      layer = useEditorStore.getState().layers.find((l) => l.id === layerId);
      expect(layer?.x).toBe(0);
      expect(layer?.y).toBe(0);
    });

    it('FilterAdjustCommand modifies and reverts adjustments', async () => {
      const layerId = useEditorStore.getState().activeLayerId;
      const beforeAdj = { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false };
      const afterAdj = { brightness: 0.5, contrast: 0.2, saturation: -0.3, blur: 5, invert: true, grayscale: false, sepia: false };

      const cmd = new FilterAdjustCommand(layerId, beforeAdj, afterAdj);
      await cmd.execute();

      let layer = useEditorStore.getState().layers.find((l) => l.id === layerId);
      expect(layer?.adjustments.brightness).toBe(0.5);
      expect(layer?.adjustments.blur).toBe(5);
      expect(layer?.adjustments.invert).toBe(true);

      await cmd.undo();
      layer = useEditorStore.getState().layers.find((l) => l.id === layerId);
      expect(layer?.adjustments.brightness).toBe(0);
      expect(layer?.adjustments.blur).toBe(0);
      expect(layer?.adjustments.invert).toBe(false);
    });

    it('BrushStrokeCommand swaps tile deltas and returns buffers to pool on dispose', async () => {
      const layerId = useEditorStore.getState().activeLayerId;
      const docW = 1024;
      const docH = 1024;

      const layerBuffer = pixelRegistry.getOrCreateLayerBytes(layerId, docW, docH);
      layerBuffer.fill(0);

      // Create snapshot for tile (0, 0)
      const beforeTile = tileBufferPool.acquire();
      beforeTile.fill(10);

      const afterTile = tileBufferPool.acquire();
      afterTile.fill(200);

      const snapshot = {
        tileX: 0,
        tileY: 0,
        before: beforeTile,
        after: afterTile,
      };

      const cmd = new BrushStrokeCommand(layerId, docW, docH, [snapshot]);
      expect(cmd.estimateBytes()).toBe(TILE_BYTE_SIZE * 2);

      // Execute: sets tile to after (200)
      await cmd.execute();
      expect(layerBuffer[0]).toBe(200);

      // Undo: sets tile to before (10)
      await cmd.undo();
      expect(layerBuffer[0]).toBe(10);

      // Dispose: returns tile buffers back to tileBufferPool
      const poolCountBefore = tileBufferPool.getPoolCount();
      cmd.dispose();
      expect(tileBufferPool.getPoolCount()).toBe(poolCountBefore + 2);
    });

    it('AddLayerCommand and DeleteLayerCommand manage layer state and pixel data', async () => {
      const newLayer = {
        id: 'layer-test-cmd',
        name: 'New Test Layer',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        type: 'raster' as const,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false },
      };
      const initialBytes = new Uint8Array([10, 20, 30, 40]);

      // 1. AddLayerCommand
      const addCmd = new AddLayerCommand(newLayer, 0, initialBytes);
      await addCmd.execute();

      expect(useEditorStore.getState().layers.some((l) => l.id === newLayer.id)).toBe(true);
      expect(pixelRegistry.getLayerBytes(newLayer.id)).toBeDefined();

      await addCmd.undo();
      expect(useEditorStore.getState().layers.some((l) => l.id === newLayer.id)).toBe(false);

      // 2. DeleteLayerCommand
      await addCmd.execute();
      const delCmd = new DeleteLayerCommand(newLayer, 0, initialBytes);
      await delCmd.execute();
      expect(useEditorStore.getState().layers.some((l) => l.id === newLayer.id)).toBe(false);

      await delCmd.undo();
      expect(useEditorStore.getState().layers.some((l) => l.id === newLayer.id)).toBe(true);

      // Dispose should purge if not active
      await delCmd.execute();
      delCmd.dispose();
      expect(pixelRegistry.getLayerBytes(newLayer.id)).toBeUndefined();
    });

    it('AIResultCommand swaps binary bytes and triggers texture disposal on VRAM cleanup', async () => {
      const layerId = useEditorStore.getState().activeLayerId;
      const oldBytes = new Uint8Array([1, 1, 1, 255]);
      const newBytes = new Uint8Array([2, 2, 2, 255]);

      const disposedUrls: string[] = [];
      const cleanupListener = pixelRegistry.onTextureDisposed((url) => {
        disposedUrls.push(url);
      });

      const cmd = new AIResultCommand({
        layerId,
        docWidth: 1024,
        docHeight: 1024,
        oldBytes,
        newBytes,
        oldUrl: 'blob:old-url',
        newUrl: 'blob:new-url',
      });

      await cmd.execute();
      expect(pixelRegistry.getLayerBytes(layerId)).toEqual(newBytes);

      await cmd.undo();
      expect(pixelRegistry.getLayerBytes(layerId)).toEqual(oldBytes);

      cmd.dispose();
      expect(disposedUrls).toContain('blob:old-url');

      cleanupListener();
    });
  });

  describe('3. CommandManager & Memory Budget (100MB / 30 Steps)', () => {
    it('handles linear execution, undo, redo and timeline synchronization', async () => {
      const layerId = useEditorStore.getState().activeLayerId;

      const cmd1 = new MoveCommand(layerId, 0, 0, 10, 10, 'Move 1');
      const cmd2 = new MoveCommand(layerId, 10, 10, 20, 20, 'Move 2');

      await commandManager.executeCommand(cmd1);
      await commandManager.executeCommand(cmd2);

      expect(commandManager.getUndoCount()).toBe(2);
      expect(commandManager.getRedoCount()).toBe(0);
      expect(commandManager.canUndo()).toBe(true);
      expect(commandManager.canRedo()).toBe(false);

      let layer = useEditorStore.getState().layers.find((l) => l.id === layerId);
      expect(layer?.x).toBe(20);

      // Undo once
      await commandManager.undo();
      expect(commandManager.getUndoCount()).toBe(1);
      expect(commandManager.getRedoCount()).toBe(1);
      layer = useEditorStore.getState().layers.find((l) => l.id === layerId);
      expect(layer?.x).toBe(10);

      // Redo once
      await commandManager.redo();
      expect(commandManager.getUndoCount()).toBe(2);
      layer = useEditorStore.getState().layers.find((l) => l.id === layerId);
      expect(layer?.x).toBe(20);
    });

    it('disposes orphaned redo commands when a new command branches history', async () => {
      const layerId = useEditorStore.getState().activeLayerId;
      const cmd1 = new MoveCommand(layerId, 0, 0, 10, 10, 'Move 1');
      const cmd2 = new MoveCommand(layerId, 10, 10, 20, 20, 'Move 2');
      const disposeSpy = vi.spyOn(cmd2, 'dispose');

      await commandManager.executeCommand(cmd1);
      await commandManager.executeCommand(cmd2);

      // Undo cmd2 so it sits in redoStack
      await commandManager.undo();
      expect(commandManager.getRedoCount()).toBe(1);

      // Execute new command -> redoStack must be disposed!
      const cmd3 = new MoveCommand(layerId, 10, 10, 30, 30, 'Move 3');
      await commandManager.executeCommand(cmd3);

      expect(commandManager.getRedoCount()).toBe(0);
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('enforces MAX_HISTORY_STEPS cap and disposes evicted commands', async () => {
      const layerId = useEditorStore.getState().activeLayerId;
      commandManager.maxSteps = 5;

      const commands: MoveCommand[] = [];
      for (let i = 0; i < 10; i++) {
        const cmd = new MoveCommand(layerId, i, i, i + 1, i + 1, `Move ${i}`);
        commands.push(cmd);
        await commandManager.executeCommand(cmd);
      }

      // Must be capped at exactly maxSteps (5)
      expect(commandManager.getUndoCount()).toBe(5);

      const entries = commandManager.getHistoryEntries();
      expect(entries).toHaveLength(5);
      expect(entries[entries.length - 1].description).toBe('Move 9');
      expect(entries[0].description).toBe('Move 5');
    });

    it('enforces MAX_HISTORY_BYTES (100MB) budget cap and evicts oldest commands', async () => {
      commandManager.maxSteps = 100;
      commandManager.maxBytes = 5 * 1024 * 1024; // 5 MB test budget

      const layerId = useEditorStore.getState().activeLayerId;

      // Create 3 commands of 2MB each (Total 6MB > 5MB limit)
      for (let i = 0; i < 3; i++) {
        const tileSnap: any = {
          tileX: i,
          tileY: 0,
          before: tileBufferPool.acquire(),
          after: tileBufferPool.acquire(),
        };
        const cmd = new BrushStrokeCommand(layerId, 1024, 1024, [tileSnap], `Stroke ${i}`);
        await commandManager.executeCommand(cmd);
      }

      // Memory must stay strictly within 5MB budget
      expect(commandManager.getTotalBytes()).toBeLessThanOrEqual(5 * 1024 * 1024);
      expect(commandManager.getUndoCount()).toBeLessThan(3);
    });

    it('DeleteLayerCommand keeps pixel buffer on execute, restores on undo, and disposes on eviction (Ưu tiên 2)', async () => {
      const testLayerId = 'test-delete-layer-1';
      const testBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      pixelRegistry.setLayerBytes(testLayerId, testBuffer);

      const testLayer: LayerItem = {
        id: testLayerId,
        name: 'Delete Target Layer',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        type: 'raster',
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false },
      };

      // Add to store
      useEditorStore.setState((s) => ({
        layers: [testLayer, ...s.layers],
        activeLayerId: testLayerId,
      }));

      const cmd = new DeleteLayerCommand(testLayer, 0);

      // 1. execute(): layer removed from store, BUT pixelRegistry still holds buffer!
      await cmd.execute();
      expect(useEditorStore.getState().layers.some((l) => l.id === testLayerId)).toBe(false);
      expect(pixelRegistry.getLayerBytes(testLayerId)).not.toBeNull();
      expect(pixelRegistry.getLayerBytes(testLayerId)).toEqual(testBuffer);

      // 2. undo(): layer restored to store AND buffer in pixelRegistry is intact
      await cmd.undo();
      expect(useEditorStore.getState().layers.some((l) => l.id === testLayerId)).toBe(true);
      expect(pixelRegistry.getLayerBytes(testLayerId)).not.toBeNull();

      // 3. execute again, then dispose(): pixelRegistry deletes buffer
      await cmd.execute();
      cmd.dispose();
      expect(pixelRegistry.getLayerBytes(testLayerId) || null).toBeNull();
    });

    it('ReorderCommand moves layers and reverses on undo', async () => {
      const l1: LayerItem = { id: 'reorder-1', name: 'L1', visible: true, locked: false, opacity: 1, blendMode: 'normal', type: 'raster', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false } };
      const l2: LayerItem = { id: 'reorder-2', name: 'L2', visible: true, locked: false, opacity: 1, blendMode: 'normal', type: 'raster', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false } };
      useEditorStore.setState({ layers: [l1, l2], activeLayerId: 'reorder-1' });

      const { ReorderCommand } = await import('./commands');
      const cmd = new ReorderCommand(0, 1);
      expect(cmd.estimateBytes()).toBe(128);

      await cmd.execute();
      expect(useEditorStore.getState().layers[0].id).toBe('reorder-2');
      expect(useEditorStore.getState().layers[1].id).toBe('reorder-1');

      await cmd.undo();
      expect(useEditorStore.getState().layers[0].id).toBe('reorder-1');
      expect(useEditorStore.getState().layers[1].id).toBe('reorder-2');

      cmd.dispose();
    });

    it('MetadataSnapshotCommand applies before and after layers correctly', async () => {
      const l1: LayerItem = { id: 'meta-1', name: 'Meta L1', visible: true, locked: false, opacity: 1, blendMode: 'normal', type: 'raster', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false } };
      const l2: LayerItem = { id: 'meta-2', name: 'Meta L2', visible: false, locked: true, opacity: 0.5, blendMode: 'multiply', type: 'raster', x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false } };

      const { MetadataSnapshotCommand } = await import('./commands');
      const cmd = new MetadataSnapshotCommand('Meta Test', [l1], [l1, l2], 'meta-1', 'meta-2');
      expect(cmd.estimateBytes()).toBe(1024);

      await cmd.execute();
      expect(useEditorStore.getState().layers).toHaveLength(2);
      expect(useEditorStore.getState().activeLayerId).toBe('meta-2');

      await cmd.undo();
      expect(useEditorStore.getState().layers).toHaveLength(1);
      expect(useEditorStore.getState().activeLayerId).toBe('meta-1');

      cmd.dispose();
    });

    it('AIResultCommand with tile delta snapshots executes, undoes and disposes', async () => {
      const layerId = 'ai-tile-test-layer';
      const beforeTile = new Uint8Array(256 * 256 * 4);
      const afterTile = new Uint8Array(256 * 256 * 4).fill(128);

      const tileSnap = {
        tileX: 0,
        tileY: 0,
        before: beforeTile,
        after: afterTile,
      };

      const cmd = new AIResultCommand({
        layerId,
        docWidth: 256,
        docHeight: 256,
        tiles: [tileSnap],
        description: 'AI Inpaint Tiles',
      });

      expect(cmd.estimateBytes()).toBeGreaterThan(0);

      await cmd.execute();
      let bytes = pixelRegistry.getLayerBytes(layerId);
      expect(bytes).toBeDefined();
      expect(bytes![0]).toBe(128);

      await cmd.undo();
      bytes = pixelRegistry.getLayerBytes(layerId);
      expect(bytes![0]).toBe(0);

      cmd.dispose();
    });

    it('CommandManager jumpToIndex navigates back and forth in history', async () => {
      const layerId = 'jump-test-layer';
      commandManager.maxSteps = 30;

      const cmd1 = new MoveCommand(layerId, 0, 0, 10, 10, 'Jump Step 1');
      const cmd2 = new MoveCommand(layerId, 10, 10, 20, 20, 'Jump Step 2');
      const cmd3 = new MoveCommand(layerId, 20, 20, 30, 30, 'Jump Step 3');

      await commandManager.executeCommand(cmd1);
      await commandManager.executeCommand(cmd2);
      await commandManager.executeCommand(cmd3);

      expect(commandManager.getUndoCount()).toBe(3);

      // Jump to step 0
      await commandManager.jumpToIndex(0);
      expect(commandManager.getUndoCount()).toBe(1);

      // Jump forward to step 2
      await commandManager.jumpToIndex(2);
      expect(commandManager.getUndoCount()).toBe(3);
    });
  });
});
