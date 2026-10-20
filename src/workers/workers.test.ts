import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildColorLut,
  applySeparableGaussianBlur,
  processPixelBuffer,
  OpParams,
} from './colorWorker';
import { WorkerPool } from './workerPool';

describe('LUT & CPU Pixel Worker Core Algorithms', () => {
  it('1. buildColorLut produces exact identity array for neutral op', () => {
    const lut = buildColorLut({});
    expect(lut.length).toBe(256);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBe(i);
    }
  });

  it('2. buildColorLut calculates brightness correctly with clamping (golden values)', () => {
    // Brightness +0.2 -> adds ~51
    const lutBright = buildColorLut({ brightness: 0.2 });
    expect(lutBright[0]).toBe(51);
    expect(lutBright[100]).toBe(151);
    expect(lutBright[220]).toBe(255); // clamped

    // Brightness -0.2 -> subtracts ~51
    const lutDark = buildColorLut({ brightness: -0.2 });
    expect(lutDark[0]).toBe(0); // clamped
    expect(lutDark[100]).toBe(49);
    expect(lutDark[255]).toBe(204);
  });

  it('3. buildColorLut calculates contrast centered at 128 (golden values)', () => {
    const lutContrast = buildColorLut({ contrast: 0.5 });
    // Midpoint 128 remains 128
    expect(lutContrast[128]).toBe(128);
    // Values < 128 become darker: (64 - 128) * 1.5 + 128 = 32
    expect(lutContrast[64]).toBe(32);
    // Values > 128 become brighter: (192 - 128) * 1.5 + 128 = 224
    expect(lutContrast[192]).toBe(224);
  });

  it('4. buildColorLut inverts pixel values correctly', () => {
    const lutInvert = buildColorLut({ invert: true });
    expect(lutInvert[0]).toBe(255);
    expect(lutInvert[128]).toBe(127);
    expect(lutInvert[255]).toBe(0);
  });

  it('5. processPixelBuffer applies color LUT and preserves Alpha channel', () => {
    // 2x2 image (4 pixels = 16 bytes)
    const buffer = new Uint8Array([
      100, 150, 200, 255, // Pixel 0
      50,  80,  120, 180, // Pixel 1
      0,   0,   0,   255, // Pixel 2
      255, 255, 255, 100, // Pixel 3
    ]);

    processPixelBuffer(buffer.buffer, 2, 2, { brightness: 0.1 });

    // Alpha channel must be preserved exactly
    expect(buffer[3]).toBe(255);
    expect(buffer[7]).toBe(180);
    expect(buffer[11]).toBe(255);
    expect(buffer[15]).toBe(100);

    // RGB channels must be increased by ~26
    expect(buffer[0]).toBe(126);
    expect(buffer[1]).toBe(176);
    expect(buffer[2]).toBe(226);
  });

  it('6. applySeparableGaussianBlur smooths step edge without mutating alpha', () => {
    // 4x1 image with sharp black to white transition
    const rgba = new Uint8ClampedArray([
      0,   0,   0,   255,
      0,   0,   0,   255,
      255, 255, 255, 255,
      255, 255, 255, 255,
    ]);

    applySeparableGaussianBlur(rgba, 4, 1, 1.0);

    // Boundary pixel 1 should be softened above 0
    expect(rgba[4]).toBeGreaterThan(0);
    // Boundary pixel 2 should be softened below 255
    expect(rgba[8]).toBeLessThan(255);
    // Alpha must remain 255
    expect(rgba[3]).toBe(255);
    expect(rgba[7]).toBe(255);
    expect(rgba[11]).toBe(255);
    expect(rgba[15]).toBe(255);
  });
});

describe('WorkerPool Lifecycle & Queuing', () => {
  let pool: WorkerPool;

  beforeEach(() => {
    pool = WorkerPool.getInstance();
  });

  it('1. WorkerPool initializes with fixed pool size between 2 and 4', () => {
    const size = pool.getPoolSize();
    expect(size).toBeGreaterThanOrEqual(2);
    expect(size).toBeLessThanOrEqual(4);
  });

  it('2. WorkerPool dispatches task and executes in-place or fallback', async () => {
    const buffer = new Uint8Array([128, 128, 128, 255]);
    const result = await pool.run({
      id: 'task-test-1',
      buffer: buffer.buffer,
      isShared: false,
      width: 1,
      height: 1,
      op: { brightness: 0.1 },
    });

    expect(result.id).toBe('task-test-1');
    expect(buffer[0]).toBe(154); // 128 + 26
  });

  it('3. WorkerPool cancellation marks and skips task', async () => {
    pool.cancel('task-to-cancel');

    const buffer = new Uint8Array([50, 50, 50, 255]);
    // Dispatched with cancelled ID should resolve immediately with cancelled: true and not modify buffer
    const res = await pool.run({
      id: 'task-to-cancel',
      buffer: buffer.buffer,
      isShared: false,
      width: 1,
      height: 1,
      op: { brightness: 0.5 },
    });

    expect(res.cancelled).toBe(true);
    expect(buffer[0]).toBe(50); // Unmodified
    expect(pool.getQueueLength()).toBe(0);
  });

  it('4. runTiled delegates correctly for large image buffer (> 4MP)', async () => {
    // 2048 x 2048 = 4.19 MP
    const width = 2048;
    const height = 2048;
    const byteLength = width * height * 4;

    // Allocate buffer
    const buf = new Uint8Array(byteLength);
    // Fill first pixel
    buf[0] = 100;
    buf[1] = 100;
    buf[2] = 100;
    buf[3] = 255;

    const res = await pool.runTiled({
      id: 'large-tiled-test',
      buffer: buf.buffer,
      isShared: false,
      width,
      height,
      op: { invert: true },
    });

    expect(res.id).toBe('large-tiled-test');
    expect(buf[0]).toBe(155); // 255 - 100
  });
});
