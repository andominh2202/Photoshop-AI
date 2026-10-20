import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { useToastStore, ToastType } from '@/store/toastStore';

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
  error: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
  info: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
};

const borderMap: Record<ToastType, string> = {
  success: 'border-emerald-500/30 bg-emerald-950/80',
  warning: 'border-amber-500/30 bg-amber-950/80',
  error: 'border-rose-500/30 bg-rose-950/80',
  info: 'border-blue-500/30 bg-blue-950/80',
};

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-8 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none select-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl text-xs text-zinc-100 pointer-events-auto transition-all animate-fadeIn ${
            borderMap[toast.type] || borderMap.info
          }`}
        >
          {iconMap[toast.type] || iconMap.info}
          <span className="flex-1 leading-relaxed">{toast.message}</span>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="text-zinc-400 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
            aria-label="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
