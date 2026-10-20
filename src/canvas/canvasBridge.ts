import type { Application, Container, Graphics } from 'pixi.js';

export interface CanvasExportProvider {
  getApp: () => Application | null;
  getWorldContainer: () => Container | null;
  getSelectionGraphics: () => Graphics | null;
  getTransformBox: () => Graphics | null;
  getDrawingGraphics: () => Graphics | null;
  getArtboardBg?: () => Graphics | null;
}

let activeExportProvider: CanvasExportProvider | null = null;

export function registerCanvasExportProvider(provider: CanvasExportProvider | null): void {
  activeExportProvider = provider;
}

export function getCanvasExportProvider(): CanvasExportProvider | null {
  return activeExportProvider;
}
