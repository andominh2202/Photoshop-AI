/**
 * Tile Delta & Buffer Pool Architecture
 * Divides large images (50–100MP) into 512x512 pixel tiles.
 * Only snapshots modified (dirty) tiles during painting / editing,
 * drastically reducing RAM usage and preventing GC pauses via buffer pooling.
 */

export const TILE_SIZE = 512;
export const BYTES_PER_PIXEL = 4; // RGBA 8-bit
export const TILE_BYTE_SIZE = TILE_SIZE * TILE_SIZE * BYTES_PER_PIXEL; // 1,048,576 bytes (1MB)

export type TileKey = `${string}:${number}:${number}`; // ${layerId}:${tileX}:${tileY}

export interface DirtyTileCoords {
  tileX: number;
  tileY: number;
}

export interface TileSnapshot {
  tileX: number;
  tileY: number;
  before: Uint8Array;
  after: Uint8Array;
}

/**
 * Reusable Tile Buffer Pool to eliminate garbage collection pauses
 */
class TileBufferPool {
  private static instance: TileBufferPool;
  private pool: Uint8Array[] = [];
  private maxPoolSize = 30; // Max 30MB warm pool

  public static getInstance(): TileBufferPool {
    if (!TileBufferPool.instance) {
      TileBufferPool.instance = new TileBufferPool();
    }
    return TileBufferPool.instance;
  }

  /**
   * Acquire a 1MB tile buffer from pool or allocate new
   */
  public acquire(): Uint8Array {
    const buf = this.pool.pop();
    if (buf) {
      return buf;
    }
    return new Uint8Array(TILE_BYTE_SIZE);
  }

  /**
   * Release a tile buffer back to the pool for reuse
   */
  public release(buf: Uint8Array): void {
    if (this.pool.length < this.maxPoolSize && buf.byteLength === TILE_BYTE_SIZE) {
      this.pool.push(buf);
    }
  }

  /**
   * Drain entire pool
   */
  public clear(): void {
    this.pool = [];
  }

  public getPoolCount(): number {
    return this.pool.length;
  }
}

export const tileBufferPool = TileBufferPool.getInstance();

/**
 * Calculate which 512x512 tiles are touched by a rectangular bounding box
 */
export function getAffectedTiles(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  docWidth: number,
  docHeight: number
): DirtyTileCoords[] {
  const clampedMinX = Math.max(0, Math.min(docWidth - 1, minX));
  const clampedMinY = Math.max(0, Math.min(docHeight - 1, minY));
  const clampedMaxX = Math.max(0, Math.min(docWidth - 1, maxX));
  const clampedMaxY = Math.max(0, Math.min(docHeight - 1, maxY));

  const startTileX = Math.floor(clampedMinX / TILE_SIZE);
  const endTileX = Math.floor(clampedMaxX / TILE_SIZE);
  const startTileY = Math.floor(clampedMinY / TILE_SIZE);
  const endTileY = Math.floor(clampedMaxY / TILE_SIZE);

  const tiles: DirtyTileCoords[] = [];
  for (let ty = startTileY; ty <= endTileY; ty++) {
    for (let tx = startTileX; tx <= endTileX; tx++) {
      tiles.push({ tileX: tx, tileY: ty });
    }
  }
  return tiles;
}

/**
 * Extract a 512x512 tile from a contiguous RGBA image buffer
 */
