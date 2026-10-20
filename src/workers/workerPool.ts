import type { OpParams, WorkerApplyMessage, WorkerDoneMessage } from './colorWorker';
import { processPixelBuffer } from './colorWorker';

export interface TaskItem {
  id: string;
  buffer: SharedArrayBuffer | ArrayBuffer;
  isShared: boolean;
  width: number;
  height: number;
  op: OpParams;
  tileX?: number;
  tileY?: number;
  tileW?: number;
  tileH?: number;
}

interface QueuedTask {
  item: TaskItem;
  resolve: (val: { id: string; cancelled?: boolean; buffer?: ArrayBuffer | SharedArrayBuffer }) => void;
  reject: (err: any) => void;
}

export class WorkerPool {
  private static instance: WorkerPool;
  private workers: Worker[] = [];
  private idleWorkers: Worker[] = [];
  private activeJobs: Map<Worker, QueuedTask> = new Map();
  private queue: QueuedTask[] = [];
  private cancelledIds: Set<string> = new Set();
  private poolSize: number;
  private isBrowserWorkerSupported = false;

  private constructor() {
    const concurrency =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4;
    this.poolSize = Math.max(2, Math.min(4, concurrency));
    this.initWorkers();
  }

  public static getInstance(): WorkerPool {
    if (!WorkerPool.instance) {
      WorkerPool.instance = new WorkerPool();
    }
    return WorkerPool.instance;
  }

  public getPoolSize(): number {
    return this.poolSize;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getActiveCount(): number {
    return this.activeJobs.size;
  }

  private initWorkers(): void {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        for (let i = 0; i < this.poolSize; i++) {
          const worker = new Worker(new URL('./colorWorker.ts', import.meta.url), {
            type: 'module',
          });

          worker.onmessage = (event: MessageEvent<WorkerDoneMessage>) => {
            this.handleWorkerDone(worker, event.data);
          };

          worker.onerror = (err) => {
            console.error('[WorkerPool] Worker runtime error:', err);
            const active = this.activeJobs.get(worker);
            if (active) {
              this.activeJobs.delete(worker);
              active.reject(err);
            }
            this.dispatchNext(worker);
          };

          this.workers.push(worker);
          this.idleWorkers.push(worker);
        }
        this.isBrowserWorkerSupported = true;
      } catch (err) {
        console.warn('[WorkerPool] Web Worker instantiation fallback:', err);
        this.isBrowserWorkerSupported = false;
      }
    } else {
      this.isBrowserWorkerSupported = false;
    }
  }

  private handleWorkerDone(worker: Worker, data: WorkerDoneMessage): void {
    const active = this.activeJobs.get(worker);
    this.activeJobs.delete(worker);

    if (active) {
      if (this.cancelledIds.has(active.item.id)) {
        // Discard result of cancelled task
        this.cancelledIds.delete(active.item.id);
        active.resolve({ id: active.item.id, cancelled: true, buffer: active.item.buffer });
      } else {
        active.resolve({ id: data.id, cancelled: false, buffer: data.buffer || active.item.buffer });
      }
    }

    this.dispatchNext(worker);
  }

  private dispatchNext(worker: Worker): void {
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (this.cancelledIds.has(next.item.id)) {
        this.cancelledIds.delete(next.item.id);
        next.resolve({ id: next.item.id, cancelled: true, buffer: next.item.buffer });
        continue;
      }

      this.activeJobs.set(worker, next);
      const msg: WorkerApplyMessage = {
        type: 'apply',
        ...next.item,
      };

      if (next.item.isShared) {
        worker.postMessage(msg);
      } else {
        worker.postMessage(msg, [next.item.buffer as ArrayBuffer]);
      }
      return;
    }

    // No pending tasks in queue, worker returns to idle pool
    this.idleWorkers.push(worker);
  }

  /**
   * Run a color adjustment task on the Worker Pool.
   */
  public run(
    task: TaskItem
  ): Promise<{ id: string; cancelled?: boolean; buffer?: ArrayBuffer | SharedArrayBuffer }> {
    return new Promise((resolve, reject) => {
      if (this.cancelledIds.has(task.id)) {
        this.cancelledIds.delete(task.id);
        resolve({ id: task.id, cancelled: true, buffer: task.buffer });
        return;
      }

      // Fallback for non-browser or environments where Web Worker could not initialize
      if (!this.isBrowserWorkerSupported || this.workers.length === 0) {
        try {
          processPixelBuffer(
            task.buffer,
            task.width,
            task.height,
            task.op,
            task.tileX ?? 0,
            task.tileY ?? 0,
            task.tileW ?? task.width,
            task.tileH ?? task.height
          );
          resolve({ id: task.id, buffer: task.buffer });
        } catch (e) {
          reject(e);
        }
        return;
      }

      const queuedTask: QueuedTask = { item: task, resolve, reject };

      if (this.idleWorkers.length > 0) {
        const worker = this.idleWorkers.pop()!;
        this.activeJobs.set(worker, queuedTask);
        const msg: WorkerApplyMessage = {
          type: 'apply',
          ...task,
        };
        if (task.isShared) {
          worker.postMessage(msg);
        } else {
          worker.postMessage(msg, [task.buffer as ArrayBuffer]);
        }
      } else {
        this.queue.push(queuedTask);
      }
    });
  }

  /**
   * For images > 4MP, split into 512x512 tiles and execute in parallel across worker pool.
   */
  public async runTiled(
    task: TaskItem,
    tileSize = 512
  ): Promise<{ id: string; buffer?: ArrayBuffer | SharedArrayBuffer }> {
    const isLarge = task.width * task.height > 4 * 1024 * 1024;
    // Only tile if using SharedArrayBuffer (so workers write concurrently to distinct regions)
    if (!isLarge || !task.isShared) {
      return this.run(task);
    }

    const tilePromises: Promise<any>[] = [];
    const tilesX = Math.ceil(task.width / tileSize);
    const tilesY = Math.ceil(task.height / tileSize);

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const tileX = tx * tileSize;
        const tileY = ty * tileSize;
        const tileW = Math.min(tileSize, task.width - tileX);
        const tileH = Math.min(tileSize, task.height - tileY);

        tilePromises.push(
          this.run({
            ...task,
            id: `${task.id}-tile-${tx}-${ty}`,
            tileX,
            tileY,
            tileW,
            tileH,
          })
        );
      }
    }

    await Promise.all(tilePromises);
    return { id: task.id, buffer: task.buffer };
  }

  /**
   * Cancel an in-flight or queued task by ID.
   */
  public cancel(id: string): void {
    this.cancelledIds.add(id);

    // Filter out of waiting queue immediately
    this.queue = this.queue.filter((q) => {
      if (q.item.id === id || q.item.id.startsWith(`${id}-`)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Cancel all pending tasks.
   */
  public cancelAll(): void {
    this.queue.forEach((q) => this.cancelledIds.add(q.item.id));
    this.queue = [];
  }

  /**
   * Terminate all workers in the pool.
   */
  public destroy(): void {
    this.cancelAll();
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this.idleWorkers = [];
    this.activeJobs.clear();
  }
}

export const workerPool = WorkerPool.getInstance();
