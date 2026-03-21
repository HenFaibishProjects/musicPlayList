const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

const SERVER_HOST = 'localhost';
const SERVER_PORT = 3000;
const FRONTEND_URL = `http://${SERVER_HOST}:${SERVER_PORT}/playlist.html`;

let backendStarted = false;
let mainWindow = null;
let aboutWindow = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function getServerPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'server.js')
    : path.join(__dirname, 'server.js');
}

function startBackendServer() {
  if (backendStarted) {
    return true;
  }

  const serverPath = getServerPath();
  console.log(`[MAIN] Starting backend from: ${serverPath}`);

  try {
    require(serverPath);
    backendStarted = true;
    return true;
  } catch (error) {
    console.error('[MAIN] Failed to require backend server:', error);
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pingBackend({ timeoutMs = 1000 } = {}) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: SERVER_HOST,
        port: SERVER_PORT,
        path: '/api/library-structure',
        timeout: timeoutMs
      },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => resolve(false));
  });
}

async function waitForBackendReady({ attempts = 40, intervalMs = 250 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const isReady = await pingBackend();
    if (isReady) {
      console.log(`[MAIN] Backend is reachable (attempt ${attempt}/${attempts})`);
      return true;
    }

    await sleep(intervalMs);
  }

  return false;
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    return mainWindow;
  }

  console.log('CREATE_MAIN_WINDOW');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(FRONTEND_URL);
  return mainWindow;
}

function createStartupErrorWindow(message) {
  const errorWin = new BrowserWindow({
    width: 700,
    height: 460,
    title: 'LidaMixPlay - Startup Error',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const html = `
    <html>
      <body style="font-family: Segoe UI, Arial, sans-serif; padding: 24px; color: #111827; background: #f3f4f6;">
        <h2 style="margin-top: 0; color: #b91c1c;">Backend server failed to start</h2>
        <p>The app could not connect to <b>${FRONTEND_URL}</b>.</p>
        <p>Please check the console logs for <code>SERVER_READY</code> and backend startup errors.</p>
        <pre style="white-space: pre-wrap; background: #fff; border: 1px solid #d1d5db; padding: 12px; border-radius: 8px;">${message || 'No additional details were provided.'}</pre>
      </body>
    </html>
  `;

  errorWin.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
}

ipcMain.on('exit-app', () => {
    app.quit();
});

ipcMain.on('open-about', () => {
    createAboutWindow();
});

function createAboutWindow() {
    if (aboutWindow && !aboutWindow.isDestroyed()) {
      if (aboutWindow.isMinimized()) {
        aboutWindow.restore();
      }
      aboutWindow.focus();
      return aboutWindow;
    }

    console.log('ABOUT_WINDOW_OPENED');

    aboutWindow = new BrowserWindow({
      width: 620,
      height: 800,
      title: 'About LidaMixPlay',
      autoHideMenuBar: true,
      resizable: true,
      minWidth: 520,
      minHeight: 640,
      parent: mainWindow || undefined,
      webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
      }
    });

    aboutWindow.on('closed', () => {
      aboutWindow = null;
    });

    aboutWindow.loadFile(path.join(__dirname, 'about.html'));
    return aboutWindow;
}

Menu.setApplicationMenu(null);

app.on('second-instance', () => {
  console.log('SECOND_INSTANCE_DETECTED');

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else {
    mainWindow.focus();
  }
});


app.whenReady().then(async () => {
  console.log('Electron ready');

  const started = startBackendServer();
  if (!started) {
    createStartupErrorWindow('Unable to require server.js. Verify packaged path and server startup logs.');
    return;
  }

  const backendReady = await waitForBackendReady();
  if (!backendReady) {
    console.error(`[MAIN] Backend not reachable at http://${SERVER_HOST}:${SERVER_PORT}`);
    createStartupErrorWindow(`Backend did not become ready at http://${SERVER_HOST}:${SERVER_PORT}.`);
    return;
  }

  createWindow();
});