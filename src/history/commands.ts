import { useEditorStore, LayerItem, LayerAdjustments } from '@/store/useEditorStore';
import { pixelRegistry } from '@/store/pixelStore';
import {
  TileSnapshot,
  TILE_BYTE_SIZE,
  writeTileToBuffer,
  disposeTileSnapshot,
} from './tileStore';

export interface Command {
  id: string; // uuid / stepId to link VRAM & buffers
  description: string; // Displayed in HistoryPanel
  execute(): Promise<void>; // Apply action
  undo(): Promise<void>; // Revert action
  dispose(): void; // Clean up memory (tile buffers, VRAM)
  estimateBytes(): number; // Estimate memory occupied
}

function generateId(): string {
  return `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * 1. MoveCommand: Layer Translation (Pure metadata, zero pixel overhead)
 */
export class MoveCommand implements Command {
  public readonly id: string;
  public readonly description: string;
  public readonly layerId: string;
  public readonly fromX: number;
  public readonly fromY: number;
  public readonly toX: number;
  public readonly toY: number;

  constructor(
    layerId: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    description = 'Move Layer'
  ) {
    this.id = generateId();
    this.description = description;
    this.layerId = layerId;
    this.fromX = fromX;
    this.fromY = fromY;
    this.toX = toX;
    this.toY = toY;
  }

  public async execute(): Promise<void> {
    useEditorStore.getState().setLayerPosition(this.layerId, this.toX, this.toY);
  }

  public async undo(): Promise<void> {
    useEditorStore.getState().setLayerPosition(this.layerId, this.fromX, this.fromY);
  }

  public dispose(): void {
    // Pure metadata, no buffers to release
  }

  public estimateBytes(): number {
    return 128;
  }
}

/**
 * 2. FilterAdjustCommand: Adjustments & Filters (Pure metadata)
 */
export class FilterAdjustCommand implements Command {
  public readonly id: string;
  public readonly description: string;
  public readonly layerId: string;
  public readonly paramsBefore: LayerAdjustments;
  public readonly paramsAfter: LayerAdjustments;

  constructor(
    layerId: string,
    paramsBefore: LayerAdjustments,
    paramsAfter: LayerAdjustments,
    description = 'Adjust Filters'
  ) {
    this.id = generateId();
    this.description = description;
    this.layerId = layerId;
    this.paramsBefore = { ...paramsBefore };
    this.paramsAfter = { ...paramsAfter };
  }

  public async execute(): Promise<void> {
    useEditorStore.getState().setLayerAdjustments(this.layerId, this.paramsAfter);
  }

  public async undo(): Promise<void> {
    useEditorStore.getState().setLayerAdjustments(this.layerId, this.paramsBefore);
  }

  public dispose(): void {
    // Pure metadata
  }

  public estimateBytes(): number {
    return 256;
  }
}

/**
 * 3. BrushStrokeCommand: Tile-Delta Brush & Eraser (512x512 tile deltas + Buffer Pool)
 */
export class BrushStrokeCommand implements Command {
  public readonly id: string;
  public readonly description: string;
  public readonly layerId: string;
  public readonly docWidth: number;
  public readonly docHeight: number;
  public tiles: TileSnapshot[];
  private disposed = false;

  constructor(
    layerId: string,
    docWidth: number,
    docHeight: number,
    tiles: TileSnapshot[],
    description = 'Brush Stroke'
  ) {
    this.id = generateId();
    this.description = description;
    this.layerId = layerId;
    this.docWidth = docWidth;
    this.docHeight = docHeight;
    this.tiles = tiles;
  }

  public async execute(): Promise<void> {
    if (this.disposed || this.tiles.length === 0) return;
    const fullBuffer = pixelRegistry.getOrCreateLayerBytes(
      this.layerId,
      this.docWidth,
      this.docHeight
    );
    for (const tile of this.tiles) {
      writeTileToBuffer(
        fullBuffer,
        this.docWidth,
        this.docHeight,
        tile.tileX,
        tile.tileY,
        tile.after
      );
    }
    const newUrl = pixelRegistry.invalidateLayerTexture(this.layerId, 'image/png', this.docWidth, this.docHeight);
    if (newUrl) {
      useEditorStore.getState().updateLayerData(this.layerId, fullBuffer, newUrl);
    }
  }

  public async undo(): Promise<void> {
    if (this.disposed || this.tiles.length === 0) return;
    const fullBuffer = pixelRegistry.getOrCreateLayerBytes(
      this.layerId,
      this.docWidth,
      this.docHeight
    );
    for (const tile of this.tiles) {
      writeTileToBuffer(
        fullBuffer,
        this.docWidth,
        this.docHeight,
        tile.tileX,
        tile.tileY,
        tile.before
      );
    }
    const newUrl = pixelRegistry.invalidateLayerTexture(this.layerId, 'image/png', this.docWidth, this.docHeight);
    if (newUrl) {
      useEditorStore.getState().updateLayerData(this.layerId, fullBuffer, newUrl);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const tile of this.tiles) {
      disposeTileSnapshot(tile);
    }
    this.tiles = [];
  }

  public estimateBytes(): number {
    return this.tiles.length * TILE_BYTE_SIZE * 2;
  }
}

/**
 * 4. AddLayerCommand: Create layer + optional initial pixel bytes
 */
export class AddLayerCommand implements Command {
  public readonly id: string;
  public readonly description: string;
  public readonly layer: LayerItem;
  public readonly index: number;
  public readonly layerBytes?: Uint8Array;

  constructor(
    layer: LayerItem,
    index = 0,
    layerBytes?: Uint8Array,
    description = 'Add Layer'
  ) {
    this.id = generateId();
    this.description = description;
    this.layer = { ...layer };
    this.index = index;
    this.layerBytes = layerBytes;
  }

  public async execute(): Promise<void> {
    if (this.layerBytes) {
      const url = pixelRegistry.setLayerBytes(this.layer.id, this.layerBytes);
      this.layer.textureUrl = url;
    }
    const state = useEditorStore.getState();
    const newLayers = [...state.layers];
    newLayers.splice(this.index, 0, this.layer);
    useEditorStore.setState({
      layers: newLayers,
      activeLayerId: this.layer.id,
    });
  }

  public async undo(): Promise<void> {
    const state = useEditorStore.getState();
    const filtered = state.layers.filter((l) => l.id !== this.layer.id);
    const nextActive = filtered.length > 0 ? filtered[0].id : '';
    useEditorStore.setState({
      layers: filtered,
      activeLayerId: nextActive,
    });
  }

  public dispose(): void {
    const state = useEditorStore.getState();
    const exists = state.layers.some((l) => l.id === this.layer.id);
    if (!exists) {
      pixelRegistry.deleteLayerData(this.layer.id);
    }
  }

  public estimateBytes(): number {
    return (this.layerBytes ? this.layerBytes.byteLength : 0) + 512;
  }
}

/**
 * 5. DeleteLayerCommand: Remove layer + restore on undo
 */
export class DeleteLayerCommand implements Command {
  public readonly id: string;
  public readonly description: string;
  public readonly layer: LayerItem;
  public readonly index: number;
  public readonly layerBytes?: Uint8Array;

  constructor(
    layer: LayerItem,
    index = -1,
    layerBytes?: Uint8Array,
    description?: string
  ) {
    this.id = generateId();
    this.layer = { ...layer };
    const currentIndex = useEditorStore.getState().layers.findIndex((l) => l.id === layer.id);
    this.index = index >= 0 ? index : (currentIndex >= 0 ? currentIndex : 0);
    this.description = description || `Xóa layer: ${layer.name}`;
    this.layerBytes = layerBytes || pixelRegistry.getLayerBytes(layer.id) || undefined;
  }

  public async execute(): Promise<void> {
    const state = useEditorStore.getState();
    const filtered = state.layers.filter((l) => l.id !== this.layer.id);
    const nextActive = filtered.length > 0 ? filtered[0].id : '';
    useEditorStore.setState({
      layers: filtered,
      activeLayerId: nextActive,
    });
  }

  public async undo(): Promise<void> {
    if (this.layerBytes) {
      const url = pixelRegistry.setLayerBytes(this.layer.id, this.layerBytes);
      this.layer.textureUrl = url;
    }
    const state = useEditorStore.getState();
    const newLayers = [...state.layers];
    newLayers.splice(this.index, 0, this.layer);
    useEditorStore.setState({
      layers: newLayers,
      activeLayerId: this.layer.id,
    });
  }

  public dispose(): void {
    const state = useEditorStore.getState();
    const exists = state.layers.some((l) => l.id === this.layer.id);
    if (!exists) {
      pixelRegistry.deleteLayerData(this.layer.id);
    }
  }

  public estimateBytes(): number {
    return (this.layerBytes ? this.layerBytes.byteLength : 0) + 512;
  }
}

/**
 * 6. ReorderCommand: Layer hierarchy rearrangement
 */
export class ReorderCommand implements Command {
  public readonly id: string;
  public readonly description: string;
  public readonly startIndex: number;
  public readonly endIndex: number;

  constructor(startIndex: number, endIndex: number, description = 'Reorder Layers') {
    this.id = generateId();
    this.description = description;
    this.startIndex = startIndex;
    this.endIndex = endIndex;
  }

  public async execute(): Promise<void> {
    useEditorStore.getState().reorderLayers(this.startIndex, this.endIndex);
  }

  public async undo(): Promise<void> {
    useEditorStore.getState().reorderLayers(this.endIndex, this.startIndex);
  }

  public dispose(): void {
    // Pure metadata
  }

  public estimateBytes(): number {
    return 128;
  }
}

/**
 * 7. AIResultCommand: AI background removal / inpaint result (Tiles or binary buffer swap)
 */
export class AIResultCommand implements Command {
  public readonly id: string;
  public readonly description: string;
  public readonly layerId: string;
  public readonly docWidth: number;
  public readonly docHeight: number;
  public tiles?: TileSnapshot[];
  public oldBytes?: Uint8Array;
  public newBytes?: Uint8Array;
  public readonly initialOldUrl?: string;
  public readonly initialNewUrl?: string;
  public oldUrl?: string;
  public newUrl?: string;
  private disposed = false;

  constructor(options: {
    layerId: string;
    docWidth: number;
    docHeight: number;
    tiles?: TileSnapshot[];
    oldBytes?: Uint8Array;
    newBytes?: Uint8Array;
    oldUrl?: string;
    newUrl?: string;
    description?: string;
  }) {
    this.id = generateId();
    this.description = options.description || 'AI Result';
    this.layerId = options.layerId;
    this.docWidth = options.docWidth;
    this.docHeight = options.docHeight;
    this.tiles = options.tiles;
    this.oldBytes = options.oldBytes;
    this.newBytes = options.newBytes;
    this.initialOldUrl = options.oldUrl;
    this.initialNewUrl = options.newUrl;
    this.oldUrl = options.oldUrl;
    this.newUrl = options.newUrl;
  }

  public async execute(): Promise<void> {
    if (this.disposed) return;
    if (this.tiles && this.tiles.length > 0) {
      const fullBuffer = pixelRegistry.getOrCreateLayerBytes(
        this.layerId,
        this.docWidth,
        this.docHeight
      );
      for (const tile of this.tiles) {
        writeTileToBuffer(
          fullBuffer,
          this.docWidth,
          this.docHeight,
          tile.tileX,
          tile.tileY,
          tile.after
        );
      }
      const newUrl = pixelRegistry.invalidateLayerTexture(this.layerId);
      useEditorStore.getState().updateLayerData(this.layerId, fullBuffer, newUrl);
    } else if (this.newBytes) {
      const url = pixelRegistry.setLayerBytes(this.layerId, this.newBytes);
      this.newUrl = url;
      useEditorStore.getState().updateLayerData(this.layerId, this.newBytes, url);
    }
  }

  public async undo(): Promise<void> {
    if (this.disposed) return;
    if (this.tiles && this.tiles.length > 0) {
      const fullBuffer = pixelRegistry.getOrCreateLayerBytes(
        this.layerId,
        this.docWidth,
        this.docHeight
      );
      for (const tile of this.tiles) {
        writeTileToBuffer(
          fullBuffer,
          this.docWidth,
          this.docHeight,
          tile.tileX,
          tile.tileY,
          tile.before
        );
      }
      const newUrl = pixelRegistry.invalidateLayerTexture(this.layerId);
      useEditorStore.getState().updateLayerData(this.layerId, fullBuffer, newUrl);
    } else if (this.oldBytes) {
      const url = pixelRegistry.setLayerBytes(this.layerId, this.oldBytes);
      this.oldUrl = url;
      useEditorStore.getState().updateLayerData(this.layerId, this.oldBytes, url);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.tiles) {
      for (const tile of this.tiles) {
        disposeTileSnapshot(tile);
      }
      this.tiles = [];
    }
    // Clean up VRAM textures if no longer in active use
    if (this.initialOldUrl) {
      pixelRegistry.notifyTextureDisposed(this.initialOldUrl);
    }
    if (this.oldUrl && this.oldUrl !== this.initialOldUrl) {
      pixelRegistry.notifyTextureDisposed(this.oldUrl);
    }
    if (this.initialNewUrl) {
      pixelRegistry.notifyTextureDisposed(this.initialNewUrl);
    }
    if (this.newUrl && this.newUrl !== this.initialNewUrl) {
      pixelRegistry.notifyTextureDisposed(this.newUrl);
    }
  }


  public estimateBytes(): number {
    if (this.tiles && this.tiles.length > 0) {
      return this.tiles.length * TILE_BYTE_SIZE * 2;
    }
    return (this.oldBytes?.byteLength || 0) + (this.newBytes?.byteLength || 0);
  }
}

/**
 * 8. MetadataSnapshotCommand: Generic lightweight metadata action snapshot
 */
export class MetadataSnapshotCommand implements Command {
  public readonly id: string;
  public readonly description: string;
  public readonly beforeLayers: LayerItem[];
  public readonly afterLayers: LayerItem[];
  public readonly beforeActiveId: string;
  public readonly afterActiveId: string;

  constructor(
    description: string,
    beforeLayers: LayerItem[],
    afterLayers: LayerItem[],
    beforeActiveId: string,
    afterActiveId: string
  ) {
    this.id = generateId();
    this.description = description;
    this.beforeLayers = beforeLayers.map((l) => ({
      ...l,
      data: undefined,
      adjustments: { ...l.adjustments },
    }));
    this.afterLayers = afterLayers.map((l) => ({
      ...l,
      data: undefined,
      adjustments: { ...l.adjustments },
    }));
    this.beforeActiveId = beforeActiveId;
    this.afterActiveId = afterActiveId;
  }

  public async execute(): Promise<void> {
    useEditorStore.setState({
      layers: this.afterLayers.map((l) => ({
        ...l,
        data: pixelRegistry.getLayerBytes(l.id),
        textureUrl: pixelRegistry.getLayerUrl(l.id) || l.textureUrl,
        adjustments: { ...l.adjustments },
      })),
      activeLayerId: this.afterActiveId,
    });
  }

  public async undo(): Promise<void> {
    useEditorStore.setState({
      layers: this.beforeLayers.map((l) => ({
        ...l,
        data: pixelRegistry.getLayerBytes(l.id),
        textureUrl: pixelRegistry.getLayerUrl(l.id) || l.textureUrl,
        adjustments: { ...l.adjustments },
      })),
      activeLayerId: this.beforeActiveId,
    });
  }

  public dispose(): void {
    // Pure metadata
  }

  public estimateBytes(): number {
    return 1024;
  }
}
