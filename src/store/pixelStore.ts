/**
 * PixelRegistry: High-performance binary pixel data store outside Zustand.
 * Completely isolates heavy binary buffers (Uint8Array, ImageBitmap, Blobs)
 * from React state and JSON serialization to prevent Out-Of-Memory (OOM) crashes.
 */
/**
 * Detect whether binary bytes represent an encoded image format (PNG, JPEG, WebP, GIF, SVG)
 * versus raw uncompressed RGBA pixel buffers.
 */
export function isEncodedImageBuffer(bytes: Uint8Array): boolean {
  if (!bytes || bytes.byteLength < 4) return false;
  // PNG: 0x89, 0x50, 0x4E, 0x47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return true;
  // JPEG: 0xFF, 0xD8, 0xFF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return true;
  // WebP/RIFF: 0x52, 0x49, 0x46, 0x46 ('RIFF')
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return true;
  // GIF: GIF8
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return true;
  // SVG: '<svg' or '<?xml'
  if (bytes[0] === 0x3C) return true;
  return false;
}

/**
 * Safely convert raw RGBA Uint8Array into a standard browser-decodable PNG Data URL.
 * Prevents corrupted blob URLs from failing texture decoding and turning the canvas black.
 */
export function rawRgbaToDataUrl(bytes: Uint8Array, width: number, height: number): string {
  if (typeof document === 'undefined') {
    return 'data:image/png;base64,';
  }
  try {
    const canvas = document.createElement('canvas');
    if (!canvas || !canvas.getContext) return 'data:image/png;base64,';
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'data:image/png;base64,';
    const expected = w * h * 4;
    const clamped = new Uint8ClampedArray(expected);
    clamped.set(bytes.subarray(0, Math.min(bytes.byteLength, expected)));
    const imgData = new ImageData(clamped, w, h);
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (_) {
    return 'data:image/png;base64,';
  }
}

class PixelRegistry {
  private static instance: PixelRegistry;
  private buffers: Map<string, Uint8Array> = new Map();
  private bitmaps: Map<string, ImageBitmap> = new Map();
  private objectUrls: Map<string, string> = new Map();
  private historySnapshots: Map<string, Map<string, Uint8Array>> = new Map();
  private sharedBuffers: Map<string, SharedArrayBuffer> = new Map();
  private textureDisposedListeners: Set<(url: string) => void> = new Set();
  private textureInvalidatedListeners: Set<(layerId: string, newUrl: string) => void> = new Set();

  private layerDimensions: Map<string, { width: number; height: number }> = new Map();

  private constructor() {}

  public static getInstance(): PixelRegistry {
    if (!PixelRegistry.instance) {
      PixelRegistry.instance = new PixelRegistry();
    }
    return PixelRegistry.instance;
  }

  public setLayerDimensions(layerId: string, width: number, height: number): void {
    this.layerDimensions.set(layerId, { width, height });
  }

  public getLayerDimensions(layerId: string): { width: number; height: number } | undefined {
    return this.layerDimensions.get(layerId);
  }

  /**
   * Subscribe to texture disposal events (VRAM release in Pixi)
   */
  public onTextureDisposed(cb: (url: string) => void): () => void {
    this.textureDisposedListeners.add(cb);
    return () => {
      this.textureDisposedListeners.delete(cb);
    };
  }

  public notifyTextureDisposed(url: string): void {
    if (url) {
      this.textureDisposedListeners.forEach((cb) => {
        try {
          cb(url);
        } catch (_) {}
      });
    }
  }

  /**
   * Subscribe to texture invalidation events (Pixel changes requiring sprite re-bind)
   */
  public onTextureInvalidated(cb: (layerId: string, newUrl: string) => void): () => void {
    this.textureInvalidatedListeners.add(cb);
    return () => {
      this.textureInvalidatedListeners.delete(cb);
    };
  }

  public notifyTextureInvalidated(layerId: string, newUrl: string): void {
    this.textureInvalidatedListeners.forEach((cb) => {
      try {
        cb(layerId, newUrl);
      } catch (_) {}
    });
  }

  /**
   * Associate binary image bytes with a layer.
   * Seamlessly distinguishes between encoded image files (PNG, JPEG, WebP)
   * and raw uncompressed RGBA pixel buffers to ensure valid browser decoding.
   */
  public setLayerBytes(layerId: string, bytes: Uint8Array, mimeType = 'image/png', width?: number, height?: number): string {
    this.buffers.set(layerId, bytes);
    this.sharedBuffers.delete(layerId);

    if (width && height) {
      this.layerDimensions.set(layerId, { width, height });
    }

    // Revoke previous blob URL if exists to prevent memory leaks
    const existingUrl = this.objectUrls.get(layerId);
    if (existingUrl) {
      this.notifyTextureDisposed(existingUrl);
      if (existingUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(existingUrl);
        } catch (_) {}
      }
    }

    let url = '';
    if (isEncodedImageBuffer(bytes)) {
      const blob = new Blob([bytes as any], { type: mimeType });
      url = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : 'blob:test';
    } else {
      let w = width;
      let h = height;
      if (!w || !h) {
        const dims = this.layerDimensions.get(layerId);
        if (dims) {
          w = dims.width;
          h = dims.height;
        }
      }
      url = rawRgbaToDataUrl(bytes, w || 1, h || 1);
    }

    this.objectUrls.set(layerId, url);
    return url;
  }

  /**
   * Retrieve binary image bytes for a layer, or initialize a zero-filled transparent RGBA buffer
   */
  public getOrCreateLayerBytes(layerId: string, width: number, height: number): Uint8Array {
    this.layerDimensions.set(layerId, { width, height });
    let buf = this.buffers.get(layerId);
    if (!buf || buf.byteLength === 0) {
      buf = new Uint8Array(width * height * 4);
      this.buffers.set(layerId, buf);
    }
    return buf;
  }

  /**
   * Re-generate valid Data URL / Blob URL from current buffer and notify textures
   */
  public invalidateLayerTexture(layerId: string, mimeType = 'image/png', width?: number, height?: number): string {
    const bytes = this.buffers.get(layerId);
    if (!bytes) {
      return '';
    }
    if (width && height) {
      this.layerDimensions.set(layerId, { width, height });
    }
    const oldUrl = this.objectUrls.get(layerId);
    if (oldUrl) {
      this.notifyTextureDisposed(oldUrl);
      if (oldUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(oldUrl);
        } catch (_) {}
      }
    }

    let newUrl = '';
    if (isEncodedImageBuffer(bytes)) {
      const blob = new Blob([bytes as any], { type: mimeType });
      newUrl = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : 'blob:test';
    } else {
      let w = width;
      let h = height;
      if (!w || !h) {
        const dims = this.layerDimensions.get(layerId);
        if (dims) {
          w = dims.width;
          h = dims.height;
        }
      }
      newUrl = rawRgbaToDataUrl(bytes, w || 1, h || 1);
    }

    this.objectUrls.set(layerId, newUrl);
    this.notifyTextureInvalidated(layerId, newUrl);
    return newUrl;
  }

  /**
   * Retrieve binary image bytes for a layer
   */
  public getLayerBytes(layerId: string): Uint8Array | undefined {
    return this.buffers.get(layerId);
  }

  /**
   * Retrieve active object URL for a layer
   */
  public getLayerUrl(layerId: string): string | undefined {
    return this.objectUrls.get(layerId);
  }

  /**
   * Allocate or retrieve a SharedArrayBuffer for high-performance in-place Web Worker filters.
   * If SharedArrayBuffer is unsupported (due to missing COOP/COEP or environment),
   * smoothly fall back to Transferable ArrayBuffer.
   */
  public getSharedBuffer(layerId: string): { buffer: SharedArrayBuffer | ArrayBuffer; isShared: boolean } {
    const bytes = this.buffers.get(layerId);
    if (!bytes) {
      throw new Error(`Layer ${layerId} does not have any pixel buffer allocated`);
    }

    const supportsSAB =
      typeof SharedArrayBuffer !== 'undefined' &&
      (typeof crossOriginIsolated === 'undefined' || crossOriginIsolated === true);

    if (supportsSAB) {
      let sab = this.sharedBuffers.get(layerId);
      if (!sab || sab.byteLength !== bytes.byteLength) {
        sab = new SharedArrayBuffer(bytes.byteLength);
        new Uint8Array(sab).set(bytes);
        this.sharedBuffers.set(layerId, sab);
      }
      return { buffer: sab, isShared: true };
    }

    // Fallback: copy to regular ArrayBuffer for Transferable postMessage
    const copy = bytes.slice().buffer;
    return { buffer: copy, isShared: false };
  }

  /**
   * Commit mutated buffer back to layer and notify GPU textures to rebind.
   */
  public commitSharedBuffer(layerId: string, returnedBuffer?: ArrayBuffer | SharedArrayBuffer): string {
    if (returnedBuffer && !(returnedBuffer instanceof SharedArrayBuffer)) {
      this.buffers.set(layerId, new Uint8Array(returnedBuffer));
    } else {
      const sab = this.sharedBuffers.get(layerId);
      if (sab) {
        this.buffers.set(layerId, new Uint8Array(sab));
      }
    }
    return this.invalidateLayerTexture(layerId);
  }

  /**
   * Clean up memory for a deleted layer
   */
  public deleteLayerData(layerId: string): void {
    this.buffers.delete(layerId);
    this.sharedBuffers.delete(layerId);
    this.layerDimensions.delete(layerId);
    const bmp = this.bitmaps.get(layerId);
    if (bmp) {
      bmp.close();
      this.bitmaps.delete(layerId);
    }
    const url = this.objectUrls.get(layerId);
    if (url) {
      this.notifyTextureDisposed(url);
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
      this.objectUrls.delete(layerId);
    }
  }

  /**
   * Snapshot pixel state reference for history without JSON stringifying bytes
   */
  public savePixelHistorySnapshot(stepId: string, layerId: string, bytes: Uint8Array): void {
    let stepMap = this.historySnapshots.get(stepId);
    if (!stepMap) {
      stepMap = new Map();
      this.historySnapshots.set(stepId, stepMap);
    }
    stepMap.set(layerId, bytes);
  }

  public restorePixelHistorySnapshot(stepId: string): Map<string, Uint8Array> | undefined {
    return this.historySnapshots.get(stepId);
  }

  public purgeHistorySnapshot(stepId: string): void {
    this.historySnapshots.delete(stepId);
  }

  /**
   * Estimate total binary memory consumed in bytes
   */
  public estimateMemoryBytes(): number {
    let total = 0;
    this.buffers.forEach((buf) => {
      total += buf.byteLength;
    });
    this.historySnapshots.forEach((map) => {
      map.forEach((buf) => {
        total += buf.byteLength;
      });
    });
    return total;
  }

  /**
   * Clear all allocated pixel data
   */
  public clearAll(): void {
    this.objectUrls.forEach((url) => {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    });
    this.bitmaps.forEach((bmp) => bmp.close());
    this.buffers.clear();
    this.bitmaps.clear();
    this.objectUrls.clear();
    this.historySnapshots.clear();
    this.sharedBuffers.clear();
    this.layerDimensions.clear();
  }
}

export const pixelRegistry = PixelRegistry.getInstance();
