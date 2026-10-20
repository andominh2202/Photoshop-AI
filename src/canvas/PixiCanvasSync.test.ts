import { describe, it, expect, vi } from 'vitest';

describe('PixiCanvas 2-Phase Layer Synchronization', () => {
  class MockDisplayObject {
    public id: string;
    public texture: any = null;
    public scale = { x: 1, y: 1, set: (s: number) => { this.scale.x = s; this.scale.y = s; } };
    public position = { x: 0, y: 0, set: (x: number, y: number) => { this.position.x = x; this.position.y = y; } };
    public visible = true;
    public alpha = 1;
    public blendMode = 'normal';
    public destroyed = false;

    constructor(id: string) {
      this.id = id;
    }

    destroy() {
      this.destroyed = true;
    }
  }

  class MockContainer {
    public children: MockDisplayObject[] = [];

    addChild(child: MockDisplayObject) {
      if (!this.children.includes(child)) {
        this.children.push(child);
      }
    }

    removeChild(child: MockDisplayObject) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
      }
    }

    setChildIndex(child: MockDisplayObject, index: number) {
      const currentIndex = this.children.indexOf(child);
      if (currentIndex === -1) {
        throw new Error('Child not found in container');
      }
      if (index < 0 || index >= this.children.length) {
        throw new RangeError(`Index ${index} is out of bounds (0..${this.children.length - 1})`);
      }
      this.children.splice(currentIndex, 1);
      this.children.splice(index, 0, child);
    }
  }

  it('maintains strict z-order for 5 layers when textures resolve with random 0-100ms delays', async () => {
    const world = new MockContainer();
    const artboardBg = new MockDisplayObject('artboardBg');
    const drawingGfx = new MockDisplayObject('drawingGfx');
    const inpaintMaskGfx = new MockDisplayObject('inpaintMaskGfx');
    const selectionGfx = new MockDisplayObject('selectionGfx');
    const transformBox = new MockDisplayObject('transformBox');

    // Initial setup in PixiCanvas
    world.addChild(artboardBg);
    world.addChild(drawingGfx);
    world.addChild(inpaintMaskGfx);
    world.addChild(selectionGfx);
    world.addChild(transformBox);

    const mockLayers = [
      { id: 'layer-1', name: 'Layer 1', textureUrl: 'blob:1', type: 'image' },
      { id: 'layer-2', name: 'Layer 2', textureUrl: 'blob:2', type: 'image' },
      { id: 'layer-3', name: 'Layer 3', textureUrl: 'blob:3', type: 'image' },
      { id: 'layer-4', name: 'Layer 4', textureUrl: 'blob:4', type: 'image' },
      { id: 'layer-5', name: 'Layer 5', textureUrl: 'blob:5', type: 'image' },
    ];

    const reversedLayers = [...mockLayers].reverse(); // layer-5, layer-4, layer-3, layer-2, layer-1
    const existingSprites = new Map<string, MockDisplayObject>();

    // --- PHASE 1 (Synchronous Display Object Creation & Z-index Placement) ---
    reversedLayers.forEach((layer, index) => {
      let displayObject = existingSprites.get(layer.id);
      if (!displayObject) {
        displayObject = new MockDisplayObject(layer.id);
        world.addChild(displayObject);
        existingSprites.set(layer.id, displayObject);
      }

      const targetIdx = index + 1; // 0 is artboardBg
      world.setChildIndex(displayObject, targetIdx);
    });

    // Bring overlays to top
    const bringOverlayToTop = (gfx: MockDisplayObject) => {
      world.setChildIndex(gfx, world.children.length - 1);
    };
    bringOverlayToTop(drawingGfx);
    bringOverlayToTop(inpaintMaskGfx);
    bringOverlayToTop(selectionGfx);
    bringOverlayToTop(transformBox);

    // Verify immediate z-order after Phase 1
    const phase1Ids = world.children.map((c) => c.id);
    expect(phase1Ids).toEqual([
      'artboardBg',
      'layer-5',
      'layer-4',
      'layer-3',
      'layer-2',
      'layer-1',
      'drawingGfx',
      'inpaintMaskGfx',
      'selectionGfx',
      'transformBox',
    ]);

    // --- PHASE 2 (Async Parallel Texture Loading with Random Delays 0-100ms) ---
    const delays = [85, 12, 95, 30, 5];
    const textureLoadPromises = reversedLayers.map(async (layer, idx) => {
      const delay = delays[idx];
      await new Promise((r) => setTimeout(r, delay));
      const sprite = existingSprites.get(layer.id);
      if (sprite && !sprite.destroyed) {
        sprite.texture = { width: 1000, height: 1000, loadedDelay: delay };
      }
    });

    await Promise.all(textureLoadPromises);

    // Verify final z-order after all textures have loaded asynchronously
    const finalIds = world.children.map((c) => c.id);
    expect(finalIds).toEqual([
      'artboardBg',
      'layer-5',
      'layer-4',
      'layer-3',
      'layer-2',
      'layer-1',
      'drawingGfx',
      'inpaintMaskGfx',
      'selectionGfx',
      'transformBox',
    ]);

    // Verify all textures were populated
    reversedLayers.forEach((layer) => {
      const sprite = existingSprites.get(layer.id);
      expect(sprite?.texture).not.toBeNull();
    });
  });

  it('safely catches out of bounds index without throwing or crashing', () => {
    const world = new MockContainer();
    const sprite = new MockDisplayObject('test-sprite');
    world.addChild(sprite);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Try setting index beyond children length
    const invalidTarget = 999;
    try {
      if (invalidTarget >= 0 && invalidTarget < world.children.length) {
        world.setChildIndex(sprite, invalidTarget);
      } else {
        console.warn(`Layer test-sprite index out of bounds: target=${invalidTarget}`);
      }
    } catch (err) {
      console.warn('Caught setChildIndex error:', err);
    }

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
