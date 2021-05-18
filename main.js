const {app, BrowserWindow} = require('electron');

let mainWindow = null;
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus();
    }
  })

  const createMainWindow = () => {
    mainWindow = new BrowserWindow({
      width: 980,
      height: 600,
      minWidth: 980,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: true
        // devTools: false
      }
    });
    // ventanaPrincipal.setMenu(null)
    mainWindow.loadFile('index.html');
    mainWindow.maximize();
  }
  // Create myWindow, load the rest of the app, etc...
  app.whenReady().then(createMainWindow)

  app.on("window-all-closed", () => {
    app.quit();
  });
  
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}
