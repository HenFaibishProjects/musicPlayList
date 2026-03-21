const { app, BrowserWindow } = require('electron');
const path = require('path');


require('./server.js');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
  });

   win.loadURL('http://localhost:3000/playlist.html');
}


app.whenReady().then(() => {
  console.log('Electron ready');
  createWindow();
});