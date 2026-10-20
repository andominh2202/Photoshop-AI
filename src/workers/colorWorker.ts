/**
 * Color Worker: Dedicated CPU pixel processing thread.
 * Computes high-performance LUTs, Color Matrix adjustments, and Separable 2-Pass Gaussian Blur
 * directly on SharedArrayBuffer in-place (or Transferable ArrayBuffer fallback) with zero main-thread jank.
 */

export interface OpParams {
  brightness?: number; // -1.0 to 1.0 (default 0)
  contrast?: number;   // -1.0 to 1.0 (default 0)
  saturation?: number; // -1.0 to 1.0 (default 0)
  hueRotate?: number;  // -180 to 180 degrees (default 0)
  invert?: boolean;    // default false
  grayscale?: boolean; // default false
  sepia?: boolean;     // default false
  blur?: number;       // 0 to 20 px (default 0)
  curvesLut?: Uint8Array | number[]; // 256 entry lookup table (default identity)
}

export interface WorkerApplyMessage {
  type: 'apply';
  id: string;
  buffer: SharedArrayBuffer | ArrayBuffer;
  isShared: boolean;
  width: number;
  height: number;
  op: OpParams;
  tileX?: number;
  tileY?: number;
  tileW?: number;
  tileH?: number;
}

export interface WorkerDoneMessage {
  type: 'done';
  id: string;
  tileX?: number;
  tileY?: number;
  buffer?: SharedArrayBuffer | ArrayBuffer;
  durationMs: number;
}

/**
 * Builds a fast 256-entry 1D lookup table combining Brightness, Contrast, Curves, and Invert.
 */
export function buildColorLut(op: OpParams): Uint8Array {
  const lut = new Uint8Array(256);
  const brightness = op.brightness ?? 0;
  const contrast = op.contrast ?? 0;
  const invert = op.invert ?? false;
  const curvesLut = op.curvesLut;

  // Contrast factor: (1 + contrast)
  const cFactor = 1 + contrast;
  const bAdd = brightness * 255;

  for (let i = 0; i < 256; i++) {
    // 1. Brightness
    let v = i + bAdd;

    // 2. Contrast centered around mid-gray (128)
    if (contrast !== 0) {
      v = (v - 128) * cFactor + 128;
    }

    // Clamp to [0, 255]
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    let byteVal = Math.round(v);

    // 3. Curves lookup
    if (curvesLut && curvesLut.length === 256) {
      byteVal = curvesLut[byteVal];
    }

    // 4. Invert
    if (invert) {
      byteVal = 255 - byteVal;
    }

    lut[i] = byteVal;
  }

  return lut;
}

/**
 * Separable 2-Pass Gaussian Blur using TypedArray operations.
 * O(W*H*2K) instead of O(W*H*K^2) - No Canvas 2D / DOM required.
 */
export function applySeparableGaussianBlur(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  tileX = 0,
  tileY = 0,
  tileW = width,
  tileH = height
): void {
  if (radius <= 0) return;

  const sigma = Math.max(radius / 2, 0.5);
  const kRadius = Math.min(Math.ceil(2 * sigma), 25);
  const kSize = 2 * kRadius + 1;
  const kernel = new Float32Array(kSize);

  let sum = 0;
  for (let i = 0; i < kSize; i++) {
    const x = i - kRadius;
    const w = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel[i] = w;
    sum += w;
  }
  for (let i = 0; i < kSize; i++) {
    kernel[i] /= sum;
  }

  // Pass 1: Horizontal Blur -> temp buffer
  const temp = new Float32Array(tileW * tileH * 4);

  for (let ty = 0; ty < tileH; ty++) {
    const srcY = tileY + ty;
    if (srcY >= height) continue;

    for (let tx = 0; tx < tileW; tx++) {
      const srcX = tileX + tx;
      let r = 0, g = 0, b = 0, a = 0;

      for (let k = -kRadius; k <= kRadius; k++) {
        const clampedX = Math.max(0, Math.min(width - 1, srcX + k));
        const idx = (srcY * width + clampedX) * 4;
        const kw = kernel[k + kRadius];
        r += rgba[idx] * kw;
        g += rgba[idx + 1] * kw;
        b += rgba[idx + 2] * kw;
        a += rgba[idx + 3] * kw;
      }

      const tempIdx = (ty * tileW + tx) * 4;
      temp[tempIdx] = r;
      temp[tempIdx + 1] = g;
      temp[tempIdx + 2] = b;
      temp[tempIdx + 3] = a;
    }
  }

  // Pass 2: Vertical Blur -> write back to rgba buffer
  for (let tx = 0; tx < tileW; tx++) {
    const destX = tileX + tx;
    if (destX >= width) continue;

    for (let ty = 0; ty < tileH; ty++) {
      const destY = tileY + ty;
      if (destY >= height) continue;

      let r = 0, g = 0, b = 0, a = 0;

      for (let k = -kRadius; k <= kRadius; k++) {
        const clampedY = Math.max(0, Math.min(tileH - 1, ty + k));
        const tempIdx = (clampedY * tileW + tx) * 4;
        const kw = kernel[k + kRadius];
        r += temp[tempIdx] * kw;
        g += temp[tempIdx + 1] * kw;
        b += temp[tempIdx + 2] * kw;
        a += temp[tempIdx + 3] * kw;
      }

      const outIdx = (destY * width + destX) * 4;
      rgba[outIdx] = Math.round(r);
      rgba[outIdx + 1] = Math.round(g);
      rgba[outIdx + 2] = Math.round(b);
      rgba[outIdx + 3] = Math.round(a);
    }
  }
}

