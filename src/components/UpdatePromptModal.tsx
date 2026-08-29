import React, { useState } from 'react';
import {
  RefreshCw,
  Sparkles,
  Zap,
  GitCommit,
  ShieldCheck,
  X,
  ArrowRight,
  Download,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Monitor,
  Globe,
} from 'lucide-react';
import {
  UpdateService,
  VersionManifest,
  DownloadProgress,
  CURRENT_CLIENT_VERSION,
  getRunningPlatform,
} from '../services/UpdateService';

interface UpdatePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverManifest: VersionManifest | null;
}

export const UpdatePromptModal: React.FC<UpdatePromptModalProps> = ({
  isOpen,
  onClose,
  serverManifest,
}) => {
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    percent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    status: 'idle',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadedData, setDownloadedData] = useState<Blob | string | null>(null);

  if (!isOpen || !serverManifest) return null;

  const platform = getRunningPlatform();

  const handleStartDownload = async () => {
    setIsProcessing(true);
    try {
      const data = await UpdateService.downloadUpdate(serverManifest, (progress) => {
        setDownloadProgress(progress);
      });
      setDownloadedData(data);
      if (progressIsReady(downloadProgress.status)) {
        // Automatically proceed if ready
      }
    } catch (err: any) {
      setDownloadProgress({
        percent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        status: 'error',
        error: err?.message || 'Download failed',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInstallNow = async () => {
    setIsProcessing(true);
    try {
      await UpdateService.installUpdate(serverManifest, downloadedData);
      onClose();
    } catch (err) {
      console.error('[UpdatePromptModal] Install update failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelDownload = () => {
    UpdateService.cancelDownload();
    setDownloadProgress({
      percent: 0,
      transferredBytes: 0,
      totalBytes: 0,
      status: 'idle',
    });
    setIsProcessing(false);
  };

  function progressIsReady(status: string) {
    return status === 'ready';
  }

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative overflow-hidden my-auto">
        {/* Ambient Glows */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/30 shrink-0">
              <Zap className="w-7 h-7 text-amber-300 fill-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-extrabold text-lg text-white">PAIOS Update Ready!</h3>
                <span className="text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-600/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> v{serverManifest.version}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                New build with the latest code, fixes, and performance upgrades.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Dismiss Update Prompt"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Badge & Version Details */}
        <div className="bg-slate-950/90 p-4 rounded-2xl border border-slate-800 space-y-3 relative z-10">
          <div className="flex items-center justify-between text-xs font-mono border-b border-slate-800/80 pb-2.5">
            <div>
              <span className="text-slate-400 block text-[10px]">Running Version</span>
              <strong className="text-slate-300 font-bold">v{CURRENT_CLIENT_VERSION.version}</strong>
              <span className="text-slate-500 ml-1">({CURRENT_CLIENT_VERSION.gitCommit})</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="text-right">
              <span className="text-indigo-400 block text-[10px]">Target Version</span>
              <strong className="text-cyan-300 font-bold">v{serverManifest.version}</strong>
              <span className="text-cyan-600 ml-1">({serverManifest.gitCommit})</span>
            </div>
          </div>

          {/* Platform indicator */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">Platform Package:</span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-950/70 border border-indigo-700/50 text-indigo-200 text-[11px] font-mono">
              {platform === 'android' ? (
                <>
                  <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Android APK Package</span>
                </>
              ) : platform === 'electron' ? (
                <>
                  <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Windows Desktop (x64)</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Web App Bundle</span>
                </>
              )}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Release Notes & Improvements
            </span>
            <p className="text-xs text-slate-200 leading-relaxed bg-slate-900 p-2.5 rounded-xl border border-slate-800/80">
              {serverManifest.releaseNotes ||
                'Includes latest Git commit updates, Jenkins parallel pipeline enhancements, and cross-platform synchronization.'}
            </p>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Verified Safe Build
            </span>
            <span className="flex items-center gap-1">
              <GitCommit className="w-3.5 h-3.5 text-cyan-400" />
              {serverManifest.gitCommit}
            </span>
          </div>
        </div>

        {/* Download Progress Bar Section */}
        {downloadProgress.status === 'downloading' && (
          <div className="bg-slate-950 p-4 rounded-2xl border border-indigo-500/30 space-y-2.5 relative z-10 animate-fade-in">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                Downloading Update... {downloadProgress.percent}%
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                {formatBytes(downloadProgress.transferredBytes)} / {formatBytes(downloadProgress.totalBytes)}
              </span>
            </div>

            <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 h-full transition-all duration-300 ease-out"
                style={{ width: `${Math.max(5, downloadProgress.percent)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>Speed: {formatBytes(downloadProgress.speedBytesPerSec || 0)}/s</span>
              <button
                onClick={handleCancelDownload}
                className="text-rose-400 hover:text-rose-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Download Error Notice */}
        {downloadProgress.status === 'error' && (
          <div className="p-3 bg-rose-950/60 border border-rose-600/50 rounded-xl text-xs text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{downloadProgress.error || 'Failed to download update. Please try again.'}</span>
          </div>
        )}

        {/* Ready to Install Notice */}
        {downloadProgress.status === 'ready' && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-600/50 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Update downloaded successfully! Click below to apply and install.
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 relative z-10 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
          >
            Remind Me Later
          </button>

          {downloadProgress.status === 'ready' ? (
            <button
              type="button"
              onClick={handleInstallNow}
              disabled={isProcessing}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/40 transition-all animate-pulse"
            >
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>{platform === 'android' ? 'Install APK Now' : 'Apply & Restart'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartDownload}
              disabled={isProcessing || downloadProgress.status === 'downloading'}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/40 transition-all"
            >
              <Download className="w-4 h-4 text-cyan-300" />
              <span>
                {isProcessing
                  ? 'Connecting...'
                  : platform === 'android'
                  ? 'Download & Install APK'
                  : platform === 'electron'
                  ? 'Download & Apply Update'
                  : 'Download & Apply'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
