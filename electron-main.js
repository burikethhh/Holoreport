const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

// Single instance lock — prevent multiple copies fighting for ports
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {

// Start the Express server
const { startServer } = require('./server/index');
const sync = require('./server/sync');

let mainWindow;
let serverPort;
let tray = null;

// Show existing window when a second instance is attempted
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    serverPort = await startServer();
  } catch (err) {
    const { dialog } = require('electron');
    dialog.showErrorBox('HoloReport — Startup Error', `Could not start the server:\n${err.message}\n\nThe app will now close.`);
    app.quit();
    return;
  }

  // Start auto-sync (checks every 30s, pushes queue when online)
  const config = sync.getConfig();
  if (config.enabled) {
    sync.startAutoSync(30000);
  }

  // Listen for network changes from the renderer
  // Also do a periodic online check and sync
  setInterval(async () => {
    const conf = sync.getConfig();
    if (conf.enabled && conf.syncUrl) {
      const online = await sync.checkOnline();
      if (online) {
        const queue = sync.loadQueue();
        if (queue.length > 0) {
          const result = await sync.pushSync();
          if (result.pushed > 0) {
            console.log(`[Electron] Network detected — synced ${result.pushed} entries.`);
          }
        }
      }
    }
  }, 30000);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'HoloReport',
    icon: path.join(__dirname, 'public', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  // Minimize to tray instead of closing — keeps sync alive
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // System tray
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'public', 'icon.png'));
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setToolTip('HoloReport — Running in background');

  const trayMenu = Menu.buildFromTemplate([
    {
      label: 'Open HoloReport',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      }
    },
    {
      label: 'Sync Now',
      click: async () => {
        const result = await sync.pushSync();
        console.log('[Tray] Manual sync:', result);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        sync.stopAutoSync();
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(trayMenu);
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on macOS; on Windows keep running via tray
  if (process.platform !== 'darwin' && app.isQuitting) {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  sync.stopAutoSync();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});

} // end single-instance else block
