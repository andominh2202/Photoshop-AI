import React, { memo, useRef } from 'react';
import { History, Undo2, Redo2 } from 'lucide-react';
import { useEditorStore } from '@/store/useEditorStore';
import { useVirtualizer } from '@tanstack/react-virtual';

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface HistoryRowProps {
  id: string;
  actionName: string;
  bytes?: number;
  index: number;
  isActive: boolean;
  isPast: boolean;
  onJump: (index: number) => void;
}

const HistoryRow = memo<HistoryRowProps>(({ actionName, bytes, index, isActive, isPast, onJump }) => {
  return (
    <div
      onClick={() => onJump(index)}
      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded cursor-pointer transition-colors h-[28px] ${
        isActive
          ? 'bg-blue-600/20 text-blue-300 font-medium border-l-2 border-blue-500'
          : isPast
          ? 'text-zinc-300 hover:bg-zinc-800/60'
          : 'text-zinc-600 hover:bg-zinc-900 line-through opacity-60'
      }`}
    >
      <div className="flex items-center gap-2 truncate">
        <span className="w-4 text-[10px] text-zinc-500 text-right shrink-0">{index + 1}</span>
        <span className="truncate">{actionName}</span>
      </div>
      {bytes && bytes > 0 ? (
        <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono shrink-0">
          {formatBytes(bytes)}
        </span>
      ) : null}
    </div>
  );
});

export const HistoryPanel: React.FC = memo(() => {
  // Narrow selectors: isolated to history list and pointer
  const history = useEditorStore((s) => s.history);
  const historyIndex = useEditorStore((s) => s.historyIndex);
  const historyBytes = useEditorStore((s) => s.historyBytes);

  // Stable actions
  const jumpToHistory = useEditorStore((s) => s.jumpToHistory);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: history.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 5,
  });

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-xs text-zinc-300 select-none border-t border-zinc-800/80">
      {/* History Header */}
      <div className="px-3 py-2 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/30 shrink-0">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
          <History className="w-3.5 h-3.5 text-blue-400" />
          <span>History</span>
          <span className="text-[10px] text-zinc-500 font-mono">
            ({history.length} {historyBytes > 0 ? `• ${(historyBytes / (1024 * 1024)).toFixed(1)}MB` : ''})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            title="Step Backward (Ctrl+Z)"
            className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
          >
            <Undo2 className="w-3 h-3" />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            title="Step Forward (Ctrl+Y)"
            className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
          >
            <Redo2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Virtualized History Steps List */}
      <div ref={parentRef} className="flex-1 overflow-y-auto p-1.5 font-mono text-[11px]">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const step = history[virtualRow.index];
            if (!step) return null;

            return (
              <div
                key={step.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <HistoryRow
                  id={step.id}
                  actionName={step.actionName}
                  bytes={step.bytes}
                  index={virtualRow.index}
                  isActive={virtualRow.index === historyIndex}
                  isPast={virtualRow.index <= historyIndex}
                  onJump={jumpToHistory}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
