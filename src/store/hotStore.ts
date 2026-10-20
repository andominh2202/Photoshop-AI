/**
 * HotStore: High-frequency telemetry store (FPS, Cursor World Coords, Live Zoom & Pan).
 * Decoupled from React's virtual DOM diffing to keep UI locked at 60-120 FPS.
 */

export interface HotMetrics {
  fps: number;
  zoom: number;
  panX: number;
  panY: number;
  cursorX: number;
  cursorY: number;
}

type Listener = (metrics: HotMetrics) => void;

class HotStore {
  private static instance: HotStore;
  private metrics: HotMetrics = {
    fps: 120,
    zoom: 0.75,
    panX: 0,
    panY: 0,
    cursorX: 0,
    cursorY: 0,
  };
  private listeners: Set<Listener> = new Set();
  private lastNotifyTime = 0;
  private notifyThrottleMs = 100; // Throttle UI notifications to 10Hz max

  public static getInstance(): HotStore {
    if (!HotStore.instance) {
      HotStore.instance = new HotStore();
    }
    return HotStore.instance;
  }

  public getSnapshot(): HotMetrics {
    return this.metrics;
  }

  public setMetrics(partial: Partial<HotMetrics>, forceImmediate = false): void {
    Object.assign(this.metrics, partial);

    const now = performance.now();
    if (forceImmediate || now - this.lastNotifyTime >= this.notifyThrottleMs) {
      this.lastNotifyTime = now;
      this.notify();
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.metrics);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.metrics);
      } catch (err) {
        console.error('HotStore listener error:', err);
      }
    });
  }
}

export const hotStore = HotStore.getInstance();

/**
 * React hook to safely subscribe to high-frequency telemetry metrics without
 * triggering re-renders in other components.
 */
import { useState, useEffect } from 'react';

export function useHotMetrics<T>(selector: (metrics: HotMetrics) => T): T {
  const [value, setValue] = useState<T>(() => selector(hotStore.getSnapshot()));

  useEffect(() => {
    return hotStore.subscribe((metrics) => {
      const nextValue = selector(metrics);
      setValue((prev) => (Object.is(prev, nextValue) ? prev : nextValue));
    });
  }, [selector]);

  return value;
}
