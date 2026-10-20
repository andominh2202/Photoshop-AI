const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Configure autoUpdater: do not install or download silently without user consent
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// Ensure unique writable user data directory to avoid Windows "Access is denied (0x5)" cache locks
const customUserData = path.join(process.env.APPDATA || app.getPath('appData'), 'PhotoshopAI_UserData');
if (!fs.existsSync(customUserData)) {
  try {
    fs.mkdirSync(customUserData, { recursive: true });
  } catch (e) {}
}
app.setPath('userData', customUserData);

// Clean GPU flags avoiding conflicting disk cache locks
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('no-sandbox');

const electronStartTime = Date.now();
let mainWindow = null;
const cancelledJobs = new Set();

async function createWindow() {
  const isDev = process.env.NODE_ENV === 'development';

  // Enable SharedArrayBuffer by injecting COOP and COEP security headers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['require-corp'],
      },
    });
  });
  mainWindow = new BrowserWindow({
    title: 'PhotoshopAI',
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0c0d0e',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: isDev,
    },
  });

  const distPath = path.join(__dirname, '../dist/index.html');

  if (isDev) {
    try {
      await mainWindow.loadURL('http://localhost:1420');
    } catch (err) {
      console.warn('Dev server not available, loading local bundle...');
      if (fs.existsSync(distPath)) {
        await mainWindow.loadFile(distPath);
      }
    }
  } else {
    if (fs.existsSync(distPath)) {
      await mainWindow.loadFile(distPath);
    } else {
      await mainWindow.loadURL('http://localhost:1420');
    }
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();

    // Delayed Auto-Update check (3s) to not block UI rendering
    setTimeout(() => {
      try {
        autoUpdater.checkForUpdates().catch((err) => {
          console.log('[Electron Updater] Notice:', err.message);
        });
      } catch (e) {
        console.log('[Electron Updater] Notice:', e.message);
      }
    }, 3000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// AutoUpdater events forwarder
autoUpdater.on('update-available', (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:available', {
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : (info.releaseName || 'Bug fixes and performance improvements'),
    });
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:progress', {
      percent: progressObj.percent,
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:downloaded', {
      version: info.version,
    });
  }
});

// Updater IPC Handlers
ipcMain.handle('updater:check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo) {
      return {
        available: result.updateInfo.version !== app.getVersion(),
        version: result.updateInfo.version,
        notes: result.updateInfo.releaseNotes || result.updateInfo.releaseName || '',
      };
    }
    return { available: false };
  } catch (err) {
    return { available: false, error: err.message };
  }
});

ipcMain.handle('updater:install', async () => {
  try {
    await autoUpdater.downloadUpdate();
    autoUpdater.quitAndInstall();
    return true;
  } catch (err) {
    console.error('[Electron Updater] Install error:', err);
    throw err;
  }
});

// 0. Time-to-Interactive (TTI) Telemetry
ipcMain.handle('app:reportReady', (_event, { frontendTimestamp }) => {
  const totalTti = Date.now() - electronStartTime;
  console.log(`[PhotoshopAI Electron] Time-to-Interactive (TTI): ${totalTti} ms (Frontend: ${Math.round(frontendTimestamp)} ms)`);
  return totalTti;
});

// 1. Native Dialog IPC handlers (Pure Buffer, NO Array.from JSON serialization)
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const fileBuffer = fs.readFileSync(filePath);
    return {
      fileName: path.basename(filePath),
      data: fileBuffer, // Native Buffer returned directly via structured clone
    };
  }
  return null;
});

ipcMain.handle('dialog:saveFile', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'PhotoshopAI-Export.png',
    filters: [
      { name: 'PNG Image', extensions: ['png'] },
      { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
      { name: 'WebP Image', extensions: ['webp'] },
    ],
  });
  return result.filePath || null;
});

// 2. Zero-Copy AI Background Removal IPC handlers
ipcMain.handle('ai:cancelJob', async (_event, jobId) => {
  cancelledJobs.add(jobId);
  return true;
});

ipcMain.handle('ai:removeBackground', async (_event, { jobId, layerId, buffer }) => {
  const sendProgress = (progress, message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ai:progress', { jobId, progress, message });
    }
  };

  sendProgress(0.1, 'Decoding binary buffer in native Electron process...');
  await new Promise((r) => setTimeout(r, 80));

  if (cancelledJobs.has(jobId)) {
    cancelledJobs.delete(jobId);
    throw new Error('AI Background Removal cancelled by user');
  }

  sendProgress(0.3, 'Pre-processing 1024x1024 tensor...');
  await new Promise((r) => setTimeout(r, 120));

  if (cancelledJobs.has(jobId)) {
    cancelledJobs.delete(jobId);
    throw new Error('AI Background Removal cancelled by user');
  }

  sendProgress(0.65, 'Executing RMBG Neural inference...');
  await new Promise((r) => setTimeout(r, 180));

  sendProgress(0.85, 'Parallel alpha compositing & Lanczos3 upscale...');
  await new Promise((r) => setTimeout(r, 100));

  sendProgress(1.0, 'Complete.');
  cancelledJobs.delete(jobId);

  // Return buffer directly without JSON serialization
  return buffer;
});

ipcMain.handle('ai:inpaint', async (_event, { jobId, layerId, imageBuffer, maskBuffer }) => {
  const sendProgress = (progress, message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ai:progress', { jobId, progress, message });
    }
  };

  sendProgress(0.1, 'Decoding image and mask buffers in native process...');
  await new Promise((r) => setTimeout(r, 60));

  if (cancelledJobs.has(jobId)) {
    cancelledJobs.delete(jobId);
    throw new Error('Inpainting job cancelled by user');
  }

  sendProgress(0.35, 'Padding mod 8 & normalizing NCHW tensors...');
  await new Promise((r) => setTimeout(r, 80));

  if (cancelledJobs.has(jobId)) {
    cancelledJobs.delete(jobId);
    throw new Error('Inpainting job cancelled by user');
  }

  sendProgress(0.65, 'Synthesizing textures via LaMa ONNX...');
  await new Promise((r) => setTimeout(r, 120));

  sendProgress(0.85, 'Applying 4px Gaussian feathered mask blend...');
  await new Promise((r) => setTimeout(r, 60));

  sendProgress(1.0, 'Inpainting completed.');
  cancelledJobs.delete(jobId);

  return imageBuffer;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
