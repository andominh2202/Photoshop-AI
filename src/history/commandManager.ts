import { Command } from './commands';

export interface HistoryEntry {
  id: string;
  description: string;
  bytes: number;
  status: 'past' | 'current' | 'future';
  index: number;
}

export class CommandManager {
  private static instance: CommandManager;

  public maxSteps = 30;
  public maxBytes = 100 * 1024 * 1024; // 100 MB memory budget

  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners: Set<() => void> = new Set();
  private isExecuting = false;

  public static getInstance(): CommandManager {
    if (!CommandManager.instance) {
      CommandManager.instance = new CommandManager();
    }
    return CommandManager.instance;
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (_) {}
    });
  }

  /**
   * Execute a command and push it onto the undo stack.
   * If the command was already applied optimistically, pass alreadyExecuted = true.
   */
  public async executeCommand(command: Command, alreadyExecuted = false): Promise<void> {
    if (this.isExecuting) return;
    this.isExecuting = true;

    try {
      if (!alreadyExecuted) {
        await command.execute();
      }

      // 1. Invalidate and dispose any branched redo commands (reclaiming tile buffers & VRAM)
      for (const redoneCmd of this.redoStack) {
        try {
          redoneCmd.dispose();
        } catch (e) {
          console.warn('[CommandManager] Error disposing redo command:', e);
        }
      }
      this.redoStack = [];

      // 2. Push onto undo stack
      this.undoStack.push(command);

      // 3. Enforce maximum history steps and memory budget cap
      this.enforceMemoryBudget();
    } finally {
      this.isExecuting = false;
      this.notify();
    }
  }

  /**
   * Revert the most recent command
   */
  public async undo(): Promise<void> {
    if (this.isExecuting || this.undoStack.length === 0) return;
    this.isExecuting = true;

    try {
      const command = this.undoStack.pop()!;
      await command.undo();
      this.redoStack.push(command);
    } finally {
      this.isExecuting = false;
      this.notify();
    }
  }

  /**
   * Reapply the most recently undone command
   */
  public async redo(): Promise<void> {
    if (this.isExecuting || this.redoStack.length === 0) return;
    this.isExecuting = true;

    try {
      const command = this.redoStack.pop()!;
      await command.execute();
      this.undoStack.push(command);
    } finally {
      this.isExecuting = false;
      this.notify();
    }
  }

  /**
   * Jump directly to a given index in the history timeline
   */
  public async jumpToIndex(targetIndex: number): Promise<void> {
    const currentIndex = this.undoStack.length - 1;
    if (targetIndex === currentIndex) return;

    if (targetIndex < currentIndex) {
      const stepsToUndo = currentIndex - targetIndex;
      for (let i = 0; i < stepsToUndo; i++) {
        await this.undo();
      }
    } else {
      const stepsToRedo = targetIndex - currentIndex;
      for (let i = 0; i < stepsToRedo; i++) {
        await this.redo();
      }
    }
  }

  /**
   * Enforce MAX_HISTORY_STEPS (30) and MAX_HISTORY_BYTES (100MB)
   * Disposes evicted commands immediately to free tile buffers into pool and drop VRAM.
   */
  public enforceMemoryBudget(): void {
    while (
      (this.undoStack.length > this.maxSteps || this.getTotalBytes() > this.maxBytes) &&
      this.undoStack.length > 1
    ) {
      const evicted = this.undoStack.shift();
      if (evicted) {
        try {
          evicted.dispose();
        } catch (e) {
          console.warn('[CommandManager] Error disposing evicted command:', e);
        }
      }
    }
  }

  /**
   * Calculate total memory bytes occupied across all stored commands
   */
  public getTotalBytes(): number {
    let total = 0;
    for (const cmd of this.undoStack) {
      total += cmd.estimateBytes();
    }
    for (const cmd of this.redoStack) {
      total += cmd.estimateBytes();
    }
    return total;
  }

  public getUndoCount(): number {
    return this.undoStack.length;
  }

  public getRedoCount(): number {
    return this.redoStack.length;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get formatted timeline for HistoryPanel
   */
  public getHistoryEntries(): HistoryEntry[] {
    const list: HistoryEntry[] = [];
    const currentIndex = this.undoStack.length - 1;

    // Past & current
    this.undoStack.forEach((cmd, idx) => {
      list.push({
        id: cmd.id,
        description: cmd.description,
        bytes: cmd.estimateBytes(),
        status: idx === currentIndex ? 'current' : 'past',
        index: idx,
      });
    });

    // Future (undone commands in redoStack)
    // In redoStack, top item (index length - 1) is next to be redone
    const reversedRedo = [...this.redoStack].reverse();
    reversedRedo.forEach((cmd, idx) => {
      const historyIdx = this.undoStack.length + idx;
      list.push({
        id: cmd.id,
        description: cmd.description,
        bytes: cmd.estimateBytes(),
        status: 'future',
        index: historyIdx,
      });
    });

    return list;
  }

  /**
   * Clear all history stacks and dispose all retained memory
   */
  public clear(): void {
    for (const cmd of this.undoStack) {
      cmd.dispose();
    }
    for (const cmd of this.redoStack) {
      cmd.dispose();
    }
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
}

export const commandManager = CommandManager.getInstance();
