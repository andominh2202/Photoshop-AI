import { describe, it, expect, beforeEach } from 'vitest';
import { inpaintToolManager } from './InpaintTool';

describe('InpaintToolManager Mask Management', () => {
  beforeEach(() => {
    inpaintToolManager.clearMask();
  });

  it('1. Initializes with default brush size and empty mask', () => {
    expect(inpaintToolManager.getBrushSize()).toBe(35);
    expect(inpaintToolManager.hasMask()).toBe(false);
    expect(inpaintToolManager.getStrokes().length).toBe(0);
  });

  it('2. Brush size changes clamp within safe limits (5 to 200)', () => {
    inpaintToolManager.setBrushSize(50);
    expect(inpaintToolManager.getBrushSize()).toBe(50);

    inpaintToolManager.setBrushSize(2);
    expect(inpaintToolManager.getBrushSize()).toBe(5);

    inpaintToolManager.setBrushSize(500);
    expect(inpaintToolManager.getBrushSize()).toBe(200);
  });

  it('3. Records stroke points and completes strokes', () => {
    inpaintToolManager.startStroke(10, 20);
    expect(inpaintToolManager.hasMask()).toBe(true);

    inpaintToolManager.addPoint(15, 25);
    inpaintToolManager.addPoint(20, 30);
    expect(inpaintToolManager.getCurrentStroke().length).toBe(3);

    inpaintToolManager.endStroke();
    expect(inpaintToolManager.getStrokes().length).toBe(1);
    expect(inpaintToolManager.getStrokes()[0].points.length).toBe(3);
    expect(inpaintToolManager.getCurrentStroke().length).toBe(0);
  });

  it('4. clearMask resets all registered strokes', () => {
    inpaintToolManager.startStroke(5, 5);
    inpaintToolManager.endStroke();
    expect(inpaintToolManager.hasMask()).toBe(true);

    inpaintToolManager.clearMask();
    expect(inpaintToolManager.hasMask()).toBe(false);
    expect(inpaintToolManager.getStrokes().length).toBe(0);
  });

  it('5. generateMaskBuffer outputs byte array with exact dimensions', () => {
    const width = 100;
    const height = 50;
    const mask = inpaintToolManager.generateMaskBuffer(width, height);
    expect(mask).toBeInstanceOf(Uint8Array);
    expect(mask.byteLength).toBe(width * height);
  });
});
