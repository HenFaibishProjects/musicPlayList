const { app, BrowserWindow , Menu } = require('electron');
const path = require('path');


require('./server.js');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
    }
  });

   win.loadURL('http://localhost:3000/playlist.html');
}

const { ipcMain } = require('electron');

ipcMain.on('exit-app', () => {
    app.quit();
});

ipcMain.on('open-about', () => {
    createAboutWindow();
});

function createAboutWindow() {
    const aboutWin = new BrowserWindow({
      width: 400,
      height: 300,
      title: 'About LidaMixPlay',
      autoHideMenuBar: true,
      resizable: false,
      webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
      }
    });

    aboutWin.loadFile(path.join(__dirname, 'about.html'));
}

Menu.setApplicationMenu(null);


app.whenReady().then(() => {
  console.log('Electron ready');
  createWindow();
});