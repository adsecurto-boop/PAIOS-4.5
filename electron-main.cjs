const { app, BrowserWindow, globalShortcut, Menu, ipcMain, dialog, session, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

// Configure Windows App User Model ID for native OS toast notifications & taskbar integration
if (process.platform === 'win32') {
  app.setAppUserModelId('com.paios.desktop');
}

let mainWindow;

// User configuration file path for auto-update & live sync
const configPath = path.join(app.getPath('userData'), 'paios-config.json');
const DEFAULT_LIVE_URL = '';

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(data);
      // Ignore legacy paios-4-1 URL from older installations
      if (parsed.liveUrl && parsed.liveUrl.includes('paios-4-1')) {
        parsed.liveUrl = '';
      }
      return parsed;
    }
  } catch (err) {
    console.error('Failed to load paios-config.json:', err);
  }
  return { liveUrl: '', autoUpdateCheck: true };
}

function saveConfig(config) {
  try {
    // The desktop client intentionally loads only its bundled assets.  Do not
    // persist an arbitrary remote page that would run inside Electron.
    const safeConfig = { autoUpdateCheck: config?.autoUpdateCheck !== false, liveUrl: '' };
    fs.writeFileSync(configPath, JSON.stringify(safeConfig, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save paios-config.json:', err);
  }
}

// Helper: Verify if a directory contains a valid compiled production web build
function isValidProductionDist(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return false;
  const indexPath = path.join(dirPath, 'index.html');
  const assetsPath = path.join(dirPath, 'assets');
  if (!fs.existsSync(indexPath) || !fs.existsSync(assetsPath)) return false;

  try {
    const htmlContent = fs.readFileSync(indexPath, 'utf8');
    // Reject development source templates pointing to /src/main.tsx
    if (htmlContent.includes('/src/main.tsx') || htmlContent.includes('src="/src/')) {
      return false;
    }
    // Must contain compiled asset references
    return htmlContent.includes('assets/index-') || htmlContent.includes('./assets/');
  } catch (err) {
    return false;
  }
}

function createWindow() {
  const config = loadConfig();

  // A portable Windows build cannot replace its running executable. The old
  // launcher therefore forwards future starts to the verified staged binary.
  if (app.isPackaged && process.platform === 'win32') {
    try {
      const activeVersionFile = path.join(app.getPath('userData'), 'active_version.json');
      const allowedRoot = fs.realpathSync(path.join(app.getPath('userData'), 'updates'));
      if (fs.existsSync(activeVersionFile)) {
        const active = JSON.parse(fs.readFileSync(activeVersionFile, 'utf8'));
        const staged = active.stagedExecutable;
        if (staged && fs.existsSync(staged) && isSemVerGreaterMain(active.version, app.getVersion())) {
          const resolved = fs.realpathSync(staged);
          const relative = path.relative(allowedRoot, resolved);
          if (!relative.startsWith('..') && !path.isAbsolute(relative) && resolved.toLowerCase() !== process.execPath.toLowerCase()) {
            require('child_process').spawn(resolved, [], { detached: true, stdio: 'ignore' }).unref();
            app.exit(0);
            return;
          }
        }
      }
    } catch (error) {
      console.warn('[PAIOS Updater] Staged launcher validation failed:', error);
    }
  }

  // Configure Content Security Policy to permit HTTP & WebSocket traffic to local & production API endpoints
  if (session && session.defaultSession) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; connect-src 'self' https: http://localhost:3001 http://localhost:3000 ws://localhost:3001 ws://localhost:3000; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:;"
          ]
        }
      });
    });
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'PAIOS',
    frame: true,
    titleBarStyle: 'default',
    autoHideMenuBar: false,
    icon: path.join(__dirname, 'dist', 'favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const distIndex = path.join(__dirname, 'dist', 'index.html');
  
  // Target URLs
  const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:3001';

// Strict SemVer helper for Electron main process
function isSemVerGreaterMain(remote, current) {
  const parse = (v) => {
    if (!v) return [0, 0, 0];
    const cleaned = String(v).trim().replace(/^v/i, '').split('-')[0].split('+')[0];
    const parts = cleaned.split('.').map((p) => {
      const num = parseInt(p, 10);
      return isNaN(num) ? 0 : num;
    });
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
  };
  const [maj1, min1, patch1] = parse(remote);
  const [maj2, min2, patch2] = parse(current);
  if (maj1 !== maj2) return maj1 > maj2;
  if (min1 !== min2) return min1 > min2;
  if (patch1 !== patch2) return patch1 > patch2;
  return false;
}

  function loadLocalDist() {
    const userDistDir = path.join(app.getPath('userData'), 'current_dist');
    const userDistIndex = path.join(userDistDir, 'index.html');
    const bundledDistIndex = path.join(__dirname, 'dist', 'index.html');
    const activeVersionFile = path.join(app.getPath('userData'), 'active_version.json');
    const currentVersion = app.getVersion() || '4.7.1';

    // Development & Unpackaged Guard:
    // When running locally from workspace, ALWAYS prioritize compiled workspace dist.
    // Purge any stale userData dist immediately so local feature upgrades are never masked.
    if (!app.isPackaged || process.env.NODE_ENV === 'development') {
      if (fs.existsSync(userDistDir)) {
        console.log('[PAIOS Electron] Development/Unpackaged mode: purging userData cached dist to protect workspace sources.');
        try {
          fs.rmSync(userDistDir, { recursive: true, force: true });
        } catch (e) {}
      }
      if (fs.existsSync(bundledDistIndex)) {
        mainWindow.loadFile(bundledDistIndex);
      } else {
        console.warn('dist/index.html not found. Run "npm run build" to create production assets.');
      }
      return;
    }

    // Production Packaged Mode:
    // Check if cached userData version is older than or equal to current application version
    let cachedIsStale = false;
    if (fs.existsSync(activeVersionFile)) {
      try {
        const cachedManifest = JSON.parse(fs.readFileSync(activeVersionFile, 'utf8'));
        if (!isSemVerGreaterMain(cachedManifest.version, currentVersion)) {
          console.log(`[PAIOS Electron] Cached version (${cachedManifest.version}) <= bundled version (${currentVersion}), discarding outdated cache.`);
          cachedIsStale = true;
        }
      } catch (e) {
        cachedIsStale = true;
      }
    } else if (fs.existsSync(userDistDir)) {
      cachedIsStale = true;
    }

    if (cachedIsStale && fs.existsSync(userDistDir)) {
      try {
        fs.rmSync(userDistDir, { recursive: true, force: true });
      } catch (e) {}
    }

    if (fs.existsSync(userDistIndex) && isValidProductionDist(userDistDir)) {
      console.log('[PAIOS Electron] Loading verified updated distribution from userData:', userDistIndex);
      mainWindow.loadFile(userDistIndex).catch((err) => {
        console.warn('Failed to load updated dist from userData, falling back to bundled:', err);
        if (fs.existsSync(bundledDistIndex)) {
          mainWindow.loadFile(bundledDistIndex);
        }
      });
    } else {
      if (fs.existsSync(bundledDistIndex)) {
        mainWindow.loadFile(bundledDistIndex);
      } else {
        console.warn('dist/index.html not found. Run "npm run build" to create production assets.');
      }
    }
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(devUrl).catch(() => {
      // If port 3001 failed, attempt port 3000 before falling back to local files
      mainWindow.loadURL('http://localhost:3000').catch(() => {
        loadLocalDist();
      });
    });
  } else {
    loadLocalDist();
  }

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!targetUrl.startsWith('file:')) event.preventDefault();
  });

  // Build application menu with Live Sync & Auto-Update tools
  const template = [
    {
      label: 'PAIOS',
      submenu: [
        {
          label: 'Check for Live Updates (Reload)',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow.reload()
        },
        {
          label: 'Set Live Sync Server URL...',
          click: async () => {
            const current = loadConfig().liveUrl || '';
            const { response, filePath } = await dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Live Sync Configuration',
              message: 'PAIOS Desktop Live Sync',
              detail: `Current Live Sync URL: ${current || 'None (Using local embedded files)'}\n\nTo automatically load git commits without rebuilding the .exe, host your web app on a server (Vercel, GitHub Pages, Cloud Run) and set PAIOS_REMOTE_URL or configure live sync in paios-config.json located at:\n${configPath}`,
              buttons: ['OK', 'Open Config File Location']
            });
            if (response === 1) {
              require('electron').shell.showItemInFolder(configPath);
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Register Global Shortcuts (Ctrl+Shift+P for Quick PAIOS, Ctrl+Shift+R for Live Update Refresh)
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (mainWindow) mainWindow.reload();
  });
}

// IPC Handlers for Desktop Native OS Notifications
ipcMain.on('show-desktop-notification', (event, data) => {
  try {
    const { title, body, message, icon } = data || {};
    if (Notification && Notification.isSupported && Notification.isSupported()) {
      const notifIcon = icon || (fs.existsSync(path.join(__dirname, 'dist', 'favicon.ico')) ? path.join(__dirname, 'dist', 'favicon.ico') : undefined);
      const notif = new Notification({
        title: title || 'PAIOS Desktop',
        body: body || message || '',
        icon: notifIcon,
      });
      notif.show();
    }
  } catch (err) {
    console.error('Failed to show desktop notification:', err);
  }
});

ipcMain.handle('show-desktop-notification', async (event, data) => {
  try {
    const { title, body, message, icon } = data || {};
    if (Notification && Notification.isSupported && Notification.isSupported()) {
      const notifIcon = icon || (fs.existsSync(path.join(__dirname, 'dist', 'favicon.ico')) ? path.join(__dirname, 'dist', 'favicon.ico') : undefined);
      const notif = new Notification({
        title: title || 'PAIOS Desktop',
        body: body || message || '',
        icon: notifIcon,
      });
      notif.show();
      return { success: true };
    }
    return { success: false, reason: 'Notification not supported' };
  } catch (err) {
    console.error('Failed to show desktop notification:', err);
    return { success: false, error: err.message };
  }
});

// IPC Handlers for In-App Live Sync & Auto-Update Controls
ipcMain.handle('paios:get-version', () => {
  return app.getVersion() || '4.7.1';
});

ipcMain.handle('paios:get-config', () => {
  return loadConfig();
});

ipcMain.handle('paios:set-config', (event, newConfig) => {
  if (event.sender !== mainWindow?.webContents) return false;
  saveConfig(newConfig);
  return true;
});

ipcMain.handle('paios:reload', () => {
  if (mainWindow) {
    mainWindow.reload();
    return true;
  }
  return false;
});

// IPC Handler: Download Windows Desktop Update Package
ipcMain.handle('paios:download-update', async (event, { url, fallbackUrls = [], version, sha256 }) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('Untrusted IPC sender');
  if (!/^[a-f0-9]{64}$/i.test(String(sha256 || ''))) {
    throw new Error('Update manifest must include a SHA-256 checksum');
  }
  const updatesDir = path.join(app.getPath('userData'), 'updates');
  if (!fs.existsSync(updatesDir)) {
    fs.mkdirSync(updatesDir, { recursive: true });
  }

  const filename = `PAIOS-Desktop-Windows-v${version || 'latest'}.zip`;
  const destPath = path.join(updatesDir, filename);
  const candidateUrls = [url, ...fallbackUrls].filter(Boolean);

  return new Promise((resolve, reject) => {
    let urlIndex = 0;

    function tryDownloadNext() {
      if (urlIndex >= candidateUrls.length) {
        return reject(new Error('All download endpoints failed'));
      }

      const currentUrl = candidateUrls[urlIndex];
      urlIndex++;

      function fetchWithRedirects(targetUrl) {
        try {
          const parsedUrl = new URL(targetUrl);
          const isSecure = parsedUrl.protocol === 'https:';
          const isLoopback = parsedUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
          if (!isSecure && !isLoopback) return tryDownloadNext();
          const client = require(isSecure ? 'https' : 'http');
          client.get(targetUrl, { headers: { 'User-Agent': 'PAIOS-Desktop-Updater' } }, (res) => {
            // Follow HTTP redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              return fetchWithRedirects(res.headers.location);
            }

            if (res.statusCode !== 200) {
              console.warn(`[Updater] ${targetUrl} returned status ${res.statusCode}, trying fallback...`);
              return tryDownloadNext();
            }

            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let transferredBytes = 0;
            const startTime = Date.now();

            const digest = crypto.createHash('sha256');
            const fileStream = fs.createWriteStream(destPath);
            res.pipe(fileStream);

            res.on('data', (chunk) => {
              digest.update(chunk);
              transferredBytes += chunk.length;
              const elapsedSec = (Date.now() - startTime) / 1000;
              const speed = elapsedSec > 0 ? Math.round(transferredBytes / elapsedSec) : 0;
              const percent = totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : 50;

              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('paios:update-download-progress', {
                  percent,
                  transferredBytes,
                  totalBytes: totalBytes || transferredBytes,
                  speedBytesPerSec: speed,
                  status: 'downloading',
                });
              }
            });

            fileStream.on('finish', () => {
              fileStream.close();
              if (digest.digest('hex').toLowerCase() !== String(sha256).toLowerCase()) {
                fs.unlink(destPath, () => {});
                return tryDownloadNext();
              }
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('paios:update-download-progress', {
                  percent: 100,
                  transferredBytes,
                  totalBytes: transferredBytes,
                  status: 'ready',
                });
              }
              resolve(destPath);
            });

            fileStream.on('error', (err) => {
              fs.unlink(destPath, () => {});
              tryDownloadNext();
            });
          }).on('error', (err) => {
            console.warn(`[Updater] Network error on ${targetUrl}, trying fallback...`, err.message);
            tryDownloadNext();
          });
        } catch (err) {
          tryDownloadNext();
        }
      }

      fetchWithRedirects(currentUrl);
    }

    tryDownloadNext();
  });
});