/**
 * Apply color operations (LUT, Saturation, HueRotate, Blur) on a specific tile or entire buffer.
 */
export function processPixelBuffer(
  buffer: SharedArrayBuffer | ArrayBuffer,
  width: number,
  height: number,
  op: OpParams,
  tileX = 0,
  tileY = 0,
  tileW = width,
  tileH = height
): void {
  const rgba = new Uint8ClampedArray(buffer);
  const lut = buildColorLut(op);

  const saturation = op.saturation ?? 0;
  const grayscale = op.grayscale ?? false;
  const sepia = op.sepia ?? false;
  const hueRotate = op.hueRotate ?? 0;
  const blur = op.blur ?? 0;

  const hasHue = hueRotate !== 0;
  const hasSat = saturation !== 0;
  const satFactor = 1 + saturation;

  let hCos = 1, hSin = 0;
  if (hasHue) {
    const rad = (hueRotate * Math.PI) / 180;
    hCos = Math.cos(rad);
    hSin = Math.sin(rad);
  }

  const endX = Math.min(width, tileX + tileW);
  const endY = Math.min(height, tileY + tileH);

  // 1. Color LUT + Matrix Pass
  for (let y = tileY; y < endY; y++) {
    const rowOffset = y * width * 4;
    for (let x = tileX; x < endX; x++) {
      const idx = rowOffset + x * 4;

      let r = lut[rgba[idx]];
      let g = lut[rgba[idx + 1]];
      let b = lut[rgba[idx + 2]];

      // Grayscale
      if (grayscale) {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = lum;
        g = lum;
        b = lum;
      } else if (sepia) {
        // Sepia
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r = Math.min(255, sr);
        g = Math.min(255, sg);
        b = Math.min(255, sb);
      } else {
        // Saturation
        if (hasSat) {
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = lum + (r - lum) * satFactor;
          g = lum + (g - lum) * satFactor;
          b = lum + (b - lum) * satFactor;
        }

        // Hue Rotate
        if (hasHue) {
          const hr = (0.213 + hCos * 0.787 - hSin * 0.213) * r +
                     (0.715 - hCos * 0.715 - hSin * 0.715) * g +
                     (0.072 - hCos * 0.072 + hSin * 0.928) * b;
          const hg = (0.213 - hCos * 0.213 + hSin * 0.143) * r +
                     (0.715 + hCos * 0.285 + hSin * 0.140) * g +
                     (0.072 - hCos * 0.072 - hSin * 0.283) * b;
          const hb = (0.213 - hCos * 0.213 - hSin * 0.787) * r +
                     (0.715 - hCos * 0.715 + hSin * 0.715) * g +
                     (0.072 + hCos * 0.928 + hSin * 0.072) * b;
          r = hr;
          g = hg;
          b = hb;
        }
      }

      // Write clamped channels (Alpha preserved untouched)
      rgba[idx] = r < 0 ? 0 : r > 255 ? 255 : Math.round(r);
      rgba[idx + 1] = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
      rgba[idx + 2] = b < 0 ? 0 : b > 255 ? 255 : Math.round(b);
    }
  }

  // 2. Gaussian Blur Pass (if blur > 0)
  if (blur > 0) {
    applySeparableGaussianBlur(rgba, width, height, blur, tileX, tileY, tileW, tileH);
  }
}

// Wire up Web Worker message event if running inside a Web Worker context
if (typeof self !== 'undefined' && 'postMessage' in self) {
  self.onmessage = (event: MessageEvent<WorkerApplyMessage>) => {
    const data = event.data;
    if (!data || data.type !== 'apply') return;

    const start = performance.now();
    const { id, buffer, isShared, width, height, op, tileX = 0, tileY = 0, tileW = width, tileH = height } = data;

    processPixelBuffer(buffer, width, height, op, tileX, tileY, tileW, tileH);

    const durationMs = Math.round(performance.now() - start);
    const response: WorkerDoneMessage = {
      type: 'done',
      id,
      tileX,
      tileY,
      buffer: isShared ? undefined : buffer,
      durationMs,
    };

    if (isShared) {
      (self as any).postMessage(response);
    } else {
      (self as any).postMessage(response, [buffer as ArrayBuffer]);
    }
  };
}
