const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let backendProcess;

const isDev = !app.isPackaged;

// ── 1. Start the Node backend server ──────────────────────────────────────────
function startBackend() {
  // In packaged app, backend is in resources/backend/server.js
  const serverPath = isDev
    ? path.join(__dirname, '..', 'src', 'backend', 'server.js')
    : path.join(process.resourcesPath, 'backend', 'server.js');

  const cwd = isDev
    ? path.join(__dirname, '..')
    : process.resourcesPath;

  backendProcess = spawn(process.execPath, [serverPath], {
    cwd: cwd,
    env: { ...process.env, PORT: '5000' },
    stdio: 'ignore',
    detached: false,
  });

  backendProcess.on('error', (err) => {
    dialog.showErrorBox('Backend Error', `Could not start server:\n${err.message}`);
  });
}

// ── 2. Wait until backend is ready ────────────────────────────────────────────
function waitForBackend(retries, callback) {
  const req = http.get('http://localhost:5000/api/active-session', (res) => {
    callback();
  });
  req.on('error', () => {
    if (retries <= 0) { callback(); return; }
    setTimeout(() => waitForBackend(retries - 1, callback), 1000);
  });
  req.end();
}

// ── 3. Create main window ─────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'ELMS - Employee Leave Management System',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    show: false,
  });

  if (isDev) {
    // Dev mode: load Angular dev server
    mainWindow.loadURL('http://localhost:4200');
  } else {
    // Production: load built Angular files
    const indexPath = path.join(__dirname, '..', 'dist', 'elms', 'browser', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  // Show window once ready (avoids white flash)
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── 4. App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startBackend();

  // Wait up to 15s for backend to be ready, then open window
  waitForBackend(15, () => {
    if (isDev) {
      // In dev, also wait for Angular dev server
      const checkFrontend = (retries) => {
        http.get('http://localhost:4200', (res) => {
          createWindow();
        }).on('error', () => {
          if (retries > 0) setTimeout(() => checkFrontend(retries - 1), 1500);
          else createWindow();
        });
      };
      checkFrontend(30);
    } else {
      createWindow();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
