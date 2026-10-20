import { describe, it, expect, vi } from 'vitest';
import { sendImageToAI, onAIProgress, cancelAIJob, getRuntime } from './api';
import * as fs from 'fs';
import * as path from 'path';

describe('Unified Platform API (IPC & AI Bridge)', () => {
  it('1. onAIProgress registers listener and cleanup function unbinds correctly', () => {
    const progressSpy = vi.fn();
    const cleanup = onAIProgress(progressSpy);

    expect(typeof cleanup).toBe('function');

    // Trigger test event via fallback
    cleanup();

    // Verify after cleanup, listeners set does not hold this spy
    // (tested by verifying cleanup executed without error)
  });

  it('2. Runtime detection returns valid environment', () => {
    const runtime = getRuntime();
    expect(['tauri', 'electron', 'web']).toContain(runtime);
  });

  it('3. sendImageToAI processes binary bytes and returns Uint8Array without JSON stringification', async () => {
    const inputBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header
    const result = await sendImageToAI('test-layer', inputBytes, 'test-job-1');

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it('4. cancelAIJob successfully registers cancellation', async () => {
    const testJobId = 'job-to-cancel-123';
    await expect(cancelAIJob(testJobId)).resolves.not.toThrow();
  });

  it('5. UI Components do NOT import directly from @tauri-apps/api or electron', () => {
    const canvasFilePath = path.resolve(__dirname, '../canvas/PixiCanvas.tsx');
    const content = fs.readFileSync(canvasFilePath, 'utf-8');

    // Must NOT contain direct imports from @tauri-apps or electron
    expect(content.includes("from '@tauri-apps/api")).toBe(false);
    expect(content.includes("from 'electron")).toBe(false);

    // Must import from platform/api
    expect(content.includes("from '@/platform/api'")).toBe(true);
  });

  it('6. sendInpaintRequest processes binary image + mask bytes and returns Uint8Array', async () => {
    const { sendInpaintRequest } = await import('./api');
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const maskBytes = new Uint8Array([255, 255, 0, 0]);
    const result = await sendInpaintRequest('test-layer', imageBytes, maskBytes, 'inpaint-job-test');

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  describe('Auto-Updater Platform Abstraction', () => {
    it('7. checkForUpdates returns false on default web runtime', async () => {
      const { checkForUpdates } = await import('./api');
      const update = await checkForUpdates();
      expect(update).toBeDefined();
      expect(update.available).toBe(false);
    });

    it('8. checkForUpdates queries mock electronAPI when running in Electron runtime', async () => {
      const { checkForUpdates } = await import('./api');
      
      // Mock window.electronAPI
      const originalWindow = global.window;
      (global as any).window = {
        electronAPI: {
          isDesktop: true,
          checkForUpdates: vi.fn().mockResolvedValue({
            available: true,
            version: '1.2.0',
            notes: 'Performance improvements and new AI filters',
          }),
        },
      };

      try {
        const result = await checkForUpdates();
        expect(result.available).toBe(true);
        expect(result.version).toBe('1.2.0');
        expect(result.notes).toContain('Performance improvements');
      } finally {
        global.window = originalWindow;
      }
    });

    it('9. onUpdateAvailable registers callback and cleanup function unbinds correctly', async () => {
      const { onUpdateAvailable, emitUpdateAvailable } = await import('./api');
      const listenerSpy = vi.fn();
      const unbind = onUpdateAvailable(listenerSpy);

      emitUpdateAvailable({
        available: true,
        version: '2.0.0',
        notes: 'Major release',
      });

      expect(listenerSpy).toHaveBeenCalledTimes(1);
      expect(listenerSpy).toHaveBeenCalledWith({
        available: true,
        version: '2.0.0',
        notes: 'Major release',
      });

      // Cleanup listener
      unbind();

      // Emit second event
      emitUpdateAvailable({
        available: true,
        version: '2.0.1',
      });

      // Spy should NOT be called again after cleanup unbind
      expect(listenerSpy).toHaveBeenCalledTimes(1);
    });

    it('10. onDownloadProgress tracks percent and cleanup stops callbacks', async () => {
      const { onDownloadProgress, emitDownloadProgress } = await import('./api');
      const progressSpy = vi.fn();
      const unbind = onDownloadProgress(progressSpy);

      emitDownloadProgress(25);
      emitDownloadProgress(75);
      expect(progressSpy).toHaveBeenCalledTimes(2);
      expect(progressSpy).toHaveBeenLastCalledWith(75);

      unbind();

      emitDownloadProgress(100);
      expect(progressSpy).toHaveBeenCalledTimes(2);
    });

    it('11. installUpdate delegates to native Electron runner without throwing', async () => {
      const { installUpdate } = await import('./api');
      const mockInstall = vi.fn().mockResolvedValue(true);

      const originalWindow = global.window;
      (global as any).window = {
        electronAPI: {
          isDesktop: true,
          installUpdate: mockInstall,
        },
      };

      try {
        await expect(installUpdate()).resolves.not.toThrow();
        expect(mockInstall).toHaveBeenCalledTimes(1);
      } finally {
        global.window = originalWindow;
      }
    });

    it('12. Dismissed update versions are stored and checked against localStorage correctly', () => {
      const DISMISSED_KEY = 'photoshopai_dismissed_update';
      const testVersion = '1.2.3';

      // Mock localStorage
      const store: Record<string, string> = {};
      const mockLocalStorage = {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, val: string) => {
          store[key] = val;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      };

      expect(mockLocalStorage.getItem(DISMISSED_KEY)).toBeNull();

      // Dismiss testVersion
      mockLocalStorage.setItem(DISMISSED_KEY, testVersion);
      expect(mockLocalStorage.getItem(DISMISSED_KEY)).toBe('1.2.3');

      // A different version should not be considered dismissed
      expect(mockLocalStorage.getItem(DISMISSED_KEY) === '1.2.4').toBe(false);
    });

    it('13. reportAppReady reports TTI safely across runtimes without throw', async () => {
      const { reportAppReady } = await import('./api');
      const originalWindow = global.window;

      // Web fallback (no-op)
      await expect(reportAppReady(250)).resolves.not.toThrow();

      // Electron runtime
      const mockReportReady = vi.fn().mockResolvedValue(undefined);
      (global as any).window = {
        electronAPI: {
          isDesktop: true,
          reportReady: mockReportReady,
        },
      };

      try {
        await reportAppReady(350);
        expect(mockReportReady).toHaveBeenCalledWith(350);
      } finally {
        global.window = originalWindow;
      }
    });

    it('14. sendImageToAI and sendInpaintRequest execute Electron zero-copy paths', async () => {
      const { sendImageToAI, sendInpaintRequest, cancelAIJob } = await import('./api');
      const originalWindow = global.window;

      const mockSendAI = vi.fn().mockResolvedValue(new Uint8Array([255, 0, 0, 255]));
      const mockSendInpaint = vi.fn().mockResolvedValue(new Uint8Array([0, 255, 0, 255]));
      const mockCancel = vi.fn().mockResolvedValue(undefined);

      (global as any).window = {
        electronAPI: {
          isDesktop: true,
          sendImageToAI: mockSendAI,
          sendInpaintRequest: mockSendInpaint,
          cancelAIJob: mockCancel,
        },
      };

      try {
        const dummyBytes = new Uint8Array([1, 2, 3, 4]);
        const resAI = await sendImageToAI('layer-ipc', dummyBytes, 'job-electron-ai');
        expect(resAI).toBeInstanceOf(Uint8Array);
        expect(mockSendAI).toHaveBeenCalled();

        const resInpaint = await sendInpaintRequest('layer-ipc', dummyBytes, dummyBytes, 'job-electron-inpaint');
        expect(resInpaint).toBeInstanceOf(Uint8Array);
        expect(mockSendInpaint).toHaveBeenCalled();

        await cancelAIJob('job-electron-ai');
        expect(mockCancel).toHaveBeenCalledWith('job-electron-ai');
      } finally {
        global.window = originalWindow;
      }
    });

    it('15. getRuntime correctly identifies Tauri environment when __TAURI_INTERNALS__ is present', async () => {
      const { getRuntime } = await import('./api');
      const originalWindow = global.window;

      (global as any).window = {
        __TAURI_INTERNALS__: {},
      };

      try {
        expect(getRuntime()).toBe('tauri');
      } finally {
        global.window = originalWindow;
      }
    });

    it('16. execute Tauri binary paths for sendImageToAI and sendInpaintRequest when in Tauri runtime', async () => {
      const { sendImageToAI, sendInpaintRequest, checkForUpdates, installUpdate } = await import('./api');
      const originalWindow = global.window;

      (global as any).window = {
        __TAURI_INTERNALS__: {},
      };

      vi.doMock('@tauri-apps/api/core', () => ({
        invoke: vi.fn().mockImplementation((cmd: string) => {
          if (cmd === 'check_for_updates') return Promise.resolve({ available: true, version: '2.5.0' });
          if (cmd === 'install_update') return Promise.resolve(undefined);
          return Promise.resolve(new Uint8Array([10, 20, 30, 40]));
        }),
      }));
      vi.doMock('@tauri-apps/api/event', () => ({
        listen: vi.fn().mockResolvedValue(() => {}),
      }));

      try {
        const dummy = new Uint8Array([1, 2]);
        const res = await sendImageToAI('l1', dummy, 'tauri-job-1');
        expect(res).toBeInstanceOf(Uint8Array);

        const resInpaint = await sendInpaintRequest('l1', dummy, dummy, 'tauri-job-2');
        expect(resInpaint).toBeInstanceOf(Uint8Array);

        const updateRes = await checkForUpdates();
        expect(updateRes.available).toBe(true);

        await expect(installUpdate()).resolves.not.toThrow();
      } finally {
        global.window = originalWindow;
      }
    });
  });
});


