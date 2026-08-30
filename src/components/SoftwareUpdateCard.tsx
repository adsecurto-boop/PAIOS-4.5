import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Monitor,
  Globe,
  Sparkles,
  GitCommit,
  ShieldCheck,
  Zap,
  ArrowRight,
  Sliders,
  ExternalLink,
  Info,
} from 'lucide-react';
import {
  UpdateService,
  VersionManifest,
  DownloadProgress,
  CURRENT_CLIENT_VERSION,
  getRunningPlatform,
} from '../services/UpdateService';

export const SoftwareUpdateCard: React.FC = () => {
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>('Just now');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [serverManifest, setServerManifest] = useState<VersionManifest | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    percent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    status: 'idle',
  });
  const [downloadedData, setDownloadedData] = useState<Blob | string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [customServerUrl, setCustomServerUrl] = useState('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const platform = getRunningPlatform();

  useEffect(() => {
    handleCheckForUpdates();
  }, []);

  const handleCheckForUpdates = async () => {
    setIsChecking(true);
    setStatusMessage(null);
    try {
      const result = await UpdateService.checkForUpdates(customServerUrl || undefined);
      setUpdateAvailable(result.updateAvailable);
      setServerManifest(result.manifest);
      setLastCheckTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      if (result.updateAvailable) {
        setStatusMessage(
          `New build v${result.manifest.version} (Commit ${result.manifest.gitCommit}) is available on main branch!`
        );
      } else {
        setStatusMessage(`Your PAIOS application is up to date on commit ${result.manifest.gitCommit}.`);
      }
    } catch (err: any) {
      setStatusMessage('Unable to reach update server. Please check your network connection.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!serverManifest) return;
    try {
      const data = await UpdateService.downloadUpdate(serverManifest, (progress) => {
        setDownloadProgress(progress);
      });
      setDownloadedData(data);
    } catch (err: any) {
      setDownloadProgress({
        percent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        status: 'error',
        error: err?.message || 'Download failed across candidate servers',
      });
    }
  };

  const handleApplyUpdate = async () => {
    if (!serverManifest) return;
    setIsInstalling(true);
    try {
      await UpdateService.installUpdate(serverManifest, downloadedData);
    } catch (err) {
      console.error('[SoftwareUpdateCard] Install failed:', err);
    } finally {
      setIsInstalling(false);
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
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-indigo-500/40 rounded-2xl p-5 shadow-xl space-y-4 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-600/25 text-cyan-300 border border-indigo-500/40 shrink-0">
            <Zap className="w-6 h-6 text-amber-300 fill-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading font-bold text-base text-white">
                In-App Software Updates & Releases
              </h3>
              <span className="text-[10px] font-mono bg-indigo-950 text-cyan-300 border border-indigo-800 px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                <Sparkles className="w-3 h-3 text-cyan-400" /> v{CURRENT_CLIENT_VERSION.version}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Live GitHub repository & Jenkins CI/CD automatic build verification and direct package installer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCheckForUpdates}
            disabled={isChecking || downloadProgress.status === 'downloading'}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking GitHub & Jenkins...' : 'Check for Updates'}</span>
          </button>
        </div>
      </div>

      {/* Platform & Version Comparison Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-10">
        {/* Platform Card */}
        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800 shrink-0">
            {platform === 'android' ? (
              <Smartphone className="w-4 h-4 text-cyan-400" />
            ) : platform === 'electron' ? (
              <Monitor className="w-4 h-4 text-indigo-400" />
            ) : (
              <Globe className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 block">Target Runtime</span>
            <strong className="text-xs font-semibold text-white capitalize">
              {platform === 'android'
                ? 'Android APK'
                : platform === 'electron'
                ? 'Windows Desktop'
                : 'Web Browser'}
            </strong>
          </div>
        </div>

        {/* Current Running Build Commit */}
        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800 shrink-0">
            <GitCommit className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 block">Installed Build Commit</span>
            <strong className="text-xs font-mono text-cyan-300 font-bold">
              {(typeof window !== 'undefined' ? localStorage.getItem('paios_active_git_commit') : null) || CURRENT_CLIENT_VERSION.gitCommit}
            </strong>
          </div>
        </div>

        {/* Latest Available Remote Commit */}
        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-400 block">Latest Remote Commit</span>
            <strong className="text-xs font-mono text-emerald-300 font-bold">
              {serverManifest?.gitCommit || CURRENT_CLIENT_VERSION.gitCommit}
            </strong>
          </div>
        </div>
      </div>

      {/* Latest Commit Message & Release Details Banner */}
      {serverManifest && (
        <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 space-y-2 relative z-10 text-xs font-mono">
          <div className="flex items-center justify-between text-slate-400 text-[11px] border-b border-slate-800/80 pb-1.5">
            <span className="flex items-center gap-1.5 text-indigo-300 font-bold">
              <GitCommit className="w-3.5 h-3.5 text-cyan-400" />
              <span>Latest GitHub Commit: {serverManifest.gitCommit}</span>
            </span>
            <span className="text-slate-500">
              {serverManifest.commitDate ? new Date(serverManifest.commitDate).toLocaleDateString() : 'Latest'}
            </span>
          </div>
          <p className="text-white font-semibold text-xs leading-relaxed">
            "{serverManifest.commitTitle || serverManifest.releaseNotes}"
          </p>
          {serverManifest.commitAuthor && (
            <div className="text-[10px] text-slate-400">
              Author: <span className="text-slate-300">{serverManifest.commitAuthor}</span>
            </div>
          )}
        </div>
      )}

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 relative z-10 ${
            updateAvailable
              ? 'bg-amber-950/60 border-amber-500/50 text-amber-200'
              : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {updateAvailable ? (
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{statusMessage}</span>
          </div>

          {updateAvailable && downloadProgress.status === 'idle' && (
            <button
              onClick={handleDownloadUpdate}
              className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-400 hover:from-amber-400 hover:to-orange-300 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-all shrink-0 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {platform === 'android'
                  ? 'Download APK'
                  : platform === 'electron'
                  ? 'Download Windows Update'
                  : 'Download Update'}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Active Downloading Progress Bar */}
      {downloadProgress.status === 'downloading' && (
        <div className="bg-slate-950 p-4 rounded-xl border border-indigo-500/40 space-y-2.5 relative z-10 animate-fade-in">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              Downloading v{serverManifest?.version || '4.5.4'} ({downloadProgress.percent}%)
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
            <span>Transfer Speed: {formatBytes(downloadProgress.speedBytesPerSec || 0)}/s</span>
            <button onClick={handleCancelDownload} className="text-rose-400 hover:text-rose-300">
              Cancel Download
            </button>
          </div>
        </div>
      )}

      {/* Download Error Details */}
      {downloadProgress.status === 'error' && (
        <div className="p-3.5 bg-rose-950/60 border border-rose-600/50 rounded-xl text-xs text-rose-200 flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{downloadProgress.error || 'Download failed.'}</span>
          </div>
          <button
            onClick={handleDownloadUpdate}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* Ready to Install Button */}
      {downloadProgress.status === 'ready' && (
        <div className="p-4 bg-emerald-950/70 border border-emerald-500/50 rounded-xl flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-2.5 text-xs text-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <strong className="block text-white font-semibold">Update Downloaded & Verified!</strong>
              <span>Ready to apply and install on your device.</span>
            </div>
          </div>

          <button
            onClick={handleApplyUpdate}
            disabled={isInstalling}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/40 transition-all flex items-center gap-1.5 animate-pulse"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {platform === 'android'
                ? 'Install APK'
                : platform === 'electron'
                ? 'Restart & Apply'
                : 'Apply & Reload'}
            </span>
          </button>
        </div>
      )}

      {/* Advanced Update Config Accordion Toggle */}
      <div className="pt-1 border-t border-slate-800/60 relative z-10">
        <button
          onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1.5 font-medium transition-colors"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>{showAdvancedSettings ? 'Hide Update Server Settings' : 'Custom Update Server & Settings'}</span>
        </button>

        {showAdvancedSettings && (
          <div className="mt-3 bg-slate-950/90 p-3.5 rounded-xl border border-slate-800/80 space-y-3 animate-fade-in">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Custom Manifest / Server URL (Optional)
              </label>
              <input
                type="text"
                value={customServerUrl}
                onChange={(e) => setCustomServerUrl(e.target.value)}
                placeholder="https://raw.githubusercontent.com/adsecurto-boop/PAIOS-4.5/main/public/version.json"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Leave empty to automatically query GitHub Raw, Atom Feeds, Jenkins, and Local backend.
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-300">Auto-check for updates on startup</span>
              <input
                type="checkbox"
                checked={autoUpdateEnabled}
                onChange={(e) => setAutoUpdateEnabled(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded bg-slate-900 border-slate-700"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
