const { app, BrowserWindow, globalShortcut, Menu, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

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
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
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

  // Configure Content Security Policy to permit HTTP & WebSocket traffic to local & production API endpoints
  if (session && session.defaultSession) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:3001 http://localhost:3000 ws://localhost:3001 ws://localhost:3000 https: http:; connect-src 'self' http://localhost:3001 http://localhost:3000 ws://localhost:3001 ws://localhost:3000 https: http:;"
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
    title: 'PAIOS Desktop - Personal AI Operating System',
    frame: true,
    titleBarStyle: 'default',
    autoHideMenuBar: false,
    icon: path.join(__dirname, 'dist', 'favicon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  const distIndex = path.join(__dirname, 'dist', 'index.html');
  
  // Target URLs
  const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:3001';
  const remoteUrl = process.env.PAIOS_REMOTE_URL || config.liveUrl || DEFAULT_LIVE_URL;

  function loadLocalDist() {
    const userDistDir = path.join(app.getPath('userData'), 'current_dist');
    const userDistIndex = path.join(userDistDir, 'index.html');
    const bundledDistIndex = path.join(__dirname, 'dist', 'index.html');

    if (fs.existsSync(userDistIndex) && isValidProductionDist(userDistDir)) {
      console.log('[PAIOS Electron] Loading verified updated distribution from userData:', userDistIndex);
      mainWindow.loadFile(userDistIndex).catch((err) => {
        console.warn('Failed to load updated dist from userData, falling back to bundled:', err);
        if (fs.existsSync(bundledDistIndex)) {
          mainWindow.loadFile(bundledDistIndex);
        }
      });
    } else {
      if (fs.existsSync(userDistDir) && !isValidProductionDist(userDistDir)) {
        console.warn('[PAIOS Electron] Found invalid/uncompiled dist in userData, purging and falling back to bundled assets.');
        fs.rmSync(userDistDir, { recursive: true, force: true });
      }
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
  } else if (remoteUrl && remoteUrl.startsWith('http')) {
    console.log(`Loading PAIOS from Live Sync URL: ${remoteUrl}`);
    mainWindow.loadURL(remoteUrl).catch((err) => {
      console.warn('Failed to load remote live URL, falling back to local files:', err);
      loadLocalDist();
    });
  } else {
    loadLocalDist();
  }

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

// IPC Handlers for In-App Live Sync & Auto-Update Controls
ipcMain.handle('paios:get-version', () => {
  return app.getVersion() || '4.3.0';
});

ipcMain.handle('paios:get-config', () => {
  return loadConfig();
});

ipcMain.handle('paios:set-config', (event, newConfig) => {
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
ipcMain.handle('paios:download-update', async (event, { url, fallbackUrls = [], version }) => {
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
          const client = targetUrl.startsWith('https') ? require('https') : require('http');
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

            const fileStream = fs.createWriteStream(destPath);
            res.pipe(fileStream);

            res.on('data', (chunk) => {
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

// IPC Handler: Apply Windows Desktop Update
ipcMain.handle('paios:apply-update', async (event, { version, filePath }) => {
  const updatesDir = path.join(app.getPath('userData'), 'updates');
  const userDistDir = path.join(app.getPath('userData'), 'current_dist');

  let zipToApply = filePath;
  if (!zipToApply || !fs.existsSync(zipToApply)) {
    if (fs.existsSync(updatesDir)) {
      const files = fs.readdirSync(updatesDir).filter((f) => f.endsWith('.zip'));
      if (files.length > 0) {
        zipToApply = path.join(updatesDir, files[files.length - 1]);
      }
    }
  }

  let extractedSuccessfully = false;

  if (zipToApply && fs.existsSync(zipToApply)) {
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

        const activeManifest = {
          version: version || '4.5.3',
          appliedAt: Date.now(),
          sourcePackage: zipToApply,
        };
        fs.writeFileSync(
          path.join(app.getPath('userData'), 'active_version.json'),
          JSON.stringify(activeManifest, null, 2),
          'utf8'
        );
        extractedSuccessfully = true;
      } else {
        console.warn('[PAIOS Updater] Archive did not contain a valid compiled production web build.');
      }

      // Check if full .exe is present
      const files = fs.readdirSync(tempExtractDir);
      const exeFile = files.find((f) => f.toLowerCase().endsWith('.exe'));
      if (exeFile) {
        const permanentExeDir = path.join(updatesDir, 'latest_app');
        if (!fs.existsSync(permanentExeDir)) {
          fs.mkdirSync(permanentExeDir, { recursive: true });
        }
        fs.cpSync(tempExtractDir, permanentExeDir, { recursive: true, force: true });
        require('electron').shell.showItemInFolder(path.join(permanentExeDir, exeFile));
      }
    } catch (err) {
      console.error('[PAIOS Updater] Error during extraction and live asset update:', err);
    }
  }

  // Reload window with verified assets
  const updatedIndexHtml = path.join(userDistDir, 'index.html');
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.webContents?.session) {
      await mainWindow.webContents.session.clearCache();
    }
    if (fs.existsSync(updatedIndexHtml) && isValidProductionDist(userDistDir)) {
      console.log('[PAIOS Updater] Live reloading with updated assets from:', updatedIndexHtml);
      await mainWindow.loadFile(updatedIndexHtml);
      return { success: true, updated: true };
    } else {
      console.log('[PAIOS Updater] Reloading with standard bundled distribution...');
      const bundledDistIndex = path.join(__dirname, 'dist', 'index.html');
      if (fs.existsSync(bundledDistIndex)) {
        await mainWindow.loadFile(bundledDistIndex);
      } else {
        mainWindow.reload();
      }
      return { success: true, updated: false };
    }
  }

  return { success: true, updated: extractedSuccessfully };
});

// IPC Handler: Open External Browser Link
ipcMain.handle('paios:open-external', async (event, targetUrl) => {
  if (targetUrl) {
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
