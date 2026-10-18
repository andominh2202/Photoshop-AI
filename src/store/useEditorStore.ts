import { create } from 'zustand';

export type ToolType =
  | 'move'
  | 'marquee'
  | 'lasso'
  | 'wand'
  | 'crop'
  | 'eyedropper'
  | 'brush'
  | 'eraser'
  | 'paint-bucket'
  | 'text'
  | 'shape'
  | 'ai-rmbg'
  | 'ai-inpaint'
  | 'hand'
  | 'zoom';

export type BlendModeType =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'difference';

export type LayerType = 'raster' | 'text' | 'adjustment' | 'vector';

export interface LayerAdjustments {
  brightness: number; // -1 to 1
  contrast: number;   // -1 to 1
  saturation: number; // -1 to 1
  blur: number;       // 0 to 20
  invert: boolean;
  grayscale: boolean;
  sepia: boolean;
}

export interface LayerItem {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0 to 1
  blendMode: BlendModeType;
  type: LayerType;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  textureUrl?: string;
  data?: Uint8Array; // Raw zero-copy byte buffer
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  adjustments: LayerAdjustments;
}

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PaintStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  size: number;
  opacity: number;
}

export interface HistoryStep {
  id: string;
  actionName: string;
  timestamp: number;
  layers: LayerItem[];
  strokes: PaintStroke[];
  activeLayerId: string;
}

export interface AiTaskState {
  isProcessing: boolean;
  stage: string;
  progress: number;
  message: string;
}

interface EditorState {
  // Document Dimensions
  docTitle: string;
  docWidth: number;
  docHeight: number;
  dpi: number;
  backgroundColor: string;

  // Viewport State
  zoom: number; // 1.0 = 100%
  panX: number;
  panY: number;
  showRulers: boolean;

  // Active Tool & Tool Options
  activeTool: ToolType;
  brushSize: number;
  brushHardness: number; // 0 to 1
  brushOpacity: number;  // 0 to 1
  brushColor: string;
  secondaryColor: string;
  
  // Text Tool Options
  textFont: string;
  textSize: number;
  textAlign: 'left' | 'center' | 'right';

  // Shape Tool Options
  shapeType: 'rectangle' | 'ellipse' | 'rounded';
  shapeFill: string;
  shapeStroke: number;

  // Marquee / Selection Options
  selection: SelectionRect | null;
  selectionFeather: number;

  // Layers & Selection
  layers: LayerItem[];
  activeLayerId: string;

  // AI & Hardware Engine
  aiState: AiTaskState;
  gpuBackend: string;
  fps: number;

  // History Stack
  history: HistoryStep[];
  historyIndex: number;
  strokes: PaintStroke[];
  addStroke: (stroke: PaintStroke) => void;

  // Modals
  isNewDocModalOpen: boolean;
  isExportModalOpen: boolean;

  // Actions
  setDocTitle: (title: string) => void;
  createNewDocument: (width: number, height: number, dpi: number, title?: string, bg?: string) => void;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setPan: (x: number, y: number) => void;
  resetView: () => void;
  toggleRulers: () => void;
  setActiveTool: (tool: ToolType) => void;
  
