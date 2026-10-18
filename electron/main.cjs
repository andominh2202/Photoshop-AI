const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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

let mainWindow = null;

async function createWindow() {
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
    },
  });

  const distPath = path.join(__dirname, '../dist/index.html');
  const isDev = process.env.NODE_ENV === 'development';

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
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Native Dialog IPC handlers
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
      data: Array.from(fileBuffer),
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