// Helper: Extract Zip Archive via PowerShell Expand-Archive
function extractZipArchive(zipFilePath, destinationDir) {
  if (!fs.existsSync(destinationDir)) {
    fs.mkdirSync(destinationDir, { recursive: true });
  }
  const { execSync } = require('child_process');
  const safeZip = zipFilePath.replace(/'/g, "''");
  const safeDest = destinationDir.replace(/'/g, "''");
  execSync(`powershell -NoProfile -NonInteractive -Command "Expand-Archive -Path '${safeZip}' -DestinationPath '${safeDest}' -Force"`, {
    stdio: 'ignore',
    windowsHide: true,
  });
}

// Helper: Recursively search folder for a valid compiled production dist
function findDistFolder(dirPath, maxDepth = 5) {
  if (maxDepth <= 0 || !fs.existsSync(dirPath)) return null;
  if (isValidProductionDist(dirPath)) {
    return dirPath;
  }
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory() && item.name !== 'node_modules' && item.name !== '.git') {
        const sub = path.join(dirPath, item.name);
        const found = findDistFolder(sub, maxDepth - 1);
        if (found) return found;
      }
    }
  } catch (err) {}
  return null;
}

function findExecutable(dirPath, maxDepth = 5) {
  if (maxDepth <= 0 || !fs.existsSync(dirPath)) return null;
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const executable = items.find((item) => item.isFile() && item.name.toLowerCase().endsWith('.exe'));
    if (executable) return path.join(dirPath, executable.name);
    for (const item of items) {
      if (item.isDirectory()) {
        const found = findExecutable(path.join(dirPath, item.name), maxDepth - 1);
        if (found) return found;
      }
    }
  } catch (error) {}
  return null;
}

