import React, { useState, useEffect } from 'react';
import { Sparkles, Download, X, ChevronDown, ChevronUp, RefreshCw, AlertCircle } from 'lucide-react';
import {
  onUpdateAvailable,
  onDownloadProgress,
  installUpdate,
  checkForUpdates,
  UpdateInfo,
} from '@/platform/api';

export const DISMISSED_UPDATE_KEY = 'photoshopai_dismissed_update';

export const UpdateNotificationBanner: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // 1. Listen for background auto-updater notifications
    const unlistenAvailable = onUpdateAvailable((info) => {
      if (info && info.available && info.version) {
        const dismissed = localStorage.getItem(DISMISSED_UPDATE_KEY);
        if (dismissed !== info.version) {
          setUpdateInfo(info);
        }
      }
    });

    // 2. Listen for download progress updates
    const unlistenProgress = onDownloadProgress((pct) => {
      setIsDownloading(true);
      setDownloadPercent(pct);
    });

    // 3. Initial check on mount
    checkForUpdates()
      .then((info) => {
        if (info && info.available && info.version) {
          const dismissed = localStorage.getItem(DISMISSED_UPDATE_KEY);
          if (dismissed !== info.version) {
            setUpdateInfo(info);
          }
        }
      })
      .catch((err) => {
        console.warn('[UpdateBanner] Check on mount notice:', err);
      });

    return () => {
      unlistenAvailable();
      unlistenProgress();
    };
  }, []);

  if (!updateInfo || !updateInfo.available) {
    return null;
  }

  const handleInstall = async () => {
    setIsDownloading(true);
    setErrorMsg(null);
    try {
      await installUpdate();
    } catch (err: any) {
      setIsDownloading(false);
      setErrorMsg(err?.message || 'Không thể cài đặt bản cập nhật');
    }
  };

  const handleDismiss = () => {
    if (updateInfo?.version) {
      localStorage.setItem(DISMISSED_UPDATE_KEY, updateInfo.version);
    }
    setUpdateInfo(null);
  };

  return (
    <div
      id="update-notification-banner"
      role="alert"
      className="w-full bg-gradient-to-r from-blue-950/95 via-zinc-900/95 to-indigo-950/95 border-b border-blue-500/30 text-zinc-200 text-xs px-3 py-1.5 flex flex-col z-50 shadow-md backdrop-blur-md select-none animate-fadeIn transition-all"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Left: Update info label */}
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0 animate-pulse" />
          <span>
            Phiên bản mới <strong className="text-white font-semibold">{updateInfo.version}</strong>
          </span>
          {updateInfo.notes && (
            <button
              id="btn-toggle-notes"
              type="button"
              onClick={() => setShowNotes(!showNotes)}
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2 ml-1 inline-flex items-center gap-0.5 text-[11px] transition-colors cursor-pointer"
            >
              {showNotes ? 'Ẩn chi tiết' : 'Xem chi tiết'}
              {showNotes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        {/* Center/Right: Actions or Download Progress */}
        <div className="flex items-center gap-2 ml-auto">
          {errorMsg ? (
            <div className="flex items-center gap-1 text-red-400 text-[11px] mr-2">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          {isDownloading ? (
            <div className="flex items-center gap-2 text-[11px] text-blue-300">
              <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
              <span>Đang tải: {Math.round(downloadPercent)}%</span>
            </div>
          ) : (
            <button
              id="btn-install-update"
              type="button"
              onClick={handleInstall}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium px-2.5 py-0.5 rounded text-[11px] flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>Cài đặt và khởi động lại</span>
            </button>
          )}

          {/* Dismiss button */}
          <button
            id="btn-dismiss-update"
            type="button"
            onClick={handleDismiss}
            aria-label="Bỏ qua cập nhật này"
            className="text-zinc-400 hover:text-white hover:bg-zinc-800/60 p-0.5 rounded transition-colors cursor-pointer"
            title="Bỏ qua phiên bản này"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Slim progress bar during download */}
      {isDownloading && (
        <div className="w-full bg-zinc-800/80 rounded-full h-1 overflow-hidden mt-1.5">
          <div
            id="update-download-progress-bar"
            className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full transition-all duration-200"
            style={{ width: `${Math.max(5, Math.min(100, downloadPercent))}%` }}
          />
        </div>
      )}

      {/* Expandable Release Notes */}
      {showNotes && updateInfo.notes && (
        <div
          id="update-notes-container"
          className="mt-1.5 p-2 bg-black/40 rounded border border-zinc-700/50 text-[11px] text-zinc-300 max-h-24 overflow-y-auto whitespace-pre-line"
        >
          {updateInfo.notes}
        </div>
      )}
    </div>
  );
};
