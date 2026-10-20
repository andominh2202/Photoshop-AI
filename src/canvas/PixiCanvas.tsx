import React, { useEffect, useRef, useState, useCallback, useTransition } from 'react';
import type {
  Application,
  Container,
  Sprite,
  Graphics,
  ColorMatrixFilter,
  BlurFilter,
  Texture,
} from 'pixi.js';
import { useEditorStore, LayerItem } from '@/store/useEditorStore';
import { sendImageToAI, cancelAIJob, onAIProgress, reportAppReady } from '@/platform/api';
import { pixelRegistry } from '@/store/pixelStore';
import type { TileSnapshot } from '@/history/tileStore';
import { inpaintToolManager } from '@/tools/InpaintTool';
import { Sparkles, Loader2 } from 'lucide-react';
import { registerCanvasExportProvider } from './canvasBridge';
import { useKeyboardContext } from '@/context/KeyboardContext';
import { showToast } from '@/store/toastStore';
import { hotStore } from '@/store/hotStore';

interface PixiCanvasProps {
  className?: string;
}

interface FilterCacheEntry {
  colorMatrix?: ColorMatrixFilter;
  blur?: BlurFilter;
  lastHash?: string;
}

export const PixiCanvas: React.FC<PixiCanvasProps> = ({ className }) => {
  const { isSpacePressedRef } = useKeyboardContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiModuleRef = useRef<typeof import('pixi.js') | null>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const artboardBgRef = useRef<Graphics | null>(null);

  // Display object registries
  const layerSpritesRef = useRef<Map<string, Sprite | Container>>(new Map());
  const layerFiltersRef = useRef<Map<string, FilterCacheEntry>>(new Map());
  const textureCacheRef = useRef<Map<string, Texture>>(new Map());

  // Interactive overlays
  const drawingGraphicsRef = useRef<Graphics | null>(null);
  const selectionGraphicsRef = useRef<Graphics | null>(null);
  const transformBoxRef = useRef<Graphics | null>(null);

  // Decoupled Viewport Transform Ref (Pure 60-120 FPS, bypasses React re-render)
  const viewportRef = useRef({
    zoom: 0.75,
    panX: 0,
    panY: 0,
    isInitialized: false,
    syncTimer: null as ReturnType<typeof setTimeout> | null,
  });

  // Local display zoom for UI badge (updated debounced to protect 120 FPS rendering)
  const [displayZoom, setDisplayZoom] = useState(75);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeBackend, setActiveBackend] = useState<string>('Detecting...');

  // Narrow Zustand selectors: prevent re-rendering PixiCanvas on unrelated state changes
  const docWidth = useEditorStore((s) => s.docWidth);
  const docHeight = useEditorStore((s) => s.docHeight);
  const backgroundColor = useEditorStore((s) => s.backgroundColor);
  const showRulers = useEditorStore((s) => s.showRulers);
  const layers = useEditorStore((s) => s.layers);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const activeTool = useEditorStore((s) => s.activeTool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const brushColor = useEditorStore((s) => s.brushColor);
  const brushOpacity = useEditorStore((s) => s.brushOpacity);
  const shapeType = useEditorStore((s) => s.shapeType);
  const selection = useEditorStore((s) => s.selection);
  const aiState = useEditorStore((s) => s.aiState);

  // Actions
  const setBrushColor = useEditorStore((s) => s.setBrushColor);
  const setSelection = useEditorStore((s) => s.setSelection);
  const setAiProcessing = useEditorStore((s) => s.setAiProcessing);
  const updateLayerData = useEditorStore((s) => s.updateLayerData);
  const setLayerPosition = useEditorStore((s) => s.setLayerPosition);
  const addLayer = useEditorStore((s) => s.addLayer);
  const addTextLayer = useEditorStore((s) => s.addTextLayer);
  const fillActiveLayer = useEditorStore((s) => s.fillActiveLayer);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const executeCommand = useEditorStore((s) => s.executeCommand);

  const [, startTransition] = useTransition();
  const currentJobIdRef = useRef<string | null>(null);

  // Interaction tracking refs
  const isInteractingRef = useRef(false);
  const isPanningRef = useRef(false);
  const isDrawingRef = useRef(false);
  const interactionModeRef = useRef<'pan' | 'move' | 'brush' | 'eraser' | 'marquee' | 'shape' | 'ai-inpaint' | null>(null);
  const inpaintMaskGraphicsRef = useRef<Graphics | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const strokePointsRef = useRef<{ x: number; y: number }[]>([]);
  const strokeBBoxRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number }>({
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  });
  const startDragRef = useRef<{
    clientX: number;
    clientY: number;
    worldX: number;
    worldY: number;
    layerStartX: number;
    layerStartY: number;
  }>({
    clientX: 0,
    clientY: 0,
    worldX: 0,
    worldY: 0,
    layerStartX: 0,
    layerStartY: 0,
  });

  // Zero-latency coordinate converter: Client Screen -> Document World
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current || !worldRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const world = worldRef.current;

    return {
      x: (localX - world.position.x) / world.scale.x,
      y: (localY - world.position.y) / world.scale.y,
    };
  }, []);

  // Sync viewport changes back to Zustand & UI badge in debounced fashion
  const scheduleStoreViewportSync = useCallback(() => {
    if (viewportRef.current.syncTimer) {
      clearTimeout(viewportRef.current.syncTimer);
    }
    viewportRef.current.syncTimer = setTimeout(() => {
      const { zoom, panX, panY } = viewportRef.current;
      setDisplayZoom(Math.round(zoom * 100));
      useEditorStore.getState().setZoom(zoom);
      useEditorStore.getState().setPan(panX, panY);
    }, 120);
  }, []);

  // Update transform handles outline around active layer
  const updateTransformHandles = useCallback(() => {
    if (!transformBoxRef.current || !worldRef.current) return;
    const gfx = transformBoxRef.current;
    gfx.clear();

    if (activeTool !== 'move') return;

    const activeLayer = layers.find((l) => l.id === activeLayerId);
    if (!activeLayer || !activeLayer.visible) return;

    const sprite = layerSpritesRef.current.get(activeLayer.id);
    if (!sprite) return;

    // Use local bounds from active sprite directly for 0-latency feedback
    const x = sprite.position.x;
    const y = sprite.position.y;
    const w = sprite.width;
    const h = sprite.height;

    if (w <= 0 || h <= 0) return;

    // Outline
    gfx.rect(x, y, w, h);
    gfx.stroke({ width: 1.5 / worldRef.current.scale.x, color: 0x00a8ff });

    // 8 Anchor Handles (sized relative to scale so they stay crisp)
    const handleSize = 7 / worldRef.current.scale.x;
    const corners = [
      { x, y },
      { x: x + w / 2, y },
      { x: x + w, y },
      { x, y: y + h / 2 },
      { x: x + w, y: y + h / 2 },
      { x, y: y + h },
      { x: x + w / 2, y: y + h },
      { x: x + w, y: y + h },
    ];

    corners.forEach((c) => {
      gfx.rect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
      gfx.fill({ color: 0xffffff });
      gfx.stroke({ width: 1 / worldRef.current!.scale.x, color: 0x00a8ff });
    });
  }, [activeTool, activeLayerId, layers]);

  // 1. Initialize PixiJS v8 with WebGPU priority & silent WebGL fallback via requestIdleCallback
  useEffect(() => {
    let isCancelled = false;

    async function initPixi() {
      if (!containerRef.current || appRef.current) return;

      // Lazy import pixi.js dynamically to avoid blocking initial UI paint
      const pixi = await import('pixi.js');
      if (isCancelled) return;
      pixiModuleRef.current = pixi;
      const { Application, Container, Graphics } = pixi;

      let app = new Application();
      try {
        await app.init({
          preference: 'webgpu',
          resizeTo: containerRef.current,
          backgroundColor: 0x111315,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          preserveDrawingBuffer: true,
        });
      } catch (err) {
        console.info('[PhotoshopAI] WebGPU unavailable, silent fallback to WebGL2');
        if (isCancelled) return;
        app = new Application();
        await app.init({
          preference: 'webgl',
          resizeTo: containerRef.current,
          backgroundColor: 0x111315,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          preserveDrawingBuffer: true,
        });
      }

      if (isCancelled) {
        app.destroy(true, { children: true });
        return;
      }

      appRef.current = app;
      containerRef.current.appendChild(app.canvas);

      registerCanvasExportProvider({
        getApp: () => appRef.current,
        getWorldContainer: () => worldRef.current,
        getSelectionGraphics: () => selectionGraphicsRef.current,
        getTransformBox: () => transformBoxRef.current,
        getDrawingGraphics: () => drawingGraphicsRef.current,
      });

      const rendererType = (app.renderer as any).type || (app.renderer as any).name || 'WebGPU';
      setActiveBackend(`PhotoshopAI Engine (${rendererType === 1 ? 'WebGL' : 'WebGPU 120 FPS'})`);

      // Root World Container for Pan & Zoom transforms
      const world = new Container();
      world.label = 'WorldViewport';
      // Enable PixiJS v8 Hardware Culling
      world.cullable = true;
      app.stage.addChild(world);
      worldRef.current = world;

      // 1. Artboard Background
      const artboardBg = new Graphics();
      artboardBg.rect(0, 0, docWidth, docHeight);
      artboardBg.fill({ color: backgroundColor === 'transparent' ? 0x1e1e24 : 0xffffff, alpha: 1 });
      artboardBg.stroke({ width: 1, color: 0x333b42 });
      artboardBg.cullable = true;
      world.addChild(artboardBg);
      artboardBgRef.current = artboardBg;

      // 2. Persistent Interactive Drawing Layer for Brush / Eraser
      const drawingGfx = new Graphics();
      drawingGfx.cullable = false;
      world.addChild(drawingGfx);
      drawingGraphicsRef.current = drawingGfx;

      // 2b. Inpainting Translucent Mask Layer
      const inpaintMaskGfx = new Graphics();
      inpaintMaskGfx.cullable = false;
      world.addChild(inpaintMaskGfx);
      inpaintMaskGraphicsRef.current = inpaintMaskGfx;

      // 3. Selection Marquee Overlay Graphics
      const selectionGfx = new Graphics();
      selectionGfx.cullable = false;
      world.addChild(selectionGfx);
      selectionGraphicsRef.current = selectionGfx;

      // 4. Transform Box Overlay for Active Layer
      const transformGfx = new Graphics();
      transformGfx.cullable = false;
      world.addChild(transformGfx);
      transformBoxRef.current = transformGfx;

      // Initial center alignment of viewport
      const { clientWidth, clientHeight } = containerRef.current;
      const initialZoom = 0.75;
      const initialPanX = 0;
      const initialPanY = 0;
      viewportRef.current.zoom = initialZoom;
      viewportRef.current.panX = initialPanX;
      viewportRef.current.panY = initialPanY;
      setDisplayZoom(Math.round(initialZoom * 100));

      world.position.set(
        clientWidth / 2 + initialPanX - (docWidth * initialZoom) / 2,
        clientHeight / 2 + initialPanY - (docHeight * initialZoom) / 2
      );
      world.scale.set(initialZoom);
      viewportRef.current.isInitialized = true;

      // Real-time FPS monitor inside Pixi Ticker (routes directly to hotStore, 0 React churn)
      let frameCount = 0;
      let lastTime = performance.now();
      app.ticker.add(() => {
        frameCount++;
        const now = performance.now();
        if (now - lastTime >= 1000) {
          const currentFps = Math.round((frameCount * 1000) / (now - lastTime));
          hotStore.setMetrics({ fps: currentFps });
          frameCount = 0;
          lastTime = now;
        }
      });

      setIsInitialized(true);

      // Register export provider for ExportModal
      registerCanvasExportProvider({
        getApp: () => appRef.current,
        getWorldContainer: () => worldRef.current,
        getSelectionGraphics: () => selectionGraphicsRef.current,
        getTransformBox: () => transformBoxRef.current,
        getDrawingGraphics: () => drawingGraphicsRef.current,
        getArtboardBg: () => artboardBgRef.current,
      });

      // Measure TTI & notify native dual-runtimes and UI panels
      const tti = Math.round(performance.now() - ((window as any).__appStartTime || performance.now()));
      console.log(`[PhotoshopAI] Canvas Engine Ready! TTI: ${tti} ms`);
      window.dispatchEvent(new CustomEvent('canvas-ready', { detail: { tti } }));
      reportAppReady(tti).catch(() => {});
    }

    const scheduleInit = typeof window !== 'undefined' && 'requestIdleCallback' in window
      ? (window as any).requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 0);

    const cancelInit = typeof window !== 'undefined' && 'cancelIdleCallback' in window
      ? (window as any).cancelIdleCallback
      : (id: any) => clearTimeout(id);

    const idleHandle = scheduleInit(initPixi);

    // Listen for VRAM texture disposals from commandManager / pixelRegistry eviction
    const cleanupDisposed = pixelRegistry.onTextureDisposed((url) => {
      const tex = textureCacheRef.current.get(url);
      if (tex) {
        tex.destroy(true);
        textureCacheRef.current.delete(url);
      }
    });

    // Listen for dynamic layer texture updates from undo/redo/brush commands
    const cleanupInvalidated = pixelRegistry.onTextureInvalidated(async (layerId, newUrl) => {
      const sprite = layerSpritesRef.current.get(layerId);
      if (sprite) {
        try {
          const pixi = pixiModuleRef.current || (await import('pixi.js'));
          let newTex = textureCacheRef.current.get(newUrl);
          if (!newTex) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = newUrl;
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            });
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              newTex = pixi.Texture.from(img);
              textureCacheRef.current.set(newUrl, newTex);
            }
          }
          if (newTex && newTex.width > 0 && !(sprite as any).destroyed) {
            (sprite as any).texture = newTex;
            const curW = useEditorStore.getState().docWidth;
            const curH = useEditorStore.getState().docHeight;
            const scale = Math.min(curW / newTex.width, curH / newTex.height);
            if (isFinite(scale)) {
              (sprite as any).scale.set(scale);
            }
          }
        } catch (_) {}
      }
    });

    // Subscribe to InpaintTool mask changes to re-render translucent red mask
    const unbindInpaint = inpaintToolManager.subscribe(() => {
      const gfx = inpaintMaskGraphicsRef.current;
      if (!gfx) return;
      gfx.clear();
      for (const stroke of inpaintToolManager.getStrokes()) {
        if (stroke.points.length === 0) continue;
        gfx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          gfx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        gfx.stroke({ width: stroke.size, color: 0xff0000, alpha: 0.5, cap: 'round', join: 'round' });
      }
      const curr = inpaintToolManager.getCurrentStroke();
      if (curr.length > 0) {
        gfx.moveTo(curr[0].x, curr[0].y);
        for (let i = 1; i < curr.length; i++) {
          gfx.lineTo(curr[i].x, curr[i].y);
        }
        gfx.stroke({ width: inpaintToolManager.getBrushSize(), color: 0xff0000, alpha: 0.5, cap: 'round', join: 'round' });
      }
    });

    return () => {
      isCancelled = true;
      cancelInit(idleHandle);
      cleanupDisposed();
      cleanupInvalidated();
      unbindInpaint();
      if (viewportRef.current.syncTimer) {
        clearTimeout(viewportRef.current.syncTimer);
      }

      // Release cached textures and destroy Pixi app
      textureCacheRef.current.forEach((t) => t.destroy(true));
      textureCacheRef.current.clear();
      layerFiltersRef.current.clear();

      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
        layerSpritesRef.current.clear();
      }
      registerCanvasExportProvider(null);
    };
  }, [docWidth, docHeight, backgroundColor]);


  // 2. Synchronize Layers in PixiJS v8 with 2-Phase Race-Free Ordering & Filter Caching
  useEffect(() => {
    if (!worldRef.current || !isInitialized) return;
    const pixi = pixiModuleRef.current;
    if (!pixi) return;
    const { TextStyle, Text, Sprite, Texture, ColorMatrixFilter, BlurFilter } = pixi;

    const world = worldRef.current;
    const existingSprites = layerSpritesRef.current;
    const filterCache = layerFiltersRef.current;
    const reversedLayers = [...layers].reverse();

    // Resize artboard background if doc dimensions change
    if (artboardBgRef.current) {
      artboardBgRef.current.clear();
      artboardBgRef.current.rect(0, 0, docWidth, docHeight);
      artboardBgRef.current.fill({ color: backgroundColor === 'transparent' ? 0x1e1e24 : 0xffffff, alpha: 1 });
      artboardBgRef.current.stroke({ width: 1, color: 0x333b42 });
    }

    // Phase 0: Remove deleted layers and destroy unneeded display objects & filter caches
    existingSprites.forEach((obj, id) => {
      if (!layers.some((l) => l.id === id)) {
        try {
          world.removeChild(obj);
          obj.destroy();
        } catch (e) {
          console.warn(`[PixiCanvas] Error removing deleted layer ${id}:`, e);
        }
        existingSprites.delete(id);
        filterCache.delete(id);
      }
    });

    // Phase 1 (Synchronous): Create/configure display objects and assign exact z-index
    reversedLayers.forEach((layer, index) => {
      let displayObject = existingSprites.get(layer.id);

      if (!displayObject) {
        if (layer.type === 'text') {
          const style = new TextStyle({
            fontFamily: layer.fontFamily || 'Inter',
            fontSize: layer.fontSize || 48,
            fill: layer.textColor || '#ffffff',
            fontWeight: 'bold',
          });
          const textObj = new Text({ text: layer.text || 'Text', style });
          textObj.cullable = true;
          world.addChild(textObj);
          displayObject = textObj;
          existingSprites.set(layer.id, displayObject);
        } else {
          const sprite = new Sprite(Texture.EMPTY);
          sprite.label = layer.name;
          sprite.cullable = true;
          world.addChild(sprite);
          displayObject = sprite;
          existingSprites.set(layer.id, displayObject);
        }
      }

      // Safe z-index placement (index 0 is artboardBg)
      const targetIdx = index + 1;
      try {
        if (targetIdx >= 0 && targetIdx < world.children.length) {
          world.setChildIndex(displayObject, targetIdx);
        } else {
          console.warn(
            `[PixiCanvas] Layer ${layer.id} index out of bounds: target=${targetIdx}, childrenCount=${world.children.length}`
          );
        }
      } catch (err) {
        console.warn(`[PixiCanvas] Failed to set child index for layer ${layer.id}:`, err);
      }

      // Position, visibility & blend mode sync
      displayObject.position.set(layer.x, layer.y);
      displayObject.visible = layer.visible;
      displayObject.alpha = layer.opacity;
      displayObject.blendMode = (layer.blendMode as unknown as 'normal') || 'normal';

      // Text content update
      if (layer.type === 'text' && displayObject instanceof Text) {
        displayObject.text = layer.text || '';
        if (layer.fontSize) displayObject.style.fontSize = layer.fontSize;
        if (layer.textColor) displayObject.style.fill = layer.textColor;
      }

      // Reusable Filter Cache to eliminate memory thrashing
      const { brightness, contrast, saturation, blur, invert, grayscale, sepia } = layer.adjustments;
      const currentAdjustmentHash = `${brightness}_${contrast}_${saturation}_${blur}_${invert}_${grayscale}_${sepia}`;
      let cachedFilter = filterCache.get(layer.id);

      if (!cachedFilter) {
        cachedFilter = {};
        filterCache.set(layer.id, cachedFilter);
      }

      if (cachedFilter.lastHash !== currentAdjustmentHash) {
        cachedFilter.lastHash = currentAdjustmentHash;
        const activeFilters: (ColorMatrixFilter | BlurFilter)[] = [];

        if (brightness !== 0 || contrast !== 0 || saturation !== 0 || invert || grayscale || sepia) {
          if (!cachedFilter.colorMatrix) {
            cachedFilter.colorMatrix = new ColorMatrixFilter();
          }
          const cm = cachedFilter.colorMatrix;
          cm.reset();
          if (brightness !== 0) cm.brightness(1 + brightness, false);
          if (contrast !== 0) cm.contrast(1 + contrast, false);
          if (saturation !== 0) cm.saturate(saturation, false);
          if (invert) cm.negative(false);
          if (grayscale) cm.desaturate();
          if (sepia) cm.sepia(false);
          activeFilters.push(cm);
        }

        if (blur > 0) {
          if (!cachedFilter.blur) {
            cachedFilter.blur = new BlurFilter();
          }
          cachedFilter.blur.strength = blur;
          activeFilters.push(cachedFilter.blur);
        }

        displayObject.filters = activeFilters.length > 0 ? activeFilters : null;
      }
    });

    // Bring interactive overlays to top of world stack in fixed order AFTER all layer sprites
    const bringOverlayToTop = (gfx: Container | null) => {
      if (!gfx || !world.children.includes(gfx)) return;
      try {
        world.setChildIndex(gfx, world.children.length - 1);
      } catch (e) {
        console.warn('[PixiCanvas] Error setting overlay index:', e);
      }
    };

    bringOverlayToTop(drawingGraphicsRef.current);
    bringOverlayToTop(inpaintMaskGraphicsRef.current);
    bringOverlayToTop(selectionGraphicsRef.current);
    bringOverlayToTop(transformBoxRef.current);
    updateTransformHandles();

    // Phase 2 (Async Parallel): Load textures for raster layers into existing sprites
    const textureLoadPromises = reversedLayers.map(async (layer) => {
      if (layer.type === 'text' || !layer.textureUrl) return;
      const displayObject = existingSprites.get(layer.id) as Sprite | undefined;
      if (!displayObject || displayObject.destroyed) return;

      try {
        let texture = textureCacheRef.current.get(layer.textureUrl);
        if (!texture) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = layer.textureUrl;
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          });
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            texture = Texture.from(img);
            textureCacheRef.current.set(layer.textureUrl, texture);

            // Pre-populate pixelRegistry with initial layer pixels
            if (!pixelRegistry.getLayerBytes(layer.id)) {
              try {
                const offscreen = document.createElement('canvas');
                offscreen.width = docWidth;
                offscreen.height = docHeight;
                const octx = offscreen.getContext('2d');
                if (octx) {
                  const scale = Math.min(docWidth / img.naturalWidth, docHeight / img.naturalHeight);
                  const dw = img.naturalWidth * scale;
                  const dh = img.naturalHeight * scale;
                  const dx = (docWidth - dw) / 2;
                  const dy = (docHeight - dh) / 2;
                  octx.drawImage(img, dx, dy, dw, dh);
                  const imgData = octx.getImageData(0, 0, docWidth, docHeight);
                  pixelRegistry.setLayerBytes(layer.id, new Uint8Array(imgData.data.buffer), 'image/png', docWidth, docHeight);
                }
              } catch (_) {}
            }
          }
        }

        if (texture && texture.width > 0 && !displayObject.destroyed) {
          displayObject.texture = texture;
          const scale = Math.min(docWidth / texture.width, docHeight / texture.height);
          if (isFinite(scale)) {
            displayObject.scale.set(scale);
          }
        }
      } catch (e) {
        console.warn(`Layer texture fallback for ${layer.id}:`, e);
      }
    });

    Promise.all(textureLoadPromises);
  }, [layers, isInitialized, docWidth, docHeight, backgroundColor, updateTransformHandles]);

  // 3. Render Active Selection Box (Marching Ants Outline)
  useEffect(() => {
    if (!selectionGraphicsRef.current) return;
    const gfx = selectionGraphicsRef.current;
    gfx.clear();

    if (selection) {
      gfx.rect(selection.x, selection.y, selection.width, selection.height);
      gfx.stroke({ width: 1.5 / (worldRef.current?.scale.x || 1), color: 0x3b82f6, alpha: 0.9 });
      gfx.fill({ color: 0x3b82f6, alpha: 0.1 });
    }
  }, [selection]);

  // 4. Update transform handles when active tool or active layer changes
  useEffect(() => {
    updateTransformHandles();
  }, [activeTool, activeLayerId, updateTransformHandles]);

  // 5. Zero-Lag Viewport Zoom at Mouse Anchor Point (Photoshop Standard)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (!containerRef.current || !worldRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const world = worldRef.current;
      const currentScale = world.scale.x;

      // Precise exponential zoom factor
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newScale = Math.max(0.05, Math.min(32, currentScale * zoomFactor));

      if (newScale === currentScale) return;

      // Maintain world point directly under cursor
      const worldX = (mouseX - world.position.x) / currentScale;
      const worldY = (mouseY - world.position.y) / currentScale;

      const newPanX = mouseX - worldX * newScale;
      const newPanY = mouseY - worldY * newScale;

      world.scale.set(newScale);
      world.position.set(newPanX, newPanY);

      // Track in ref without triggering React re-render
      viewportRef.current.zoom = newScale;
      viewportRef.current.panX = newPanX - (rect.width / 2 - (docWidth * newScale) / 2);
      viewportRef.current.panY = newPanY - (rect.height / 2 - (docHeight * newScale) / 2);

      updateTransformHandles();
      scheduleStoreViewportSync();
    },
    [docWidth, docHeight, updateTransformHandles, scheduleStoreViewportSync]
  );

  // 6. Native High-Performance Pointer Down (PointerCapture API)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!containerRef.current || !worldRef.current) return;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);

      const worldPos = screenToWorld(e.clientX, e.clientY);
      isInteractingRef.current = true;
      lastPointRef.current = worldPos;

      const activeLayer = layers.find((l) => l.id === activeLayerId);

      startDragRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        worldX: worldPos.x,
        worldY: worldPos.y,
        layerStartX: activeLayer?.x || 0,
        layerStartY: activeLayer?.y || 0,
      };

      // Determine interaction mode: Space + Drag, Hand tool, or Middle Click triggers pan
      const isSpacePanning = Boolean(isSpacePressedRef.current);
      if (e.button === 1 || activeTool === 'hand' || isSpacePanning) {
        interactionModeRef.current = 'pan';
        isPanningRef.current = true;
      } else if (activeTool === 'move' && activeLayerId) {
        interactionModeRef.current = 'move';
      } else if (activeTool === 'brush' && drawingGraphicsRef.current) {
        interactionModeRef.current = 'brush';
        isDrawingRef.current = true;
        const hex = parseInt(brushColor.replace('#', ''), 16);
        drawingGraphicsRef.current.circle(worldPos.x, worldPos.y, brushSize / 2);
        drawingGraphicsRef.current.fill({ color: hex, alpha: brushOpacity });

        strokePointsRef.current = [{ x: worldPos.x, y: worldPos.y }];
        strokeBBoxRef.current = {
          minX: worldPos.x - brushSize,
          minY: worldPos.y - brushSize,
          maxX: worldPos.x + brushSize,
          maxY: worldPos.y + brushSize,
        };
      } else if (activeTool === 'eraser' && drawingGraphicsRef.current) {
        interactionModeRef.current = 'eraser';
        isDrawingRef.current = true;
        // Preview eraser stroke in translucent gray/white on temporary overlay
        drawingGraphicsRef.current.circle(worldPos.x, worldPos.y, brushSize / 2);
        drawingGraphicsRef.current.fill({ color: 0xffffff, alpha: 0.35 });

        strokePointsRef.current = [{ x: worldPos.x, y: worldPos.y }];
        strokeBBoxRef.current = {
          minX: worldPos.x - brushSize,
          minY: worldPos.y - brushSize,
          maxX: worldPos.x + brushSize,
          maxY: worldPos.y + brushSize,
        };
      } else if (activeTool === 'eyedropper') {
        const px = Math.floor(worldPos.x);
        const py = Math.floor(worldPos.y);
        if (px >= 0 && px < docWidth && py >= 0 && py < docHeight) {
          let pickedR = 255, pickedG = 255, pickedB = 255, pickedA = 0;
          // Priority 1: sample from active layer pixel buffer if opaque
          const activeBuf = activeLayerId ? pixelRegistry.getLayerBytes(activeLayerId) : null;
          if (activeBuf && activeBuf.length >= docWidth * docHeight * 4) {
            const idx = (py * docWidth + px) * 4;
            if (activeBuf[idx + 3] > 0) {
              pickedR = activeBuf[idx];
              pickedG = activeBuf[idx + 1];
              pickedB = activeBuf[idx + 2];
              pickedA = activeBuf[idx + 3];
            }
          }

          // Priority 2: composite through visible layers in top-down order (top-most layer first)
          if (pickedA === 0) {
            for (let i = layers.length - 1; i >= 0; i--) {
              const layer = layers[i];
              if (!layer.visible) continue;
              const buf = pixelRegistry.getLayerBytes(layer.id);
              if (buf && buf.length >= docWidth * docHeight * 4) {
                const idx = (py * docWidth + px) * 4;
                const a = buf[idx + 3];
                if (a > 0) {
                  pickedR = buf[idx];
                  pickedG = buf[idx + 1];
                  pickedB = buf[idx + 2];
                  pickedA = a;
                  break;
                }
              }
            }
          }
          if (pickedA > 0) {
            const hex = `#${((1 << 24) + (pickedR << 16) + (pickedG << 8) + pickedB).toString(16).slice(1)}`;
            setBrushColor(hex);
            showToast(`Màu chọn: ${hex.toUpperCase()}`, 'info');
          } else {
            showToast('Vị trí chọn là pixel trong suốt', 'info');
          }
        }
        isInteractingRef.current = false;
        interactionModeRef.current = null;
      } else if (activeTool === 'zoom') {
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const world = worldRef.current;
        const currentScale = world.scale.x;
        // Left click zooms in 1.5x, Alt/Right click zooms out 0.67x
        const isZoomOut = e.altKey || e.button === 2;
        const factor = isZoomOut ? 0.67 : 1.5;
        const newScale = Math.max(0.05, Math.min(32, currentScale * factor));
        if (newScale !== currentScale) {
          const worldX = (mouseX - world.position.x) / currentScale;
          const worldY = (mouseY - world.position.y) / currentScale;
          const newPanX = mouseX - worldX * newScale;
          const newPanY = mouseY - worldY * newScale;
          world.scale.set(newScale);
          world.position.set(newPanX, newPanY);
          viewportRef.current.zoom = newScale;
          viewportRef.current.panX = newPanX - (rect.width / 2 - (docWidth * newScale) / 2);
          viewportRef.current.panY = newPanY - (rect.height / 2 - (docHeight * newScale) / 2);
          updateTransformHandles();
          scheduleStoreViewportSync();
        }
        isInteractingRef.current = false;
        interactionModeRef.current = null;
      } else if (activeTool === 'shape') {
        interactionModeRef.current = 'shape';
      } else if (activeTool === 'ai-inpaint') {
        interactionModeRef.current = 'ai-inpaint';
        lastPointRef.current = worldPos;
        inpaintToolManager.startStroke(worldPos.x, worldPos.y);
        const gfx = inpaintMaskGraphicsRef.current;
        if (gfx) {
          gfx.circle(worldPos.x, worldPos.y, inpaintToolManager.getBrushSize() / 2);
          gfx.fill({ color: 0xff0000, alpha: 0.5 });
        }
      } else if (activeTool === 'marquee') {
        interactionModeRef.current = 'marquee';
      } else if (activeTool === 'text') {
        addTextLayer('Double Click to Edit', Math.round(worldPos.x), Math.round(worldPos.y));
        isInteractingRef.current = false;
        interactionModeRef.current = null;
      } else if (activeTool === 'paint-bucket') {
        fillActiveLayer(brushColor);
        isInteractingRef.current = false;
        interactionModeRef.current = null;
      }
    },
    [
      screenToWorld,
      activeTool,
      activeLayerId,
      layers,
      brushColor,
      brushSize,
      brushOpacity,
      docWidth,
      docHeight,
      setBrushColor,
      addTextLayer,
      fillActiveLayer,
      updateTransformHandles,
      scheduleStoreViewportSync,
    ]
  );

  // 7. Native High-Performance Pointer Move (Direct GPU transform without React re-renders)
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isInteractingRef.current || !worldRef.current) return;
      const mode = interactionModeRef.current;
      const world = worldRef.current;
      const worldPos = screenToWorld(e.clientX, e.clientY);

      if (mode === 'pan') {
        // Direct Viewport Pan on World Container
        const dx = e.clientX - startDragRef.current.clientX;
        const dy = e.clientY - startDragRef.current.clientY;

        world.position.x += dx;
        world.position.y += dy;

        startDragRef.current.clientX = e.clientX;
        startDragRef.current.clientY = e.clientY;

        updateTransformHandles();
        scheduleStoreViewportSync();
      } else if (mode === 'move' && activeLayerId) {
        // Direct Layer Sprite Transform: 0 React re-renders during active drag!
        const dx = worldPos.x - startDragRef.current.worldX;
        const dy = worldPos.y - startDragRef.current.worldY;

        const sprite = layerSpritesRef.current.get(activeLayerId);
        if (sprite) {
          sprite.position.set(
            Math.round(startDragRef.current.layerStartX + dx),
            Math.round(startDragRef.current.layerStartY + dy)
          );
          updateTransformHandles();
        }
      } else if (mode === 'brush' && drawingGraphicsRef.current && lastPointRef.current) {
        // Real-time GPU Stroke Rendering
        const hex = parseInt(brushColor.replace('#', ''), 16);
        const gfx = drawingGraphicsRef.current;
        gfx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
        gfx.lineTo(worldPos.x, worldPos.y);
        gfx.stroke({
          width: brushSize,
          color: hex,
          alpha: brushOpacity,
          cap: 'round',
          join: 'round',
        });
        lastPointRef.current = worldPos;

        strokePointsRef.current.push({ x: worldPos.x, y: worldPos.y });
        strokeBBoxRef.current.minX = Math.min(strokeBBoxRef.current.minX, worldPos.x - brushSize);
        strokeBBoxRef.current.minY = Math.min(strokeBBoxRef.current.minY, worldPos.y - brushSize);
        strokeBBoxRef.current.maxX = Math.max(strokeBBoxRef.current.maxX, worldPos.x + brushSize);
        strokeBBoxRef.current.maxY = Math.max(strokeBBoxRef.current.maxY, worldPos.y + brushSize);
      } else if (mode === 'eraser' && drawingGraphicsRef.current && lastPointRef.current) {
        // Real-time GPU Eraser Overlay (white translucent preview)
        const gfx = drawingGraphicsRef.current;
        gfx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
        gfx.lineTo(worldPos.x, worldPos.y);
        gfx.stroke({
          width: brushSize,
          color: 0xffffff,
          alpha: 0.35,
          cap: 'round',
          join: 'round',
        });
        lastPointRef.current = worldPos;

        strokePointsRef.current.push({ x: worldPos.x, y: worldPos.y });
        strokeBBoxRef.current.minX = Math.min(strokeBBoxRef.current.minX, worldPos.x - brushSize);
        strokeBBoxRef.current.minY = Math.min(strokeBBoxRef.current.minY, worldPos.y - brushSize);
        strokeBBoxRef.current.maxX = Math.max(strokeBBoxRef.current.maxX, worldPos.x + brushSize);
        strokeBBoxRef.current.maxY = Math.max(strokeBBoxRef.current.maxY, worldPos.y + brushSize);
      } else if (mode === 'shape' && drawingGraphicsRef.current) {
        // Real-time GPU Shape Drag Preview
        const gfx = drawingGraphicsRef.current;
        gfx.clear();
        const startX = startDragRef.current.worldX;
        const startY = startDragRef.current.worldY;
        const x = Math.min(startX, worldPos.x);
        const y = Math.min(startY, worldPos.y);
        const w = Math.abs(worldPos.x - startX);
        const h = Math.abs(worldPos.y - startY);
        const hex = parseInt(brushColor.replace('#', ''), 16);
        if (shapeType === 'ellipse') {
          gfx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2));
        } else {
          gfx.rect(x, y, Math.max(1, w), Math.max(1, h));
        }
        gfx.fill({ color: hex, alpha: brushOpacity });
        gfx.stroke({ width: 1.5 / (worldRef.current?.scale.x || 1), color: 0x00a8ff });
      } else if (mode === 'ai-inpaint') {
        const gfx = inpaintMaskGraphicsRef.current;
        if (gfx && lastPointRef.current) {
          gfx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
          gfx.lineTo(worldPos.x, worldPos.y);
          gfx.stroke({
            width: inpaintToolManager.getBrushSize(),
            color: 0xff0000,
            alpha: 0.5,
            cap: 'round',
            join: 'round',
          });
        }
        lastPointRef.current = worldPos;
        inpaintToolManager.addPoint(worldPos.x, worldPos.y);
      } else if (mode === 'marquee') {
        // Marquee Selection Box
        const startX = startDragRef.current.worldX;
        const startY = startDragRef.current.worldY;
        const x = Math.min(startX, worldPos.x);
        const y = Math.min(startY, worldPos.y);
        const width = Math.abs(worldPos.x - startX);
        const height = Math.abs(worldPos.y - startY);
        setSelection({ x, y, width, height });
      }
    },
    [
      screenToWorld,
      activeLayerId,
      brushColor,
      brushSize,
      brushOpacity,
      shapeType,
      setSelection,
      updateTransformHandles,
      scheduleStoreViewportSync,
    ]
  );

  // 8. Commit final state on Pointer Up / Cancel / Window Blur (Unified Interaction End)
  const handleInteractionEnd = useCallback(
    (e?: React.PointerEvent | PointerEvent | FocusEvent) => {
      // Always reset space pan tracking on blur/cancel
      if (isSpacePressedRef) {
        isSpacePressedRef.current = false;
      }

      if (!isInteractingRef.current) return;

      const mode = interactionModeRef.current;

      if (mode === 'move' && activeLayerId) {
        const sprite = layerSpritesRef.current.get(activeLayerId);
        if (sprite) {
          const fromX = startDragRef.current.layerStartX;
          const fromY = startDragRef.current.layerStartY;
          const toX = sprite.position.x;
          const toY = sprite.position.y;
          if (fromX !== toX || fromY !== toY) {
            setLayerPosition(activeLayerId, toX, toY);
            import('@/history/commands').then(({ MoveCommand }) => {
              const cmd = new MoveCommand(activeLayerId, fromX, fromY, toX, toY);
              executeCommand(cmd, true);
            });
          }
        }
      } else if (mode === 'ai-inpaint') {
        inpaintToolManager.endStroke();
      } else if ((mode === 'brush' || mode === 'eraser') && activeLayerId) {
        const strokeMode = mode;
        const points = [...strokePointsRef.current];
        if (points.length > 0) {
          const bbox = { ...strokeBBoxRef.current };
          Promise.all([
            import('@/history/commands'),
            import('@/history/tileStore'),
          ]).then(
            async ([{ BrushStrokeCommand }, { getAffectedTiles, extractTileFromBuffer, rasterizeStrokeToBuffer }]) => {
              const dirtyTiles = getAffectedTiles(
                bbox.minX,
                bbox.minY,
                bbox.maxX,
                bbox.maxY,
                docWidth,
                docHeight
              );
              if (dirtyTiles.length > 0) {
                // Ensure existing layer artwork is in buffer before drawing stroke
                let fullBuffer = pixelRegistry.getLayerBytes(activeLayerId);
                if (!fullBuffer) {
                  const activeLayer = layers.find((l) => l.id === activeLayerId);
                  if (activeLayer?.textureUrl) {
                    try {
                      const img = new Image();
                      img.crossOrigin = 'anonymous';
                      img.src = activeLayer.textureUrl;
                      await new Promise<void>((res) => {
                        if (img.complete && img.naturalWidth > 0) return res();
                        img.onload = () => res();
                        img.onerror = () => res();
                      });
                      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                        const initCanvas = document.createElement('canvas');
                        initCanvas.width = docWidth;
                        initCanvas.height = docHeight;
                        const ictx = initCanvas.getContext('2d');
                        if (ictx) {
                          const scale = Math.min(docWidth / img.naturalWidth, docHeight / img.naturalHeight);
                          const dw = img.naturalWidth * scale;
                          const dh = img.naturalHeight * scale;
                          const dx = (docWidth - dw) / 2;
                          const dy = (docHeight - dh) / 2;
                          ictx.drawImage(img, dx, dy, dw, dh);
                          const imgData = ictx.getImageData(0, 0, docWidth, docHeight);
                          fullBuffer = new Uint8Array(imgData.data.buffer);
                          pixelRegistry.setLayerBytes(activeLayerId, fullBuffer, 'image/png', docWidth, docHeight);
                        }
                      }
                    } catch (_) {}
                  }
                }
                if (!fullBuffer) {
                  fullBuffer = pixelRegistry.getOrCreateLayerBytes(
                    activeLayerId,
                    docWidth,
                    docHeight
                  );
                }
                const beforeTilesMap = new Map<string, Uint8Array>();
                for (const { tileX, tileY } of dirtyTiles) {
                  const beforeTile = extractTileFromBuffer(
                    fullBuffer,
                    docWidth,
                    docHeight,
                    tileX,
                    tileY
                  );
                  beforeTilesMap.set(`${tileX}:${tileY}`, beforeTile);
                }
                rasterizeStrokeToBuffer(
                  fullBuffer,
                  docWidth,
                  docHeight,
                  points,
                  brushColor,
                  brushSize,
                  brushOpacity,
                  strokeMode
                );
                const tileSnapshots: TileSnapshot[] = [];
                for (const { tileX, tileY } of dirtyTiles) {
                  const before = beforeTilesMap.get(`${tileX}:${tileY}`)!;
                  const after = extractTileFromBuffer(
                    fullBuffer,
                    docWidth,
                    docHeight,
                    tileX,
                    tileY
                  );
                  tileSnapshots.push({ tileX, tileY, before, after });
                }

                // Synchronous GPU Texture update to eliminate black/flicker frames
                try {
                  const offscreen = document.createElement('canvas');
                  offscreen.width = docWidth;
                  offscreen.height = docHeight;
                  const octx = offscreen.getContext('2d');
                  if (octx) {
                    const clamped = new Uint8ClampedArray(docWidth * docHeight * 4);
                    clamped.set(fullBuffer);
                    const imgData = new ImageData(clamped, docWidth, docHeight);
                    octx.putImageData(imgData, 0, 0);

                    const pixi = pixiModuleRef.current || (await import('pixi.js'));
                    const newTex = pixi.Texture.from(offscreen);
                    const sprite = layerSpritesRef.current.get(activeLayerId);
                    if (sprite) {
                      (sprite as any).texture = newTex;
                      const scale = Math.min(docWidth / newTex.width, docHeight / newTex.height);
                      if (isFinite(scale)) {
                        (sprite as any).scale.set(scale);
                      }
                    }
                    const newUrl = pixelRegistry.invalidateLayerTexture(activeLayerId, 'image/png', docWidth, docHeight);
                    if (newUrl) {
                      textureCacheRef.current.set(newUrl, newTex);
                      updateLayerData(activeLayerId, fullBuffer, newUrl);
                    }
                  }
                } catch (_) {
                  const newUrl = pixelRegistry.invalidateLayerTexture(activeLayerId, 'image/png', docWidth, docHeight);
                  if (newUrl) {
                    updateLayerData(activeLayerId, fullBuffer, newUrl);
                  }
                }

                if (drawingGraphicsRef.current) drawingGraphicsRef.current.clear();

                const cmd = new BrushStrokeCommand(
                  activeLayerId,
                  docWidth,
                  docHeight,
                  tileSnapshots,
                  strokeMode === 'eraser' ? 'Eraser' : 'Brush Stroke'
                );
                executeCommand(cmd, true);
              }
            }
          );
        }
      } else if (mode === 'shape') {
        if (drawingGraphicsRef.current) drawingGraphicsRef.current.clear();
        const startX = startDragRef.current.worldX;
        const startY = startDragRef.current.worldY;
        const currentPos = lastPointRef.current || { x: startX, y: startY };
        const x = Math.min(startX, currentPos.x);
        const y = Math.min(startY, currentPos.y);
        let w = Math.abs(currentPos.x - startX);
        let h = Math.abs(currentPos.y - startY);

        // Click-to-create small shape fallback if drag distance is tiny
        if (w < 4 && h < 4) {
          w = 80;
          h = 80;
        }

        const clampedW = Math.max(2, Math.min(Math.round(w), docWidth));
        const clampedH = Math.max(2, Math.min(Math.round(h), docHeight));
        const shapeCanvas = document.createElement('canvas');
        shapeCanvas.width = clampedW;
        shapeCanvas.height = clampedH;
        const sctx = shapeCanvas.getContext('2d');
        if (sctx) {
          sctx.fillStyle = brushColor;
          sctx.globalAlpha = brushOpacity;
          if (shapeType === 'ellipse') {
            sctx.beginPath();
            sctx.ellipse(clampedW / 2, clampedH / 2, clampedW / 2, clampedH / 2, 0, 0, Math.PI * 2);
            sctx.fill();
          } else {
            sctx.fillRect(0, 0, clampedW, clampedH);
          }

          const imgData = sctx.getImageData(0, 0, clampedW, clampedH);
          const shapeBytes = new Uint8Array(imgData.data.buffer);
          const shapeUrl = shapeCanvas.toDataURL('image/png');

          const shapeLayerId = `layer-shape-${Date.now()}`;
          const newShapeLayer: LayerItem = {
            id: shapeLayerId,
            name: `${shapeType === 'ellipse' ? 'Ellipse' : 'Rectangle'} ${layers.length + 1}`,
            visible: true,
            opacity: 1,
            blendMode: 'normal',
            type: 'raster',
            locked: false,
            x: Math.round(x),
            y: Math.round(y),
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            adjustments: {
              brightness: 0,
              contrast: 0,
              saturation: 0,
              blur: 0,
              invert: false,
              grayscale: false,
              sepia: false,
            },
            textureUrl: shapeUrl,
          };

          import('@/history/commands').then(({ AddLayerCommand }) => {
            const addCmd = new AddLayerCommand(
              newShapeLayer,
              0,
              shapeBytes,
              `Add ${shapeType === 'ellipse' ? 'Ellipse' : 'Rectangle'}`
            );
            executeCommand(addCmd, true);
          });
        }
      }

      isInteractingRef.current = false;
      isPanningRef.current = false;
      isDrawingRef.current = false;
      interactionModeRef.current = null;
      lastPointRef.current = null;
      strokePointsRef.current = [];

      if (e && 'pointerId' in e) {
        try {
          const target = (e.currentTarget || containerRef.current) as HTMLElement | null;
          target?.releasePointerCapture?.(e.pointerId);
        } catch (_) {
          // Pointer capture release safety
        }
      }
    },
    [
      isSpacePressedRef,
      activeLayerId,
      layers,
      setLayerPosition,
      docWidth,
      docHeight,
      brushColor,
      brushSize,
      brushOpacity,
      shapeType,
      executeCommand,
      updateLayerData,
    ]
  );

  // Synchronize window blur to cancel interactions and prevent stuck states
  useEffect(() => {
    const onBlur = () => {
      handleInteractionEnd();
    };
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
    };
  }, [handleInteractionEnd]);

  // 9. Drag-and-Drop Image File Handler with Strict Validation
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB limit

        if (file.size > MAX_FILE_SIZE) {
          const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
          showToast(`File quá lớn (${sizeMB}MB). Giới hạn 200MB.`, 'warning');
          return;
        }

        const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
        if (!validTypes.includes(file.type)) {
          showToast(
            `Định dạng không hỗ trợ: ${file.name}. Chấp nhận: PNG, JPG, WebP, GIF, AVIF.`,
            'warning'
          );
          return;
        }

        const url = URL.createObjectURL(file);
        const reader = new FileReader();
        reader.onload = () => {
          const bytes = new Uint8Array(reader.result as ArrayBuffer);
          addLayer(
            {
              name: file.name.replace(/\.[^/.]+$/, ''),
              textureUrl: url,
              data: bytes,
            },
            `Import ${file.name}`
          );
        };
        reader.readAsArrayBuffer(file);
      }
    },
    [addLayer]
  );

  // 10. AI Background Removal Action (Zero-Copy Unified Platform API)
  const triggerAiBackgroundRemoval = async () => {
    const activeLayer = layers.find((l) => l.id === activeLayerId);
    if (!activeLayer) return;

    const jobId = `rmbg-${Date.now()}`;
    currentJobIdRef.current = jobId;

    setAiProcessing({
      isProcessing: true,
      stage: 'rmbg',
      progress: 0.1,
      message: 'Reading active layer binary buffer...',
    });

    // Subscribe to unified real-time progress events
    const cleanupProgress = onAIProgress((incomingJobId, progress, message) => {
      if (incomingJobId === jobId) {
        setAiProcessing({
          stage: 'rmbg',
          progress,
          message: message || '',
        });
      }
    });

    try {
      // Prioritize fast zero-copy memory lookup in pixelRegistry
      let imageBytes: Uint8Array | undefined = pixelRegistry.getLayerBytes(activeLayer.id);

      if (!imageBytes && activeLayer.data) {
        imageBytes = activeLayer.data;
      } else if (!imageBytes && activeLayer.textureUrl) {
        const response = await fetch(activeLayer.textureUrl);
        const arrayBuffer = await response.arrayBuffer();
        imageBytes = new Uint8Array(arrayBuffer);
      } else if (!imageBytes) {
        imageBytes = new Uint8Array(1024);
      }

      // Execute via unified platform API (Tauri raw bytes / Electron Buffer / Web fallback)
      const resultBytes = await sendImageToAI(activeLayer.id, imageBytes, jobId);

      const blob = new Blob([resultBytes as any], { type: 'image/png' });
      const newUrl = URL.createObjectURL(blob);

      const sprite = layerSpritesRef.current.get(activeLayer.id);
      if (sprite) {
        const pixi = pixiModuleRef.current || (await import('pixi.js'));
        const newTexture = await pixi.Assets.load(newUrl);
        (sprite as any).texture = newTexture;
        textureCacheRef.current.set(newUrl, newTexture);
      }

      // Non-blocking UI update via React 19 startTransition with AIResultCommand
      startTransition(async () => {
        const { AIResultCommand } = await import('@/history/commands');
        const cmd = new AIResultCommand({
          layerId: activeLayer.id,
          docWidth,
          docHeight,
          oldBytes: imageBytes,
          newBytes: resultBytes,
          oldUrl: activeLayer.textureUrl,
          newUrl,
          description: 'AI Background Removal (Zero-Copy)',
        });
        await executeCommand(cmd, true);
        updateLayerData(activeLayer.id, resultBytes, newUrl);
        setAiProcessing({
          isProcessing: false,
          stage: 'idle',
          progress: 1.0,
          message: 'Non-destructive background removal complete.',
        });
      });
    } catch (err: any) {
      console.warn('[PhotoshopAI] AI RMBG execution status:', err);
      setAiProcessing({
        isProcessing: false,
        stage: 'error',
        progress: 0,
        message: `${err.message || 'Processing failed'}`,
      });
    } finally {
      cleanupProgress();
      currentJobIdRef.current = null;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden checkerboard-pattern select-none ${
        activeTool === 'hand'
          ? 'cursor-grab active:cursor-grabbing'
          : activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'shape' || activeTool === 'marquee'
          ? 'cursor-crosshair'
          : activeTool === 'move'
          ? 'cursor-move'
          : activeTool === 'eyedropper'
          ? 'cursor-pointer'
          : activeTool === 'zoom'
          ? 'cursor-zoom-in'
          : activeTool === 'text'
          ? 'cursor-text'
          : 'cursor-default'
      } ${className || ''}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handleInteractionEnd}
      onPointerCancel={handleInteractionEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* 0. Instant Startup Placeholder Spinner */}
      {!isInitialized && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0c0d0e] z-30 transition-opacity duration-300">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
          <span className="text-xs text-zinc-400 font-mono tracking-wide">
            Initializing GPU Canvas Engine...
          </span>
        </div>
      )}
      {/* Photoshop Pixel Rulers (Top & Left) */}
      {showRulers && (
        <>
          {/* Top Ruler */}
          <div className="absolute top-0 left-0 right-0 h-4 bg-zinc-950/90 border-b border-zinc-800 text-[9px] font-mono text-zinc-500 z-10 flex items-center pointer-events-none select-none pl-4">
            <span className="w-16">0px</span>
            <span className="w-24">200px</span>
            <span className="w-24">400px</span>
            <span className="w-24">600px</span>
            <span className="w-24">800px</span>
            <span className="w-24">1000px</span>
            <span className="w-24">1200px</span>
            <span className="w-24">1400px</span>
            <span className="w-24">1600px</span>
            <span className="w-24">1800px</span>
          </div>
          {/* Left Ruler */}
          <div className="absolute top-4 left-0 bottom-0 w-4 bg-zinc-950/90 border-r border-zinc-800 text-[9px] font-mono text-zinc-500 z-10 flex flex-col justify-start pointer-events-none select-none pt-2">
            <span className="h-16 pl-0.5">0</span>
            <span className="h-24 pl-0.5">200</span>
            <span className="h-24 pl-0.5">400</span>
            <span className="h-24 pl-0.5">600</span>
            <span className="h-24 pl-0.5">800</span>
            <span className="h-24 pl-0.5">1000</span>
          </div>
        </>
      )}

      {/* Viewport Floating Info Badge (Decoupled & Fast) */}
      <div className="absolute top-6 left-6 z-10 flex items-center gap-2 bg-zinc-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-300 shadow-xl pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="font-medium">{activeBackend}</span>
        <span className="text-zinc-500">|</span>
        <span>{displayZoom}%</span>
        <span className="text-zinc-500">|</span>
        <span>
          {docWidth} × {docHeight} px
        </span>
      </div>

      {/* Floating Quick Action: AI Background Removal */}
      <div className="absolute top-6 right-6 z-10 flex items-center gap-2">
        <button
          onClick={triggerAiBackgroundRemoval}
          disabled={aiState.isProcessing}
          className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-500/20 border border-blue-400/30 transition-all cursor-pointer"
        >
          {aiState.isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>AI Processing...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Tách Nền AI (Zero-Copy)</span>
            </>
          )}
        </button>
      </div>

      {/* AI Processing Modal Overlay */}
      {aiState.isProcessing && (
        <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-auto">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 flex flex-col items-center text-center">
            <div className="relative mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                <Sparkles className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            </div>
            <h3 className="text-sm font-semibold text-zinc-100 mb-1">
              PhotoshopAI Neural Engine
            </h3>
            <p className="text-xs text-zinc-400 mb-4">{aiState.message}</p>

            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden mb-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${Math.round(aiState.progress * 100)}%` }}
              ></div>
            </div>
            <span className="text-[11px] text-zinc-500 font-mono mb-3">
              {Math.round(aiState.progress * 100)}% - Đa luồng Rust / ONNX DirectML
            </span>

            <button
              onClick={() => {
                if (currentJobIdRef.current) {
                  cancelAIJob(currentJobIdRef.current);
                }
              }}
              className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-300 hover:text-white text-xs rounded-lg border border-zinc-700 cursor-pointer transition font-medium"
            >
              Hủy Tác Vụ
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