// IPC Handler: Get userData Path
ipcMain.handle('paios:get-user-data-path', async () => {
  return app.getPath('userData');
});

// IPC Handler: Apply Windows Desktop Update
ipcMain.handle('paios:apply-update', async (event, { version, filePath, fileBuffer, gitCommit, sha256 }) => {
  if (event.sender !== mainWindow?.webContents) return { success: false, error: 'Untrusted IPC sender', updated: false };
  // SECURITY & DECOUPLING GUARD:
  // If running in development, or if the app is unpackaged, strictly refuse to apply updates.
  // This prevents any downloaded archive from touching or overwriting local workspace source trees.
  if (!app.isPackaged || process.env.NODE_ENV === 'development') {
    console.warn('[PAIOS Updater] Blocked: Cannot apply binary updates in development or unpackaged workspace mode.');
    return { success: false, error: 'Updater disabled in development/workspace mode', updated: false };
  }

  const currentAppVersion = app.getVersion() || '4.7.1';
  if (!isSemVerGreaterMain(version, currentAppVersion)) {
    console.warn(`[PAIOS Updater] Blocked: Target version (${version}) is not strictly newer than current (${currentAppVersion}).`);
    return { success: false, error: 'Downgrade or duplicate version blocked by SemVer policy', updated: false };
  }
  if (!/^[a-f0-9]{64}$/i.test(String(sha256 || ''))) {
    return { success: false, error: 'Update manifest must include a SHA-256 checksum', updated: false };
  }

  const updatesDir = path.join(app.getPath('userData'), 'updates');
  const userDistDir = path.join(app.getPath('userData'), 'current_dist');

  if (!fs.existsSync(updatesDir)) {
    fs.mkdirSync(updatesDir, { recursive: true });
  }

  let zipToApply = filePath;

  // Handle direct fileBuffer payload from renderer
  if (fileBuffer && (Array.isArray(fileBuffer) || Buffer.isBuffer(fileBuffer))) {
    const rawBuffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
    const targetZip = path.join(updatesDir, `PAIOS-Update-${version || 'latest'}-${Date.now()}.zip`);
    fs.writeFileSync(targetZip, rawBuffer);
    zipToApply = targetZip;
  }

  if (!zipToApply || !fs.existsSync(zipToApply)) {
    if (fs.existsSync(updatesDir)) {
      // Find the most recently modified zip file
      const files = fs.readdirSync(updatesDir).filter((f) => f.endsWith('.zip'));
      if (files.length > 0) {
        const sorted = files
          .map((f) => ({ name: f, time: fs.statSync(path.join(updatesDir, f)).mtimeMs }))
          .sort((a, b) => b.time - a.time);
        zipToApply = path.join(updatesDir, sorted[0].name);
      }
    }
  }

  let extractedSuccessfully = false;
  let stagedExecutable = null;

  if (zipToApply && fs.existsSync(zipToApply)) {
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(zipToApply)).digest('hex');
    if (actualHash.toLowerCase() !== String(sha256).toLowerCase()) {
      return { success: false, error: 'Downloaded update checksum mismatch', updated: false };
    }
    console.log('[PAIOS Updater] Extracting update package:', zipToApply);
    const tempExtractDir = path.join(updatesDir, 'temp_extract');
    if (fs.existsSync(tempExtractDir)) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    }

    try {
      extractZipArchive(zipToApply, tempExtractDir);
      const sourceDistDir = findDistFolder(tempExtractDir);

      if (sourceDistDir && isValidProductionDist(sourceDistDir)) {
        console.log('[PAIOS Updater] Found valid compiled web distribution at:', sourceDistDir);
        if (!fs.existsSync(userDistDir)) {
          fs.mkdirSync(userDistDir, { recursive: true });
        }
        fs.cpSync(sourceDistDir, userDistDir, { recursive: true, force: true });

        extractedSuccessfully = true;
      } else {
        console.warn('[PAIOS Updater] Archive did not contain a valid compiled production web build.');
      }

      // Check if full .exe is present
      const extractedExecutable = findExecutable(tempExtractDir);
      if (extractedExecutable) {
        const permanentExeDir = path.join(updatesDir, 'latest_app');
        if (fs.existsSync(permanentExeDir)) fs.rmSync(permanentExeDir, { recursive: true, force: true });
        fs.mkdirSync(permanentExeDir, { recursive: true });
        fs.cpSync(tempExtractDir, permanentExeDir, { recursive: true, force: true });
        stagedExecutable = findExecutable(permanentExeDir);
      }

      fs.writeFileSync(
        path.join(app.getPath('userData'), 'active_version.json'),
        JSON.stringify({
          version: version || '4.7.1',
          gitCommit: gitCommit || 'latest',
          appliedAt: Date.now(),
          sourcePackage: zipToApply,
          stagedExecutable,
        }, null, 2),
        'utf8'
      );
    } catch (err) {
      console.error('[PAIOS Updater] Error during extraction and live asset update:', err);
    }
  }

  if (!extractedSuccessfully) {
    return { success: false, error: 'The update package did not contain a valid PAIOS application build.', updated: false };
  }

  // Relaunch into the verified staged build. A real process restart releases
  // old renderer resources and makes the update boundary clear to the user.
  const updatedIndexHtml = path.join(userDistDir, 'index.html');
  if (!fs.existsSync(updatedIndexHtml) || !isValidProductionDist(userDistDir)) {
    return { success: false, error: 'Staged update validation failed.', updated: false };
  }
  console.log('[PAIOS Updater] Update staged. Restarting application.');
  if (stagedExecutable && fs.existsSync(stagedExecutable)) {
    require('child_process').spawn(stagedExecutable, [], { detached: true, stdio: 'ignore' }).unref();
    app.exit(0);
    return { success: true, updated: true, restarting: true };
  }
  app.relaunch();
  app.exit(0);
  return { success: true, updated: true, restarting: true };
});

// IPC Handler: Open External Browser Link
ipcMain.handle('paios:open-external', async (event, targetUrl) => {
  if (event.sender !== mainWindow?.webContents) return false;
  if (typeof targetUrl === 'string' && /^https:\/\//i.test(targetUrl)) {
    require('electron').shell.openExternal(targetUrl);
    return true;
  }
  return false;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