export function extractTileFromBuffer(
  fullBuffer: Uint8Array,
  imgWidth: number,
  imgHeight: number,
  tileX: number,
  tileY: number,
  targetBuffer?: Uint8Array
): Uint8Array {
  const out = targetBuffer || tileBufferPool.acquire();
  const startX = tileX * TILE_SIZE;
  const startY = tileY * TILE_SIZE;
  const tileW = Math.min(TILE_SIZE, imgWidth - startX);
  const tileH = Math.min(TILE_SIZE, imgHeight - startY);

  if (tileW <= 0 || tileH <= 0) {
    return out;
  }

  // Row by row blit into target tile buffer
  for (let row = 0; row < tileH; row++) {
    const srcOffset = ((startY + row) * imgWidth + startX) * BYTES_PER_PIXEL;
    const dstOffset = (row * TILE_SIZE) * BYTES_PER_PIXEL;
    const rowBytes = tileW * BYTES_PER_PIXEL;

    out.set(fullBuffer.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
  }

  return out;
}

/**
 * Write a 512x512 tile back into a contiguous RGBA image buffer
 */
export function writeTileToBuffer(
  fullBuffer: Uint8Array,
  imgWidth: number,
  imgHeight: number,
  tileX: number,
  tileY: number,
  tileBuffer: Uint8Array
): void {
  const startX = tileX * TILE_SIZE;
  const startY = tileY * TILE_SIZE;
  const tileW = Math.min(TILE_SIZE, imgWidth - startX);
  const tileH = Math.min(TILE_SIZE, imgHeight - startY);

  if (tileW <= 0 || tileH <= 0) return;

  for (let row = 0; row < tileH; row++) {
    const srcOffset = (row * TILE_SIZE) * BYTES_PER_PIXEL;
    const dstOffset = ((startY + row) * imgWidth + startX) * BYTES_PER_PIXEL;
    const rowBytes = tileW * BYTES_PER_PIXEL;

    fullBuffer.set(tileBuffer.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
  }
}

/**
 * Generate typed TileKey
 */
export function createTileKey(layerId: string, tileX: number, tileY: number): TileKey {
  return `${layerId}:${tileX}:${tileY}`;
}

/**
 * Release a TileSnapshot's buffers back into the buffer pool
 */
export function disposeTileSnapshot(snapshot: TileSnapshot): void {
  if (snapshot.before) {
    tileBufferPool.release(snapshot.before);
  }
  if (snapshot.after) {
    tileBufferPool.release(snapshot.after);
  }
}

/**
 * Create a TileSnapshot from full before and after image buffers for a specific tile
 */
export function createTileSnapshot(
  beforeBuffer: Uint8Array,
  afterBuffer: Uint8Array,
  imgWidth: number,
  imgHeight: number,
  tileX: number,
  tileY: number
): TileSnapshot {
  const before = extractTileFromBuffer(beforeBuffer, imgWidth, imgHeight, tileX, tileY);
  const after = extractTileFromBuffer(afterBuffer, imgWidth, imgHeight, tileX, tileY);
  return {
    tileX,
    tileY,
    before,
    after,
  };
}

/**
 * Apply either 'before' or 'after' tile snapshot directly into a full image buffer
 */
export function applyTileSnapshot(
  fullBuffer: Uint8Array,
  imgWidth: number,
  imgHeight: number,
  snapshot: TileSnapshot,
  state: 'before' | 'after'
): void {
  const tileBuf = state === 'before' ? snapshot.before : snapshot.after;
  writeTileToBuffer(fullBuffer, imgWidth, imgHeight, snapshot.tileX, snapshot.tileY, tileBuf);
}

/**
 * Fast CPU rasterizer for brush stroke polyline onto RGBA image buffer
 */
export function rasterizeStrokeToBuffer(
  buffer: Uint8Array,
  width: number,
  height: number,
  points: { x: number; y: number }[],
  color: string,
  size: number,
  opacity: number,
  mode: 'brush' | 'eraser' = 'brush'
): void {
  if (points.length === 0 || width <= 0 || height <= 0) return;

  // Parse color hex (#rrggbb)
  let r = 59, g = 130, b = 246; // default blue #3b82f6
  const cleanHex = color.replace('#', '');
  if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  }

  const radius = Math.max(1, Math.round(size / 2));
  const r2 = radius * radius;
  const alphaSrc = Math.max(0, Math.min(1, opacity));

  function stampCircle(cx: number, cy: number) {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(height - 1, Math.ceil(cy + radius));

    for (let py = minY; py <= maxY; py++) {
      const dy = py - cy;
      const dy2 = dy * dy;
      for (let px = minX; px <= maxX; px++) {
        const dx = px - cx;
        if (dx * dx + dy2 <= r2) {
          const idx = (py * width + px) * BYTES_PER_PIXEL;
          const dstR = buffer[idx];
          const dstG = buffer[idx + 1];
          const dstB = buffer[idx + 2];
          const dstA = buffer[idx + 3] / 255;

          if (mode === 'eraser') {
            // Smooth radial falloff for feathered eraser edge
            const distRatio = Math.sqrt(dx * dx + dy2) / radius;
            const featherFactor = 1 - Math.min(1, Math.max(0, distRatio));
            const eraseAmount = alphaSrc * (0.5 + 0.5 * featherFactor);
            const newA = Math.max(0, dstA - eraseAmount);
            buffer[idx + 3] = Math.round(newA * 255);
            if (newA === 0) {
              buffer[idx] = 0;
              buffer[idx + 1] = 0;
              buffer[idx + 2] = 0;
            }
          } else {
            const outA = alphaSrc + dstA * (1 - alphaSrc);
            if (outA > 0) {
              buffer[idx] = Math.round((r * alphaSrc + dstR * dstA * (1 - alphaSrc)) / outA);
              buffer[idx + 1] = Math.round((g * alphaSrc + dstG * dstA * (1 - alphaSrc)) / outA);
              buffer[idx + 2] = Math.round((b * alphaSrc + dstB * dstA * (1 - alphaSrc)) / outA);
              buffer[idx + 3] = Math.round(outA * 255);
            }
          }
        }
      }
    }
  }

  // Stamp initial point
  stampCircle(points[0].x, points[0].y);

  // Interpolate line segments
  const stepSize = Math.max(1, Math.floor(radius / 2));
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(1, Math.ceil(dist / stepSize));

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      stampCircle(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t);
    }
  }
}



