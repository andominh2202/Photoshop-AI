import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Application,
  Container,
  Sprite,
  Graphics,
  Assets,
  ColorMatrixFilter,
  BlurFilter,
  Text,
  TextStyle,
  Texture,
} from 'pixi.js';
import { useEditorStore } from '@/store/useEditorStore';
import { invokeRemoveBackground } from '@/services/tauriBridge';
import { Sparkles, Loader2, Maximize2 } from 'lucide-react';

interface PixiCanvasProps {
  className?: string;
}

export const PixiCanvas: React.FC<PixiCanvasProps> = ({ className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const layerSpritesRef = useRef<Map<string, Sprite | Container>>(new Map());
  const drawingGraphicsRef = useRef<Graphics | null>(null);
  const selectionGraphicsRef = useRef<Graphics | null>(null);
  const transformBoxRef = useRef<Graphics | null>(null);

  // Store bindings
  const {
    docWidth,
    docHeight,
    backgroundColor,
    zoom,
    panX,
    panY,
    setZoom,
    setPan,
    showRulers,
    layers,
    activeLayerId,
    activeTool,
    brushSize,
    brushColor,
    brushOpacity,
    brushHardness,
    shapeType,
    selection,
    setSelection,
    clearSelection,
    aiState,
    setAiProcessing,
    setFps,
    updateLayerData,
    setLayerPosition,
    addLayer,
    addTextLayer,
    fillActiveLayer,
    pushHistory,
  } = useEditorStore();

  const [isInitialized, setIsInitialized] = useState(false);
  const [activeBackend, setActiveBackend] = useState<string>('Detecting...');
  
  // Interaction states
  const isInteractingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const startDragRef = useRef<{ x: number; y: number; panX: number; panY: number; layerX: number; layerY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
    layerX: 0,
    layerY: 0,
  });

  // Convert Client screen coordinates to Document World coordinates
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      
      const worldOriginX = rect.width / 2 + panX - (docWidth * zoom) / 2;
      const worldOriginY = rect.height / 2 + panY - (docHeight * zoom) / 2;

      return {
        x: (localX - worldOriginX) / zoom,
        y: (localY - worldOriginY) / zoom,
      };
    },
    [panX, panY, zoom, docWidth, docHeight]
  );

  // 1. Initialize PixiJS v8 with WebGPU priority
  useEffect(() => {
    let isCancelled = false;

    async function initPixi() {
      if (!containerRef.current || appRef.current) return;

      const app = new Application();

      await app.init({
        preference: 'webgpu',
        resizeTo: containerRef.current,
        backgroundColor: 0x111315,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (isCancelled) {
        app.destroy(true, { children: true });
        return;
      }

      appRef.current = app;
      containerRef.current.appendChild(app.canvas);

      const rendererType = (app.renderer as any).type || (app.renderer as any).name || 'WebGPU';
      setActiveBackend(`PhotoshopAI Engine (${rendererType === 1 ? 'WebGL' : 'WebGPU 120 FPS'})`);

      // Root World Container for Pan & Zoom transforms
      const world = new Container();
      world.label = 'WorldViewport';
      app.stage.addChild(world);
      worldRef.current = world;

      // 1. Artboard Background
      const artboardBg = new Graphics();
      artboardBg.rect(0, 0, docWidth, docHeight);
      artboardBg.fill({ color: backgroundColor === 'transparent' ? 0x1e1e24 : 0xffffff, alpha: 1 });
      artboardBg.stroke({ width: 1, color: 0x333b42 });
      world.addChild(artboardBg);

      // 2. Persistent Interactive Drawing Layer for Brush / Eraser
      const drawingGfx = new Graphics();
      world.addChild(drawingGfx);
      drawingGraphicsRef.current = drawingGfx;

      // 3. Selection Marquee Overlay Graphics
      const selectionGfx = new Graphics();
      world.addChild(selectionGfx);
      selectionGraphicsRef.current = selectionGfx;

      // 4. Transform Box Overlay for Active Layer
      const transformGfx = new Graphics();
      world.addChild(transformGfx);
      transformBoxRef.current = transformGfx;

      // 120 FPS Real-time Ticker
      let frameCount = 0;
      let lastTime = performance.now();
      app.ticker.add(() => {
        frameCount++;
        const now = performance.now();
        if (now - lastTime >= 1000) {
          const currentFps = Math.round((frameCount * 1000) / (now - lastTime));
          setFps(currentFps);
          frameCount = 0;
          lastTime = now;
        }
      });

      setIsInitialized(true);
    }

    initPixi();

    return () => {
      isCancelled = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
        layerSpritesRef.current.clear();
      }
    };
  }, [docWidth, docHeight, backgroundColor, setFps]);

  // 2. Synchronize Viewport Transform (Pan & Zoom)
  useEffect(() => {
    if (!worldRef.current || !containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;

    worldRef.current.position.set(
      clientWidth / 2 + panX - (docWidth * zoom) / 2,
      clientHeight / 2 + panY - (docHeight * zoom) / 2
    );
    worldRef.current.scale.set(zoom);
  }, [zoom, panX, panY, docWidth, docHeight]);

  // 3. Synchronize Layers in PixiJS v8
  useEffect(() => {
    if (!worldRef.current || !isInitialized) return;
    const world = worldRef.current;
    const existingSprites = layerSpritesRef.current;

    const reversedLayers = [...layers].reverse();

    reversedLayers.forEach(async (layer, index) => {
      let displayObject = existingSprites.get(layer.id);

      if (!displayObject) {
        if (layer.type === 'text') {
          // Pixi Text Layer
          const style = new TextStyle({
            fontFamily: layer.fontFamily || 'Inter',
            fontSize: layer.fontSize || 48,
            fill: layer.textColor || '#ffffff',
            fontWeight: 'bold',
          });
          const textObj = new Text({ text: layer.text || 'Text', style });
          world.addChild(textObj);
          displayObject = textObj;
          existingSprites.set(layer.id, displayObject);
        } else {
          // Raster Image Layer
          const sprite = new Sprite();
          sprite.label = layer.name;
          world.addChild(sprite);
          displayObject = sprite;
          existingSprites.set(layer.id, displayObject);

          if (layer.textureUrl) {
            try {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.src = layer.textureUrl;
              await new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              });
              const texture = Texture.from(img);
              if (texture && texture.width > 0) {
                sprite.texture = texture;
                const scale = Math.min(docWidth / texture.width, docHeight / texture.height);
                sprite.scale.set(scale);
              }
            } catch (e) {
              console.warn(`Layer texture fallback for ${layer.id}:`, e);
            }
          }
        }
      }

      // Reorder display index
      world.setChildIndex(displayObject, index + 1);

      // Position & Transform
      displayObject.position.set(layer.x, layer.y);
      displayObject.visible = layer.visible;
      displayObject.alpha = layer.opacity;
      displayObject.blendMode = (layer.blendMode as any) || 'normal';

      // Real-time Text content update
      if (layer.type === 'text' && displayObject instanceof Text) {
        displayObject.text = layer.text || '';
        if (layer.fontSize) displayObject.style.fontSize = layer.fontSize;
        if (layer.textColor) displayObject.style.fill = layer.textColor;
      }

      // Live GPU Filters
      const filters: any[] = [];
      const { brightness, contrast, saturation, blur, invert, grayscale, sepia } = layer.adjustments;

      if (brightness !== 0 || contrast !== 0 || saturation !== 0 || invert || grayscale || sepia) {
        const colorMatrix = new ColorMatrixFilter();
        if (brightness !== 0) colorMatrix.brightness(1 + brightness, false);
        if (contrast !== 0) colorMatrix.contrast(1 + contrast, false);
        if (saturation !== 0) colorMatrix.saturate(saturation, false);
        if (invert) colorMatrix.negative(false);
        if (grayscale) colorMatrix.desaturate();
        if (sepia) colorMatrix.sepia(false);
        filters.push(colorMatrix);
      }

      if (blur > 0) {
        const blurFilter = new BlurFilter();
        blurFilter.strength = blur;
        filters.push(blurFilter);
      }

      displayObject.filters = filters.length > 0 ? filters : null;
    });

    // Remove deleted layers
    existingSprites.forEach((obj, id) => {
      if (!layers.some((l) => l.id === id)) {
        world.removeChild(obj);
        obj.destroy();
        existingSprites.delete(id);
      }
    });

    // Bring interactive drawing layer & selection to top
    if (drawingGraphicsRef.current) world.setChildIndex(drawingGraphicsRef.current, world.children.length - 3);
    if (selectionGraphicsRef.current) world.setChildIndex(selectionGraphicsRef.current, world.children.length - 2);
    if (transformBoxRef.current) world.setChildIndex(transformBoxRef.current, world.children.length - 1);
  }, [layers, isInitialized, docWidth, docHeight]);

  // 4. Render Active Selection Box (Marching Ants Outline)
  useEffect(() => {
    if (!selectionGraphicsRef.current) return;
    const gfx = selectionGraphicsRef.current;
    gfx.clear();

    if (selection) {
      gfx.rect(selection.x, selection.y, selection.width, selection.height);
      gfx.stroke({ width: 1.5, color: 0x3b82f6, alpha: 0.9 });
      gfx.fill({ color: 0x3b82f6, alpha: 0.1 });
    }
  }, [selection]);

  // 5. Render Active Layer Transform Handles
  useEffect(() => {
    if (!transformBoxRef.current) return;
    const gfx = transformBoxRef.current;
    gfx.clear();

    if (activeTool === 'move') {
      const activeLayer = layers.find((l) => l.id === activeLayerId);
      if (activeLayer && activeLayer.visible) {
        const sprite = layerSpritesRef.current.get(activeLayer.id);
        if (sprite) {
          const bounds = sprite.getBounds();
          const p1 = screenToWorld(bounds.x, bounds.y);
          const p2 = screenToWorld(bounds.x + bounds.width, bounds.y + bounds.height);
          const w = p2.x - p1.x;
          const h = p2.y - p1.y;

          // Bounding box
          gfx.rect(p1.x, p1.y, w, h);
          gfx.stroke({ width: 1, color: 0x00a8ff });

          // 8 Anchor Handles (Photoshop style)
          const handleSize = 6;
          const corners = [
            { x: p1.x, y: p1.y },
            { x: p1.x + w / 2, y: p1.y },
            { x: p1.x + w, y: p1.y },
            { x: p1.x, y: p1.y + h / 2 },
            { x: p1.x + w, y: p1.y + h / 2 },
            { x: p1.x, y: p1.y + h },
            { x: p1.x + w / 2, y: p1.y + h },
            { x: p1.x + w, y: p1.y + h },
          ];

          corners.forEach((c) => {
            gfx.rect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
            gfx.fill({ color: 0xffffff });
            gfx.stroke({ width: 1, color: 0x00a8ff });
          });
        }
      }
    }
  }, [activeTool, activeLayerId, layers, screenToWorld]);

  // 6. Interactive Mouse Events: Brush, Eraser, Move, Marquee, Pan & Zoom
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      isInteractingRef.current = true;
      lastPointRef.current = worldPos;

      const activeLayer = layers.find((l) => l.id === activeLayerId);

      startDragRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX,
        panY,
        layerX: activeLayer?.x || 0,
        layerY: activeLayer?.y || 0,
      };

      // Tool-specific mousedown
      if (activeTool === 'brush' && drawingGraphicsRef.current) {
        const hex = parseInt(brushColor.replace('#', ''), 16);
        drawingGraphicsRef.current.circle(worldPos.x, worldPos.y, brushSize / 2);
        drawingGraphicsRef.current.fill({ color: hex, alpha: brushOpacity });
      } else if (activeTool === 'text') {
        addTextLayer('Double Click to Edit', Math.round(worldPos.x), Math.round(worldPos.y));
        isInteractingRef.current = false;
      } else if (activeTool === 'paint-bucket') {
        fillActiveLayer(brushColor);
        isInteractingRef.current = false;
      }
    },
    [
      screenToWorld,
      activeTool,
      activeLayerId,
      layers,
      panX,
      panY,
      brushColor,
      brushSize,
      brushOpacity,
      addTextLayer,
      fillActiveLayer,
    ]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isInteractingRef.current) return;
      const worldPos = screenToWorld(e.clientX, e.clientY);

      if (e.button === 1 || activeTool === 'hand' || e.shiftKey) {
        // Pan Viewport
        const dx = e.clientX - startDragRef.current.x;
        const dy = e.clientY - startDragRef.current.y;
        setPan(startDragRef.current.panX + dx, startDragRef.current.panY + dy);
      } else if (activeTool === 'move' && activeLayerId) {
        // Move Active Layer
        const dx = (e.clientX - startDragRef.current.x) / zoom;
        const dy = (e.clientY - startDragRef.current.y) / zoom;
        setLayerPosition(
          activeLayerId,
          Math.round(startDragRef.current.layerX + dx),
          Math.round(startDragRef.current.layerY + dy)
        );
      } else if (activeTool === 'brush' && drawingGraphicsRef.current && lastPointRef.current) {
        // Interactive Painting
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
      } else if (activeTool === 'marquee') {
        // Interactive Marquee Selection
        const startWorld = screenToWorld(startDragRef.current.x, startDragRef.current.y);
        const x = Math.min(startWorld.x, worldPos.x);
        const y = Math.min(startWorld.y, worldPos.y);
        const width = Math.abs(worldPos.x - startWorld.x);
        const height = Math.abs(worldPos.y - startWorld.y);
        setSelection({ x, y, width, height });
      }
    },
    [
      screenToWorld,
      activeTool,
      activeLayerId,
      zoom,
      brushColor,
      brushSize,
      brushOpacity,
      setPan,
      setLayerPosition,
      setSelection,
    ]
  );

  const handleMouseUp = useCallback(() => {
    if (isInteractingRef.current) {
      if (activeTool === 'brush') {
        pushHistory('Brush Stroke');
      } else if (activeTool === 'move') {
        pushHistory('Move Layer');
      }
    }
    isInteractingRef.current = false;
    lastPointRef.current = null;
  }, [activeTool, pushHistory]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoom((prev) => Math.max(0.05, Math.min(32, prev * zoomFactor)));
    },
    [setZoom]
  );

  // 7. Drag-and-Drop Image File Handler
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          const reader = new FileReader();
          reader.onload = () => {
            const bytes = new Uint8Array(reader.result as ArrayBuffer);
            addLayer({
              name: file.name.replace(/\.[^/.]+$/, ''),
              textureUrl: url,
              data: bytes,
            }, `Import ${file.name}`);
          };
          reader.readAsArrayBuffer(file);
        }
      }
    },
    [addLayer]
  );

  // 8. One-Click AI Background Removal Action
  const triggerAiBackgroundRemoval = async () => {
    const activeLayer = layers.find((l) => l.id === activeLayerId);
    if (!activeLayer) return;

    setAiProcessing({
      isProcessing: true,
      stage: 'rmbg',
      progress: 0.1,
      message: 'Reading active layer binary buffer...',
    });

    try {
      let imageBytes: Uint8Array;

      if (activeLayer.data) {
        imageBytes = activeLayer.data;
      } else if (activeLayer.textureUrl) {
        const response = await fetch(activeLayer.textureUrl);
        const arrayBuffer = await response.arrayBuffer();
        imageBytes = new Uint8Array(arrayBuffer);
      } else {
        imageBytes = new Uint8Array(1024);
      }

      const resultBytes = await invokeRemoveBackground(imageBytes, (event) => {
        setAiProcessing({
          stage: event.stage,
          progress: event.progress,
          message: event.message,
        });
      });

      const blob = new Blob([resultBytes as any], { type: 'image/png' });
      const newUrl = URL.createObjectURL(blob);

      const sprite = layerSpritesRef.current.get(activeLayer.id) as Sprite;
      if (sprite) {
        const newTexture = await Assets.load(newUrl);
        sprite.texture = newTexture;
      }

      updateLayerData(activeLayer.id, resultBytes, newUrl);
      pushHistory('AI Background Removal (Zero-Copy)');

      setAiProcessing({
        isProcessing: false,
        stage: 'idle',
        progress: 1.0,
        message: 'Non-destructive background removal complete.',
      });
    } catch (err: any) {
      console.error('AI RMBG execution error:', err);
      setAiProcessing({
        isProcessing: false,
        stage: 'error',
        progress: 0,
        message: `AI Error: ${err.message || 'Processing failed'}`,
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden checkerboard-pattern select-none ${
        activeTool === 'hand'
          ? 'cursor-grab active:cursor-grabbing'
          : activeTool === 'brush'
          ? 'cursor-crosshair'
          : activeTool === 'move'
          ? 'cursor-move'
          : activeTool === 'text'
          ? 'cursor-text'
          : 'cursor-default'
      } ${className || ''}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
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

      {/* Viewport Floating Info Badge */}
      <div className="absolute top-6 left-6 z-10 flex items-center gap-2 bg-zinc-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-300 shadow-xl pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="font-medium">{activeBackend}</span>
        <span className="text-zinc-500">|</span>
        <span>{Math.round(zoom * 100)}%</span>
        <span className="text-zinc-500">|</span>
        <span>{docWidth} × {docHeight} px</span>
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
            <span className="text-[11px] text-zinc-500 font-mono">
              {Math.round(aiState.progress * 100)}% - Đa luồng Rust / ONNX DirectML
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
