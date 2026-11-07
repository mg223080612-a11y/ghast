// 게임 화면(game.js)에 열어 주는 기능: 프로그램 창 전체화면 끄기/켜기, 앱 버전(처음 화면 구석에 표시)
// (조준점은 게임 안에서 고른다: 처음 화면 버튼·V 키·이름 입력 창·설정)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ghastApp', {
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  version: String(ipcRenderer.sendSync('app-version') || ''),
});