  // Tool options setters
  setBrushSize: (size: number) => void;
  setBrushHardness: (hardness: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setBrushColor: (color: string) => void;
  setSecondaryColor: (color: string) => void;
  swapColors: () => void;

  setTextFont: (font: string) => void;
  setTextSize: (size: number) => void;
  setShapeType: (shape: 'rectangle' | 'ellipse' | 'rounded') => void;

  setSelection: (selection: SelectionRect | null) => void;
  clearSelection: () => void;

  // Layer Operations
  setActiveLayer: (id: string) => void;
  addLayer: (partial?: Partial<LayerItem>, actionLabel?: string) => void;
  addTextLayer: (text?: string, x?: number, y?: number) => void;
  duplicateLayer: (id: string) => void;
  removeLayer: (id: string) => void;
  mergeDown: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setLayerBlendMode: (id: string, mode: BlendModeType) => void;
  setLayerPosition: (id: string, x: number, y: number) => void;
  setLayerAdjustments: (id: string, adjustments: Partial<LayerAdjustments>) => void;
  updateLayerText: (id: string, text: string) => void;
  updateLayerData: (id: string, data: Uint8Array, textureUrl?: string) => void;
  renameLayer: (id: string, name: string) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;
  deleteActiveLayer: () => void;
  fillActiveLayer: (color: string) => void;
  reorderLayers: (startIndex: number, endIndex: number) => void;

  // Filters
  invertLayerColors: (id: string) => void;
  desaturateLayer: (id: string) => void;

  // AI Actions
  setAiProcessing: (state: Partial<AiTaskState>) => void;
  setFps: (fps: number) => void;

  // History Actions
  pushHistory: (actionName: string) => void;
  jumpToHistory: (index: number) => void;
  undo: () => void;
  redo: () => void;

  // Modal controls
  setNewDocModalOpen: (open: boolean) => void;
  setExportModalOpen: (open: boolean) => void;
}

// Built-in offline SVG demo layers to eliminate external network/CORS issues
const DEMO_SUBJECT_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="neonGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#818cf8"/>
      <stop offset="100%" stop-color="#c084fc"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="15" stdDeviation="25" flood-color="#0284c7" flood-opacity="0.5"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <path d="M 280 620 C 280 500, 340 450, 400 450 C 460 450, 520 500, 520 620 Z" fill="url(#neonGlow)"/>
    <circle cx="400" cy="350" r="100" fill="url(#neonGlow)"/>
    <rect x="330" y="325" width="140" height="35" rx="17" fill="#0f172a" stroke="#38bdf8" stroke-width="4"/>
    <rect x="350" y="338" width="100" height="8" rx="4" fill="#38bdf8"/>
  </g>
</svg>
`)}`;

const DEMO_BACKGROUND_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <radialGradient id="sunGlow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#bgGrad)"/>
  <circle cx="600" cy="350" r="300" fill="url(#sunGlow)"/>
  <path d="M 0 550 L 1200 550 M 0 600 L 1200 600 M 0 660 L 1200 660 M 0 730 L 1200 730" stroke="#312e81" stroke-width="1.5" opacity="0.6"/>
  <path d="M 600 500 L 0 800 M 600 500 L 250 800 M 600 500 L 500 800 M 600 500 L 700 800 M 600 500 L 950 800 M 600 500 L 1200 800" stroke="#312e81" stroke-width="1.5" opacity="0.6"/>
</svg>
`)}`;

const INITIAL_LAYERS: LayerItem[] = [
  {
    id: 'layer-ai-subject',
    name: 'AI Subject (Foreground)',
    visible: true,
    locked: false,
    opacity: 1.0,
    blendMode: 'normal',
    type: 'raster',
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    textureUrl: DEMO_SUBJECT_SVG,
    adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false },
  },
  {
    id: 'layer-background',
    name: 'Background Artboard',
    visible: true,
    locked: true,
    opacity: 0.95,
    blendMode: 'normal',
    type: 'raster',
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    textureUrl: DEMO_BACKGROUND_SVG,
    adjustments: { brightness: -0.05, contrast: 0.1, saturation: -0.15, blur: 0, invert: false, grayscale: false, sepia: false },
  },
];

