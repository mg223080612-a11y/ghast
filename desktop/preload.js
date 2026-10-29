// 게임 화면(game.js)이 프로그램 창의 전체화면을 끄고 켤 수 있게 이 기능 하나만 열어 준다
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ghastApp', {
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
});
