/**
 * InpaintTool: Manages inpainting mask strokes and binary mask extraction.
 * Draws a translucent red mask (#FF0000 with 0.5 opacity) over the targeted image layer.
 * Generates pure zero-copy binary mask byte buffers for the ONNX Runtime DirectML inpaint pipeline.
 */

export interface Point {
  x: number;
  y: number;
}

export interface MaskStroke {
  points: Point[];
  size: number;
}

export class InpaintToolManager {
  private static instance: InpaintToolManager;
  private strokes: MaskStroke[] = [];
  private currentStroke: Point[] = [];
  private brushSize = 35;
  private listeners: Set<() => void> = new Set();

  private constructor() {}

  public static getInstance(): InpaintToolManager {
    if (!InpaintToolManager.instance) {
      InpaintToolManager.instance = new InpaintToolManager();
    }
    return InpaintToolManager.instance;
  }

  public setBrushSize(size: number): void {
    this.brushSize = Math.max(5, Math.min(200, size));
    this.notify();
  }

  public getBrushSize(): number {
    return this.brushSize;
  }

  public startStroke(x: number, y: number): void {
    this.currentStroke = [{ x, y }];
    this.notify();
  }

  public addPoint(x: number, y: number): void {
    this.currentStroke.push({ x, y });
    this.notify();
  }

  public endStroke(): void {
    if (this.currentStroke.length > 0) {
      this.strokes.push({
        points: [...this.currentStroke],
        size: this.brushSize,
      });
      this.currentStroke = [];
      this.notify();
    }
  }

  public hasMask(): boolean {
    return this.strokes.length > 0 || this.currentStroke.length > 0;
  }

  public clearMask(): void {
    this.strokes = [];
    this.currentStroke = [];
    this.notify();
  }

  public getStrokes(): MaskStroke[] {
    return this.strokes;
  }

  public getCurrentStroke(): Point[] {
    return this.currentStroke;
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (_) {}
    });
  }

  /**
   * Rasterizes all mask strokes into a pure binary grayscale mask buffer.
   * Where 255 = inpaint target region, 0 = untouched background.
   */
  public generateMaskBuffer(width: number, height: number): Uint8Array {
    if (typeof document === 'undefined') {
      return new Uint8Array(width * height);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new Uint8Array(width * height);
    }

    // Black background (0 = preserve original)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // White strokes (255 = inpaint hole)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const allStrokes = [...this.strokes];
    if (this.currentStroke.length > 0) {
      allStrokes.push({ points: this.currentStroke, size: this.brushSize });
    }

    for (const stroke of allStrokes) {
      if (stroke.points.length === 0) continue;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const grayBuffer = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
      grayBuffer[i] = data[i * 4];
    }

    return grayBuffer;
  }

  /**
   * Encode mask as PNG bytes for IPC transfer
   */
  public async generateMaskPng(width: number, height: number): Promise<Uint8Array> {
    if (typeof document === 'undefined') {
      return new Uint8Array(0);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new Uint8Array(0);
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const allStrokes = [...this.strokes];
    if (this.currentStroke.length > 0) {
      allStrokes.push({ points: this.currentStroke, size: this.brushSize });
    }

    for (const stroke of allStrokes) {
      if (stroke.points.length === 0) continue;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(new Uint8Array(0));
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(new Uint8Array(reader.result as ArrayBuffer));
        };
        reader.readAsArrayBuffer(blob);
      }, 'image/png');
    });
  }
}

export const inpaintToolManager = InpaintToolManager.getInstance();
