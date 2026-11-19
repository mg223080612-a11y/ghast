// 게임 화면(game.js)에 열어 주는 기능: 프로그램 창 전체화면 끄기/켜기, 앱 버전(처음 화면 구석에 표시)
// (조준점은 게임 안에서 고른다: 처음 화면 버튼·V 키·이름 입력 창·설정)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ghastApp', {
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  version: String(ipcRenderer.sendSync('app-version') || ''),
  // 총 모드 자동 전환: 켜기/끄기 알리기, 전환 신호를 보냈을 때 알림 받기 (desktop/gun-mode.js)
  setGunAutoMode: (on) => ipcRenderer.send('gun-auto-mode', !!on),
  // 게임에 게임패드 신호가 들어오고 있는 자리 [1, 2] (자동 전환이 '게임패드 모드 확인'으로 씀)
  reportGunsConfirmed: (list) => ipcRenderer.send('guns-confirmed', list),
  onGunModeSwitched: (fn) => ipcRenderer.on('gun-mode-switched', (_e, player) => fn(Number(player))),
  // 꽂힌 수신기마다 총 상태 [{ player, state: 'ok'|'switching'|'mouse'|'off'|'busy' }] (3초마다)
  onGunStatus: (fn) => ipcRenderer.on('gun-status', (_e, list) => fn(Array.isArray(list) ? list : [])),
});