export const useEditorStore = create<EditorState>((set, get) => ({
  docTitle: 'Untitled-1.psai',
  docWidth: 1920,
  docHeight: 1080,
  dpi: 300,
  backgroundColor: '#ffffff',

  zoom: 0.75,
  panX: 0,
  panY: 0,
  showRulers: true,

  activeTool: 'brush',
  brushSize: 24,
  brushHardness: 0.8,
  brushOpacity: 1.0,
  brushColor: '#3b82f6',
  secondaryColor: '#ffffff',

  textFont: 'Inter',
  textSize: 48,
  textAlign: 'left',

  shapeType: 'rectangle',
  shapeFill: '#3b82f6',
  shapeStroke: 2,

  selection: null,
  selectionFeather: 0,

  layers: INITIAL_LAYERS,
  activeLayerId: 'layer-ai-subject',

  aiState: {
    isProcessing: false,
    stage: 'idle',
    progress: 0,
    message: 'PhotoshopAI Neural Engine Ready (DirectML / WebGPU)',
  },
  gpuBackend: 'WebGPU (120 FPS Target)',
  fps: 120,

  history: [
    {
      id: 'step-0',
      actionName: 'Open Document',
      timestamp: Date.now(),
      layers: INITIAL_LAYERS,
      activeLayerId: 'layer-ai-subject',
    },
  ],
  historyIndex: 0,

  isNewDocModalOpen: false,
  isExportModalOpen: false,

  setDocTitle: (docTitle) => set({ docTitle }),

  createNewDocument: (width, height, dpi, title = 'Untitled.psai', bg = '#ffffff') => {
    const blankLayer: LayerItem = {
      id: `layer-${Date.now()}`,
      name: 'Background',
      visible: true,
      locked: true,
      opacity: 1.0,
      blendMode: 'normal',
      type: 'raster',
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false },
    };

    set({
      docTitle: title,
      docWidth: width,
      docHeight: height,
      dpi,
      backgroundColor: bg,
      layers: [blankLayer],
      activeLayerId: blankLayer.id,
      selection: null,
      history: [
        {
          id: `step-${Date.now()}`,
          actionName: 'New Document',
          timestamp: Date.now(),
          layers: [blankLayer],
          activeLayerId: blankLayer.id,
        },
      ],
      historyIndex: 0,
      isNewDocModalOpen: false,
    });
    get().resetView();
  },

  setZoom: (zoom) =>
    set((state) => ({
      zoom: typeof zoom === 'function' ? Math.max(0.05, Math.min(32, zoom(state.zoom))) : Math.max(0.05, Math.min(32, zoom)),
    })),

  setPan: (panX, panY) => set({ panX, panY }),
  resetView: () => set({ zoom: 0.75, panX: 0, panY: 0 }),
  toggleRulers: () => set((state) => ({ showRulers: !state.showRulers })),
  setActiveTool: (activeTool) => set({ activeTool }),

  setBrushSize: (brushSize) => set({ brushSize }),
  setBrushHardness: (brushHardness) => set({ brushHardness }),
  setBrushOpacity: (brushOpacity) => set({ brushOpacity }),
  setBrushColor: (brushColor) => set({ brushColor }),
  setSecondaryColor: (secondaryColor) => set({ secondaryColor }),
  swapColors: () => set((state) => ({ brushColor: state.secondaryColor, secondaryColor: state.brushColor })),

  setTextFont: (textFont) => set({ textFont }),
  setTextSize: (textSize) => set({ textSize }),
  setShapeType: (shapeType) => set({ shapeType }),

  setSelection: (selection) => set({ selection }),
  clearSelection: () => set({ selection: null }),

  setActiveLayer: (activeLayerId) => set({ activeLayerId }),

  pushHistory: (actionName: string) => {
    const { layers, activeLayerId, history, historyIndex } = get();
    const newStep: HistoryStep = {
      id: `step-${Date.now()}`,
      actionName,
      timestamp: Date.now(),
      layers: JSON.parse(JSON.stringify(layers)),
      activeLayerId,
    };
    const sliced = history.slice(0, historyIndex + 1);
    set({
      history: [...sliced, newStep],
      historyIndex: sliced.length,
    });
  },

  jumpToHistory: (index: number) => {
    const { history } = get();
    if (index >= 0 && index < history.length) {
      const step = history[index];
      set({
        layers: JSON.parse(JSON.stringify(step.layers)),
        activeLayerId: step.activeLayerId,
        historyIndex: index,
      });
    }
  },

  addLayer: (partial, actionLabel = 'New Layer') => {
    const state = get();
    const newLayer: LayerItem = {
      id: `layer-${Date.now()}`,
      name: `Layer ${state.layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1.0,
      blendMode: 'normal',
      type: 'raster',
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false },
      ...partial,
    };

    const newLayers = [newLayer, ...state.layers];
    set({
      layers: newLayers,
      activeLayerId: newLayer.id,
    });
    get().pushHistory(actionLabel);
  },

  addTextLayer: (text = 'PhotoshopAI Text', x = 200, y = 200) => {
    const state = get();
    const newLayer: LayerItem = {
      id: `layer-text-${Date.now()}`,
      name: `Type: "${text.substring(0, 15)}"`,
      visible: true,
      locked: false,
      opacity: 1.0,
      blendMode: 'normal',
      type: 'text',
      x,
      y,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      text,
      fontSize: state.textSize,
      fontFamily: state.textFont,
      textColor: state.brushColor,
      adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false },
    };

    set({
      layers: [newLayer, ...state.layers],
      activeLayerId: newLayer.id,
    });
    get().pushHistory('Add Type Layer');
  },

  duplicateLayer: (id: string) => {
    const state = get();
    const target = state.layers.find((l) => l.id === id);
    if (!target) return;

    const copy: LayerItem = {
      ...JSON.parse(JSON.stringify(target)),
      id: `layer-${Date.now()}`,
      name: `${target.name} copy`,
      x: target.x + 20,
      y: target.y + 20,
    };

    const targetIdx = state.layers.findIndex((l) => l.id === id);
    const updated = [...state.layers];
    updated.splice(targetIdx, 0, copy);

    set({ layers: updated, activeLayerId: copy.id });
    get().pushHistory(`Duplicate ${target.name}`);
  },

  removeLayer: (id) => {
    const state = get();
    if (state.layers.length <= 1) {
      const resetLayer: LayerItem = {
        id: `layer-${Date.now()}`,
        name: 'Layer 1',
        visible: true,
        locked: false,
        opacity: 1.0,
        blendMode: 'normal',
        type: 'raster',
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false },
      };
      set({ layers: [resetLayer], activeLayerId: resetLayer.id });
      get().pushHistory('Clear and Reset Layer');
      return;
    }
    const filtered = state.layers.filter((l) => l.id !== id);
    set({
      layers: filtered,
      activeLayerId: filtered[0]?.id || '',
    });
    get().pushHistory('Delete Layer');
  },

  mergeDown: (id) => {
    const state = get();
    const idx = state.layers.findIndex((l) => l.id === id);
    if (idx === -1 || idx >= state.layers.length - 1) return; // Cannot merge bottom layer
    const current = state.layers[idx];
    const below = state.layers[idx + 1];

    const merged: LayerItem = {
      ...below,
      name: `Merged (${current.name})`,
      opacity: 1.0,
    };

    const nextLayers = state.layers.filter((_, i) => i !== idx && i !== idx + 1);
    nextLayers.splice(idx, 0, merged);

    set({ layers: nextLayers, activeLayerId: merged.id });
    get().pushHistory('Merge Down');
  },

  toggleLayerVisibility: (id) =>
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    })),

  toggleLayerLock: (id) =>
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
    })),

  setLayerOpacity: (id, opacity) =>
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
    })),

  setLayerBlendMode: (id, blendMode) => {
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, blendMode } : l)),
    }));
    get().pushHistory('Change Blend Mode');
  },

  setLayerPosition: (id, x, y) =>
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, x, y } : l)),
    })),

  setLayerAdjustments: (id, adjustments) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, adjustments: { ...l.adjustments, ...adjustments } } : l
      ),
    })),

  updateLayerText: (id, text) =>
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, text } : l)),
    })),

  updateLayerData: (id, data, textureUrl) => {
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, data, textureUrl: textureUrl ?? l.textureUrl } : l
      ),
    }));
    get().pushHistory('Update Layer Data');
  },

  reorderLayers: (startIndex, endIndex) => {
    const result = Array.from(get().layers);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    set({ layers: result });
    get().pushHistory('Reorder Layers');
  },

  renameLayer: (id, name) => {
    if (!name.trim()) return;
    set((state) => ({
      layers: state.layers.map((l) => (l.id === id ? { ...l, name } : l)),
    }));
    get().pushHistory(`Rename Layer to "${name}"`);
  },

  moveLayerUp: (id) => {
    const { layers } = get();
    const idx = layers.findIndex((l) => l.id === id);
    if (idx > 0) {
      get().reorderLayers(idx, idx - 1);
    }
  },

  moveLayerDown: (id) => {
    const { layers } = get();
    const idx = layers.findIndex((l) => l.id === id);
    if (idx !== -1 && idx < layers.length - 1) {
      get().reorderLayers(idx, idx + 1);
    }
  },

  deleteActiveLayer: () => {
    const { activeLayerId } = get();
    if (activeLayerId) {
      get().removeLayer(activeLayerId);
    }
  },

  fillActiveLayer: (color) => {
    const { activeLayerId, docWidth, docHeight } = get();
    if (!activeLayerId) return;
    const canvas = document.createElement('canvas');
    canvas.width = docWidth;
    canvas.height = docHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, docWidth, docHeight);
    }
    const url = canvas.toDataURL('image/png');
    get().updateLayerData(activeLayerId, new Uint8Array(), url);
    get().pushHistory(`Fill Layer with ${color}`);
  },

  invertLayerColors: (id) => {
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id
          ? { ...l, adjustments: { ...l.adjustments, invert: !l.adjustments.invert } }
          : l
      ),
    }));
    get().pushHistory('Invert Colors');
  },

  desaturateLayer: (id) => {
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, adjustments: { ...l.adjustments, saturation: -1 } } : l
      ),
    }));
    get().pushHistory('Desaturate');
  },

  setAiProcessing: (aiState) =>
    set((state) => ({
      aiState: { ...state.aiState, ...aiState },
    })),

  setFps: (fps) => set({ fps }),

  undo: () => {
    const { historyIndex } = get();
    if (historyIndex > 0) {
      get().jumpToHistory(historyIndex - 1);
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      get().jumpToHistory(historyIndex + 1);
    }
  },

  setNewDocModalOpen: (isNewDocModalOpen) => set({ isNewDocModalOpen }),
  setExportModalOpen: (isExportModalOpen) => set({ isExportModalOpen }),
}));
