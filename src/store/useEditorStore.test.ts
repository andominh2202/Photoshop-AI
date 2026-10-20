import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, LayerItem } from './useEditorStore';
import { pixelRegistry } from './pixelStore';
import { hotStore } from './hotStore';

describe('useEditorStore & Performance Isolation', () => {
  beforeEach(() => {
    pixelRegistry.clearAll();
    useEditorStore.getState().createNewDocument(1920, 1080, 300, 'TestDoc.psai');
  });

  it('1. pushHistory does not store or clone heavy binary Uint8Array inside history snapshots', () => {
    const store = useEditorStore.getState();
    const activeLayerId = store.activeLayerId;
    expect(activeLayerId).toBeDefined();

    // Create a 5MB simulated image buffer
    const largeBuffer = new Uint8Array(5 * 1024 * 1024);
    largeBuffer.fill(255);

    // Update layer data with heavy buffer
    store.updateLayerData(activeLayerId, largeBuffer);

    // Verify buffer is safely stored in pixelRegistry outside Zustand
    const retrievedBytes = pixelRegistry.getLayerBytes(activeLayerId);
    expect(retrievedBytes).toBeDefined();
    expect(retrievedBytes?.byteLength).toBe(5 * 1024 * 1024);

    // Check history snapshots: verify that layers in history do NOT hold raw data arrays
    const history = useEditorStore.getState().history;
    const latestStep = history[history.length - 1];
    expect(latestStep.layers[0].data).toBeUndefined();

    // Verify memory estimate in pixelRegistry is tracked accurately
    expect(pixelRegistry.estimateMemoryBytes()).toBe(5 * 1024 * 1024);
  });

  it('2. History stack enforces MAX_HISTORY_STEPS limit (30) to prevent memory leak', () => {
    const store = useEditorStore.getState();

    // Push 45 distinct actions
    for (let i = 1; i <= 45; i++) {
      store.pushHistory(`Action Step #${i}`);
    }

    const currentHistory = useEditorStore.getState().history;
    const historyIndex = useEditorStore.getState().historyIndex;

    // Must be capped at exactly 30 steps
    expect(currentHistory.length).toBe(30);
    expect(historyIndex).toBe(29);
    expect(currentHistory[currentHistory.length - 1].actionName).toBe('Action Step #45');
    expect(currentHistory[0].actionName).toBe('Action Step #16');
  });

  it('3. Undo and Redo restore metadata accurately and link back to pixelRegistry', () => {
    const store = useEditorStore.getState();
    const layerId = store.activeLayerId;

    // Step 1: Initial state
    expect(useEditorStore.getState().layers[0].name).toBe('Background');

    // Step 2: Rename (pushes history)
    store.renameLayer(layerId, 'Renamed Layer');
    expect(useEditorStore.getState().layers[0].name).toBe('Renamed Layer');

    // Step 3: Invert colors (pushes history)
    store.invertLayerColors(layerId);
    expect(useEditorStore.getState().layers[0].adjustments.invert).toBe(true);

    // Step 4: Undo inversion
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().layers[0].adjustments.invert).toBe(false);
    expect(useEditorStore.getState().layers[0].name).toBe('Renamed Layer');

    // Step 5: Redo inversion
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().layers[0].adjustments.invert).toBe(true);
    expect(useEditorStore.getState().layers[0].name).toBe('Renamed Layer');
  });

  it('4. hotStore telemetries (FPS & Zoom) are isolated from editor state', () => {
    let capturedFps = 0;
    const unsubscribe = hotStore.subscribe((metrics) => {
      capturedFps = metrics.fps;
    });

    // Update FPS via store action
    useEditorStore.getState().setFps(144);

    expect(capturedFps).toBe(144);
    expect(hotStore.getSnapshot().fps).toBe(144);

    unsubscribe();
  });

  it('5. Layer deletion via DeleteLayerCommand preserves buffer until eviction', () => {
    const store = useEditorStore.getState();
    const layerId = store.activeLayerId;

    const dummyData = new Uint8Array([1, 2, 3, 4, 5]);
    store.updateLayerData(layerId, dummyData);
    expect(pixelRegistry.getLayerBytes(layerId)).toBeDefined();

    // Remove layer (queued via commandManager to preserve buffer for undo)
    store.removeLayer(layerId);

    // Buffer is preserved for undo!
    expect(pixelRegistry.getLayerBytes(layerId)).toBeDefined();

    // When purged via pixelRegistry.deleteLayerData (on eviction/disposal):
    pixelRegistry.deleteLayerData(layerId);
    expect(pixelRegistry.getLayerBytes(layerId)).toBeUndefined();
  });

  it('6. Layer operations: select, duplicate, visibility, lock, opacity, blendMode, reorder', () => {
    const testLayer: LayerItem = {
      id: 'layer-op-test-1',
      name: 'Op Test Layer',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      type: 'raster',
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      adjustments: { brightness: 0, contrast: 0, saturation: 0, blur: 0, invert: false, grayscale: false, sepia: false },
    };
    useEditorStore.setState({ layers: [testLayer], activeLayerId: testLayer.id });

    const store = useEditorStore.getState();
    const activeId = testLayer.id;

    // Visibility toggle
    store.toggleLayerVisibility(activeId);
    expect(useEditorStore.getState().layers.find((l) => l.id === activeId)?.visible).toBe(false);
    store.toggleLayerVisibility(activeId);
    expect(useEditorStore.getState().layers.find((l) => l.id === activeId)?.visible).toBe(true);

    // Lock toggle
    store.toggleLayerLock(activeId);
    expect(useEditorStore.getState().layers.find((l) => l.id === activeId)?.locked).toBe(true);
    store.toggleLayerLock(activeId);
    expect(useEditorStore.getState().layers.find((l) => l.id === activeId)?.locked).toBe(false);

    // Opacity & blend mode
    store.setLayerOpacity(activeId, 0.75);
    expect(useEditorStore.getState().layers.find((l) => l.id === activeId)?.opacity).toBe(0.75);
    store.setLayerBlendMode(activeId, 'multiply');
    expect(useEditorStore.getState().layers.find((l) => l.id === activeId)?.blendMode).toBe('multiply');

    // Rename
    store.renameLayer(activeId, 'Renamed Layer');
    expect(useEditorStore.getState().layers.find((l) => l.id === activeId)?.name).toBe('Renamed Layer');

    // Duplicate layer
    const countBefore = useEditorStore.getState().layers.length;
    store.duplicateLayer(activeId);
    expect(useEditorStore.getState().layers.length).toBe(countBefore + 1);

    // Reorder layers
    store.reorderLayers(0, 1);
    expect(useEditorStore.getState().layers).toHaveLength(countBefore + 1);
  });

  it('7. Tools, viewport, modals, and hotkeys state actions', () => {
    const store = useEditorStore.getState();

    // Tools & brush settings
    store.setActiveTool('eraser');
    expect(useEditorStore.getState().activeTool).toBe('eraser');
    store.setBrushSize(45);
    expect(useEditorStore.getState().brushSize).toBe(45);
    store.setBrushColor('#ff0055');
    expect(useEditorStore.getState().brushColor).toBe('#ff0055');
    store.setBrushOpacity(0.8);
    expect(useEditorStore.getState().brushOpacity).toBe(0.8);

    // Viewport
    store.setZoom(1.5);
    expect(useEditorStore.getState().zoom).toBe(1.5);
    store.setPan(100, 200);
    expect(useEditorStore.getState().panX).toBe(100);
    expect(useEditorStore.getState().panY).toBe(200);
    store.setZoom(1);
    store.setPan(0, 0);
    expect(useEditorStore.getState().zoom).toBe(1);

    // Modals
    store.setExportModalOpen(true);
    expect(useEditorStore.getState().isExportModalOpen).toBe(true);
    store.setExportModalOpen(false);
    expect(useEditorStore.getState().isExportModalOpen).toBe(false);
    store.setNewDocModalOpen(true);
    expect(useEditorStore.getState().isNewDocModalOpen).toBe(true);
    store.setNewDocModalOpen(false);
    expect(useEditorStore.getState().isNewDocModalOpen).toBe(false);

    // Document creation
    store.createNewDocument(800, 600, 72, 'Transparent Art', 'transparent');
    expect(useEditorStore.getState().docWidth).toBe(800);
    expect(useEditorStore.getState().docHeight).toBe(600);
    expect(useEditorStore.getState().backgroundColor).toBe('transparent');
    expect(useEditorStore.getState().docTitle).toBe('Transparent Art');

    // Text layer
    store.addTextLayer('Headline Text', 150, 150);
    const textLayer = useEditorStore.getState().layers.find((l) => l.type === 'text');
    expect(textLayer).toBeDefined();
    expect(textLayer?.text).toBe('Headline Text');

    // Layer position & text update
    if (textLayer) {
      store.setLayerPosition(textLayer.id, 300, 400);
      expect(useEditorStore.getState().layers.find((l) => l.id === textLayer.id)?.x).toBe(300);
      store.updateLayerText(textLayer.id, 'Updated Headline');
      expect(useEditorStore.getState().layers.find((l) => l.id === textLayer.id)?.text).toBe('Updated Headline');
    }

    // Colors, fonts, and selections
    store.setTextFont('Arial');
    expect(useEditorStore.getState().textFont).toBe('Arial');
    store.setTextSize(32);
    expect(useEditorStore.getState().textSize).toBe(32);
    store.setSecondaryColor('#00ff00');
    expect(useEditorStore.getState().secondaryColor).toBe('#00ff00');
    store.swapColors();
    expect(useEditorStore.getState().brushColor).toBe('#00ff00');
    store.setShapeType('ellipse');
    expect(useEditorStore.getState().shapeType).toBe('ellipse');
    store.setSelection({ x: 10, y: 10, width: 50, height: 50 });
    expect(useEditorStore.getState().selection).not.toBeNull();
    store.clearSelection();
    expect(useEditorStore.getState().selection).toBeNull();

    // Layer hierarchy navigation (moveLayerUp / moveLayerDown / deleteActiveLayer)
    if (useEditorStore.getState().layers.length >= 2) {
      const topId = useEditorStore.getState().layers[0].id;
      store.moveLayerDown(topId);
      expect(useEditorStore.getState().layers[1].id).toBe(topId);
      store.moveLayerUp(topId);
      expect(useEditorStore.getState().layers[0].id).toBe(topId);
    }
    store.deleteActiveLayer();
  });
});
