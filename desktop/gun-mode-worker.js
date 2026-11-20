// =============================================================
// 총 모드 자동 전환을 게임과 따로 도는 작은 Node 프로세스에서 돌린다 (desktop/main.js 가 child_process.fork 로 띄움)
//   (Electron utilityProcess 안에서는 시리얼 부품이 포트를 연 뒤 응답을 돌려주지 못해 일반 Node 로 띄운다 — 2026-11-19 실측)
//   시리얼 부품(serialport)에서 처리되지 않은 오류가 나면 프로세스째 멈출 수 있어서(2026-11-19 실측: 두 앱이 같은 포트를
//   동시에 열자 Napi::Error 로 앱 전체가 꺼짐), 게임 창과 분리한다. 이 프로세스가 죽어도 게임은 그대로이고 main 이 다시 띄운다.
//   주고받는 것: main → { type: 'enabled', on } · { type: 'rapid-enabled', on } · { type: 'confirmed', list: [1, 2], live: [1] }
//                       · { type: 'rapid-seen', player } (게임이 연사 ON 을 봄 → 바로 OFF)
//               worker → { type: 'status', list } · { type: 'switch', player } · { type: 'rapid-off', player } · { type: 'log', msg }
// =============================================================
const { startGunModeWatch } = require('./gun-mode');

let enabled = true;
let rapidEnabled = true; // 설정 '연사 자동 끄기' (v3.5.0~)
let confirmed = new Set();
let live = new Set(); // 게임이 지금 신호를 받고 있는 자리 (v3.6.0)
const send = (msg) => { if (process.send) process.send(msg); };
send({ type: 'log', msg: '총 모드 자동 전환 시작' });
process.on('message', (data) => {
  const msg = data || {};
  if (msg.type === 'enabled') enabled = !!msg.on;
  if (msg.type === 'rapid-enabled') rapidEnabled = !!msg.on;
  if (msg.type === 'confirmed' && Array.isArray(msg.list)) {
    confirmed = new Set(msg.list.map(Number));
    live = new Set(Array.isArray(msg.live) ? msg.live.map(Number) : []);
  }
  if (msg.type === 'rapid-seen') watch.requestOff(Number(msg.player));
});

const watch = startGunModeWatch({
  isEnabled: () => enabled,
  isConfirmed: (player) => confirmed.has(player),
  isLive: (player) => live.has(player),
  isRapidEnabled: () => rapidEnabled,
  onSwitch: (player) => send({ type: 'switch', player }),
  onRapidOff: (player) => send({ type: 'rapid-off', player }),
  onStatus: (list) => {
    send({ type: 'status', list });
    // 수신기 시리얼이 멈추면 그 포트를 붙잡은 시스템 작업이 이 프로세스에 남아 쌓인다 → 스스로 끝내고 main 이 20초 뒤 새로 띄운다
    if (list.some((r) => r.state === 'stuck')) {
      send({ type: 'restart-later' });
      setTimeout(() => process.kill(process.pid, 'SIGKILL'), 200);
    }
  },
  log: (msg) => send({ type: 'log', msg }),
});

// 게임(부모)이 꺼지면 같이 끝낸다
process.on('disconnect', () => process.exit(0));
