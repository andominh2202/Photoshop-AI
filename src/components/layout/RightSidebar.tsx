import React, { useState } from 'react';
import { LayerPanel } from '@/components/panels/LayerPanel';
import { AdjustmentsPanel } from '@/components/panels/AdjustmentsPanel';
import { HistoryPanel } from '@/components/panels/HistoryPanel';
import { Layers, History, Sliders } from 'lucide-react';

export const RightSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'layers' | 'history'>('layers');

  return (
    <aside className="w-80 bg-zinc-950 border-l border-zinc-800/80 flex flex-col justify-between select-none z-20">
      {/* Top Tab Bar for Right Panel */}
      <div className="h-8 bg-zinc-900 border-b border-zinc-800 flex items-center px-2 text-xs">
        <button
          onClick={() => setActiveTab('layers')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded font-medium transition cursor-pointer ${
            activeTab === 'layers'
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/80 shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span>Layers</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded font-medium transition cursor-pointer ${
            activeTab === 'history'
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/80 shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <History className="w-3.5 h-3.5 text-purple-400" />
          <span>History</span>
        </button>
      </div>

      {/* Main Tab Body */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'layers' ? <LayerPanel /> : <HistoryPanel />}
      </div>

      {/* Bottom Fixed Adjustments Panel */}
      <div className="shrink-0">
        <AdjustmentsPanel />
      </div>
    </aside>
  );
};
