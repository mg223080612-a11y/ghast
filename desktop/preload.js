// 게임 화면(game.js)에 열어 주는 기능: 프로그램 창 전체화면 끄기/켜기 + 이 버전의 조준점 설정
const { contextBridge, ipcRenderer } = require('electron');
// main.js 가 --ghast-aim=big|hidden 으로 넘겨 준다 (없으면 게임 설정을 그대로 쓴다)
const aimArg = process.argv.find((a) => a.startsWith('--ghast-aim='));
const aimMode = aimArg ? aimArg.slice('--ghast-aim='.length) : null;
contextBridge.exposeInMainWorld('ghastApp', {
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  aimMode: aimMode === 'big' || aimMode === 'hidden' ? aimMode : null,
});
