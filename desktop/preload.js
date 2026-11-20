// 게임 화면(game.js)에 열어 주는 기능: 프로그램 창 전체화면 끄기/켜기, 앱 버전(처음 화면 구석에 표시)
// (조준점은 게임 안에서 고른다: 처음 화면 버튼·V 키·이름 입력 창·설정)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ghastApp', {
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  version: String(ipcRenderer.sendSync('app-version') || ''),
  // 총 모드 자동 전환: 켜기/끄기 알리기, 전환 신호를 보냈을 때 알림 받기 (desktop/gun-mode.js)
  setGunAutoMode: (on) => ipcRenderer.send('gun-auto-mode', !!on),
  // 게임에 게임패드 신호가 들어오고 있는 자리 [1, 2] (자동 전환이 '게임패드 모드 확인'으로 씀)
  //   live: 지금(몇 초 안) 신호가 들어오는 자리 — 앱은 그 총을 꺼짐으로 보지 않고 모드 전환도 다시 보내지 않는다 (v3.6.0)
  reportGunsConfirmed: (list, live = []) => ipcRenderer.send('guns-confirmed', list, live),
  onGunModeSwitched: (fn) => ipcRenderer.on('gun-mode-switched', (_e, player) => fn(Number(player))),
  // 꽂힌 수신기마다 총 상태 [{ player, state: 'ok'|'switching'|'mouse'|'off'|'busy' }] (3초마다)
  onGunStatus: (fn) => ipcRenderer.on('gun-status', (_e, list) => fn(Array.isArray(list) ? list : [])),
  // 연사 자동 끄기 켜기/끄기 알리기 (v3.5.0~, desktop/gun-mode.js)
  setRapidAutoOff: (on) => ipcRenderer.send('rapid-auto-off', !!on),
  // 게임이 방아쇠 신호로 연사 ON 을 봤을 때 알리기 → 앱이 그 총에 바로 OFF 를 보낸 뒤 onRapidOff 로 알려 준다 (v3.5.1)
  reportRapidOn: (player) => ipcRenderer.send('rapid-seen', Number(player)),
  onRapidOff: (fn) => ipcRenderer.on('gun-rapid-off', (_e, player) => fn(Number(player))),
  // 실기용 기록 파일에 한 줄 (desktop/field-log.js). 이름은 넘기지 않는다
  log: (event, data) => ipcRenderer.send('field-log', String(event), data && typeof data === 'object' ? data : {}),
});
