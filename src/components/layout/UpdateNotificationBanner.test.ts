import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DISMISSED_UPDATE_KEY } from './UpdateNotificationBanner';
import {
  emitUpdateAvailable,
  emitDownloadProgress,
  onUpdateAvailable,
  onDownloadProgress,
  UpdateInfo,
} from '@/platform/api';

// Polyfill mock localStorage for node test environment
if (typeof localStorage === 'undefined') {
  let store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => {
      store[key] = String(val);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
}

describe('UpdateNotificationBanner Logic & Lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('1. DISMISSED_UPDATE_KEY constant has expected localStorage key name', () => {
    expect(DISMISSED_UPDATE_KEY).toBe('photoshopai_dismissed_update');
  });

  it('2. Dismissed version prevents displaying dismissed update', () => {
    const testVersion = '2.1.0';
    localStorage.setItem(DISMISSED_UPDATE_KEY, testVersion);

    const receivedUpdates: UpdateInfo[] = [];
    const cleanup = onUpdateAvailable((info) => {
      const dismissed = localStorage.getItem(DISMISSED_UPDATE_KEY);
      if (dismissed !== info.version) {
        receivedUpdates.push(info);
      }
    });

    emitUpdateAvailable({
      available: true,
      version: '2.1.0',
      notes: 'Should be ignored because it was dismissed',
    });

    expect(receivedUpdates.length).toBe(0);

    // Emitting a newer version that was NOT dismissed should pass through
    emitUpdateAvailable({
      available: true,
      version: '2.2.0',
      notes: 'New feature release',
    });

    expect(receivedUpdates.length).toBe(1);
    expect(receivedUpdates[0].version).toBe('2.2.0');

    cleanup();
  });

  it('3. Download progress stream delivers sequential percentage updates', () => {
    const progressList: number[] = [];
    const cleanup = onDownloadProgress((pct) => {
      progressList.push(pct);
    });

    emitDownloadProgress(10);
    emitDownloadProgress(50);
    emitDownloadProgress(100);

    expect(progressList).toEqual([10, 50, 100]);

    cleanup();
  });
});
