const { app, BrowserWindow, dialog, protocol, net, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let backendProcess;

const isDev = !app.isPackaged;

// 1. Register Secure Protocol
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

function startBackend() {
  const isPackaged = app.isPackaged;
  const serverPath = isPackaged
    ? path.join(process.resourcesPath, 'backend', 'index.js')
    : path.resolve(__dirname, '..', 'src', 'backend', 'server.js');

  const cwd = isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');

  const { utilityProcess } = require('electron');
  backendProcess = utilityProcess.fork(serverPath, [], {
    cwd: cwd,
    env: { ...process.env, PORT: '5000' },
    stdio: 'pipe'
  });
}

function waitForBackend(callback) {
  const req = http.get('http://localhost:5000/api/db-status', () => callback());
  req.on('error', () => setTimeout(() => waitForBackend(callback), 1000));
  req.end();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    title: 'ELMS - Employee Leave Management System',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    autoHideMenuBar: true,
    show: false
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:4200');
  } else {
    mainWindow.loadURL('app://index.html');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  // 2. MASTER FIX: Handles MIME types and Loading from Disk
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let filename = url.pathname === '/' ? 'index.html' : url.pathname;
    if (filename.startsWith('/')) filename = filename.substring(1);

    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'app', 'browser');
    const asarPath = path.join(process.resourcesPath, 'app.asar', 'dist', 'app', 'browser');

    let filePath = path.join(unpackedPath, filename);
    if (!fs.existsSync(filePath)) filePath = path.join(asarPath, filename);

    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.svg': 'image/svg+xml'
    };

    try {
      const data = fs.readFileSync(filePath);
      return new Response(data, {
        headers: { 
          'Content-Type': mimeMap[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*' 
        }
      });
    } catch (e) {
      console.error('FAILED TO LOAD:', filePath);
      return new Response('Not Found', { status: 404 });
    }
  });

  startBackend();
  waitForBackend(createWindow);
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC HANDLERS FOR PRINTING (ENHANCED: VIEW BEFORE SAVE) ---
ipcMain.on('print-to-pdf', async (event, { html, filename }) => {
  const previewWin = new BrowserWindow({
    width: 1024,
    height: 800,
    title: 'Report Preview - ELMS',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    autoHideMenuBar: true,
    show: false
  });

  // Inject a Control Bar into the preview HTML
  const styledHtml = `
    <html>
    <head>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
      <style>
        @media print { .no-print { display: none !important; } #print-header { display: none !important; } }
        body { margin: 0 !important; padding: 0 !important; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        #print-header { 
          background: #1e3c72; color: white; padding: 12px 24px; 
          display: flex; justify-content: space-between; align-items: center; 
          position: sticky; top: 0; z-index: 9999; 
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .btn-print { 
          padding: 8px 22px; background: #2ecc71; color: white; border: none; 
          border-radius: 100px; cursor: pointer; font-weight: bold; font-size: 13px; 
          transition: transform 0.1s; display: flex; align-items: center; gap: 8px;
        }
        .btn-close { 
          padding: 8px 22px; background: rgba(255,255,255,0.15); color: white; 
          border: 1px solid rgba(255,255,255,0.3); border-radius: 100px; 
          cursor: pointer; font-size: 13px;
        }
        button:hover { transform: scale(1.05); }
      </style>
    </head>
    <body>
    <div id="print-header" class="no-print">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-weight: bold; background: white; color: #1e3c72; padding: 2px 8px; border-radius: 4px; font-size: 12px;">PREVIEW</span>
        <span style="font-size: 14px; opacity: 0.9;">${filename || 'System Report'}</span>
      </div>
      <div style="display: flex; gap: 10px;">
        <button onclick="window.print()" class="btn-print">
          <i class="bi bi-printer-fill"></i> Print / Save as PDF
        </button>
        <button onclick="window.close()" class="btn-close">
          Close
        </button>
      </div>
    </div>
    ${html}
    </body>
    </html>
  `;
  
  const tempPath = path.join(app.getPath('temp'), `elms_preview_${Date.now()}.html`);
  fs.writeFileSync(tempPath, styledHtml);

  previewWin.loadFile(tempPath);

  previewWin.once('ready-to-show', () => {
    previewWin.show();
    // previewWin.webContents.openDevTools(); // Optional: for debugging
  });

  previewWin.on('closed', () => {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch(e) {}
    }
  });
});
