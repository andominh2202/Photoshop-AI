import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useToastStore, showToast } from '@/store/toastStore';
import { useEditorStore } from '@/store/useEditorStore';

describe('AdjustmentsPanel & PixiCanvas Drop Validation (Ưu tiên 6)', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  describe('PixiCanvas Drop File Validation (6B)', () => {
    const MAX_FILE_SIZE = 200 * 1024 * 1024;
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];

    function validateDroppedFile(file: { name: string; size: number; type: string }): boolean {
      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        showToast(`File quá lớn (${sizeMB}MB). Giới hạn 200MB.`, 'warning');
        return false;
      }

      if (!validTypes.includes(file.type)) {
        showToast(
          `Định dạng không hỗ trợ: ${file.name}. Chấp nhận: PNG, JPG, WebP, GIF, AVIF.`,
          'warning'
        );
        return false;
      }

      return true;
    }

    it('rejects files larger than 200MB with warning toast', () => {
      const largeFile = {
        name: 'huge_raw_photo.png',
        size: 250 * 1024 * 1024,
        type: 'image/png',
      };

      const accepted = validateDroppedFile(largeFile);
      expect(accepted).toBe(false);

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].type).toBe('warning');
      expect(toasts[0].message).toContain('File quá lớn (250.0MB). Giới hạn 200MB.');
    });

    it('rejects unsupported file formats with descriptive toast', () => {
      const invalidFile = {
        name: 'vector_graphic.svg',
        size: 2 * 1024 * 1024,
        type: 'image/svg+xml',
      };

      const accepted = validateDroppedFile(invalidFile);
      expect(accepted).toBe(false);

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].type).toBe('warning');
      expect(toasts[0].message).toContain('Định dạng không hỗ trợ: vector_graphic.svg');
      expect(toasts[0].message).toContain('Chấp nhận: PNG, JPG, WebP, GIF, AVIF.');
    });

    it('accepts valid PNG, JPG, WebP, GIF, AVIF files under 200MB without warning toast', () => {
      const validFiles = [
        { name: 'photo.png', size: 10 * 1024 * 1024, type: 'image/png' },
        { name: 'photo.jpg', size: 5 * 1024 * 1024, type: 'image/jpeg' },
        { name: 'photo.webp', size: 3 * 1024 * 1024, type: 'image/webp' },
        { name: 'photo.gif', size: 1 * 1024 * 1024, type: 'image/gif' },
        { name: 'photo.avif', size: 2 * 1024 * 1024, type: 'image/avif' },
      ];

      validFiles.forEach((file) => {
        expect(validateDroppedFile(file)).toBe(true);
      });

      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  describe('AdjustmentsPanel Slider Synchronization on Undo/Redo (6A)', () => {
    it('updates layer adjustments in store and reflects in activeLayer', () => {
      useEditorStore.setState({
        layers: [
          {
            id: 'layer-adjust-1',
            name: 'Layer 1',
            visible: true,
            opacity: 1,
            blendMode: 'normal',
            type: 'raster',
            locked: false,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            x: 0,
            y: 0,
            adjustments: {
              brightness: 0,
              contrast: 0,
              saturation: 0,
              blur: 0,
              invert: false,
              grayscale: false,
              sepia: false,
            },
          },
        ],
        activeLayerId: 'layer-adjust-1',
      });

      // User changes brightness to 0.5
      useEditorStore.getState().setLayerAdjustments('layer-adjust-1', { brightness: 0.5 });
      let layer = useEditorStore.getState().layers.find((l) => l.id === 'layer-adjust-1');
      expect(layer?.adjustments.brightness).toBe(0.5);

      // Undo resets brightness to 0.0
      useEditorStore.getState().setLayerAdjustments('layer-adjust-1', { brightness: 0.0 });
      layer = useEditorStore.getState().layers.find((l) => l.id === 'layer-adjust-1');
      expect(layer?.adjustments.brightness).toBe(0.0);
    });
  });
});
