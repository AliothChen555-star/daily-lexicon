const { app, BrowserWindow, shell, session } = require('electron');
const path = require('node:path');
app.setName('词汇日报');
app.setAppUserModelId('org.dailylexicon.desktop');
if (process.env.DAILY_LEXICON_TEST_PROFILE) app.setPath('userData', path.resolve(process.env.DAILY_LEXICON_TEST_PROFILE));
function createWindow() {
  const win = new BrowserWindow({
    title: '词汇日报', width: 1360, height: 960, minWidth: 760, minHeight: 600,
    backgroundColor: '#F7F7F2', autoHideMenuBar: true, show: !process.env.DAILY_LEXICON_TEST_PROFILE,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === 'https:' && ['github.com','en.wiktionary.org','huggingface.co','www.gnu.org','creativecommons.org'].includes(target.hostname)) shell.openExternal(url);
    } catch {}
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('file://')) event.preventDefault(); });
  win.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: {
    ...details.responseHeaders,
    'Content-Security-Policy': ["default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'"],
  }}));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
