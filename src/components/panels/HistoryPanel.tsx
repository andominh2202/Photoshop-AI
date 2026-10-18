import React from 'react';
import { History, Undo2, Redo2, RotateCcw } from 'lucide-react';
import { useEditorStore } from '@/store/useEditorStore';

export const HistoryPanel: React.FC = () => {
  const { history, historyIndex, jumpToHistory, undo, redo } = useEditorStore();

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-xs text-zinc-300 select-none border-t border-zinc-800/80">
      {/* History Header */}
      <div className="px-3 py-2 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/30">
        <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
          <History className="w-3.5 h-3.5 text-blue-400" />
          <span>History</span>
          <span className="text-[10px] text-zinc-500 font-mono">({history.length})</span>
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

      {/* History Steps List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-[11px]">
        {history.map((step, index) => {
          const isActive = index === historyIndex;
          const isPast = index <= historyIndex;

          return (
            <div
              key={step.id}
              onClick={() => jumpToHistory(index)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-300 font-medium border-l-2 border-blue-500'
                  : isPast
                  ? 'text-zinc-300 hover:bg-zinc-800/60'
                  : 'text-zinc-600 hover:bg-zinc-900 line-through opacity-60'
              }`}
            >
              <span className="w-4 text-[10px] text-zinc-500 text-right">{index + 1}</span>
              <span className="truncate">{step.actionName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
