// =============================================================
// 엑스거너 총 모드 자동 전환 (앱 전용 — 웹 버전은 시리얼 장치를 쓸 수 없다)
//   총은 켤 때마다 라이트건(마우스) 모드로 시작한다. 게임은 게임패드(조이스틱) 모드여야 1P·2P 총으로 알아본다.
//   수신기마다 USB 시리얼 포트가 있어서(장치 번호 1209 / 0001 = P1, 0002 = P2), 접시 사격(Unity)과 같은 방법으로 처리한다:
//   포트를 잠깐 열어 총이 켜졌는지 묻고(XQ;), 막 켜졌거나 게임에 게임패드 신호가 안 들어오면 'J'(게임패드 왼쪽 스틱 모드)를 보낸다.
//   - 다른 프로그램이 포트를 쓰고 있으면 건너뛴다 (윈도우는 한 프로그램만 열 수 있음)
//   - 꺼진 총(수신기만 꽂힘)에는 J 를 보내지 않고 '꺼짐'으로 알린다 (먼저 XQ; 로 켜졌는지 묻는다)
//   - 켜진 총인데 3번 바꿔도 게임패드 신호가 안 오면 그만 보내고 '직접 바꾸세요'로 안내한다
//   - 'J' 는 모드만 바꾼다 (반동·보정값은 그대로). 총 전원을 껐다 켜면 다시 마우스 모드
// =============================================================
const { SerialPort } = require('serialport');

const VENDOR_ID = '1209';
const PLAYERS = { '0001': 1, '0002': 2 };
const CHECK_MS = 3000;          // 확인 간격
const RETRIES = 3;              // 켜진 총인데 게임패드 신호가 안 보이면 J 를 다시 보내는 최대 횟수
const RETRY_MS = 8000;          // 다시 보내는 간격
const GAMEPAD_MODE = 'J';
const ALIVE_QUERY = 'XQ;';     // 총이 켜져 있을 때만 'XV…' 로 답한다 (접시 사격 M0 실측)
const ALIVE_WAIT_MS = 800;      // 답을 기다리는 시간

const lower = (v) => String(v || '').toLowerCase();

// 꽂힌 엑스거너 수신기 포트: [{ path, player }]. 맥은 tty. 대신 cu. 로 (열 때 기다리지 않게)
async function receiverPorts() {
  const list = await SerialPort.list();
  return list
    .filter((p) => lower(p.vendorId) === VENDOR_ID && PLAYERS[lower(p.productId).padStart(4, '0')])
    .map((p) => ({ path: p.path.replace('/dev/tty.', '/dev/cu.'), player: PLAYERS[lower(p.productId).padStart(4, '0')] }));
}

// 포트 하나 확인: 총에게 'XQ;'(설정 조회)를 묻는다. 총이 켜져 있을 때만 'XV…' 로 답한다 (접시 사격 GunAliveProbe 와 같음).
//   sendJ 이면 켜진 총에 'J'(게임패드 모드)를 보낸다. 꺼진 총에는 보내지 않는다
//   (꺼진 총에 J 를 보내면 수신기가 좌표를 한 번 0 으로 보내 조준점이 잠깐 구석에 생긴다)
//   주의: 시리얼 좌표(GT:A…)는 총이 마우스 모드여도 흘러서 모드를 알려 주지 않는다 (2026-11-19 실측).
//   그래서 '게임패드 모드인지'는 게임 쪽에서 그 총의 게임패드 신호가 실제로 들어오는지로 판단한다 (confirmed)
//   결과: 'alive' 켜짐 · 'switched' 켜짐 + J 보냄 · 'off' 꺼짐 · 'busy' 못 엶(다른 프로그램 등)
function checkPort(path, sendJ = false) {
  return new Promise((resolve) => {
    const port = new SerialPort({ path, baudRate: 115200, autoOpen: false });
    let done = false, timer = null, text = '';
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (port.isOpen) port.close(() => resolve(result)); else resolve(result);
    };
    const send = (cmd, next) => port.write(cmd, (err) => (err ? finish('busy') : port.drain(next)));
    port.on('error', () => finish('busy'));
    port.on('data', (d) => {
      text = (text + d.toString('latin1')).slice(-1024);
      if (timer && text.includes('XV')) {
        clearTimeout(timer); timer = null;
        if (sendJ) send(GAMEPAD_MODE, () => finish('switched')); else finish('alive');
      }
    });
    port.open((err) => {
      if (err) { finish('busy'); return; }
      send(ALIVE_QUERY, () => { timer = setTimeout(() => finish('off'), ALIVE_WAIT_MS); });
    });
  });
}

// 3초마다 모든 수신기를 확인한다.
//   isConfirmed(player): 게임 쪽에서 그 총의 게임패드 신호가 들어오고 있는지 (렌더러가 알려 줌)
//   총이 꺼짐 → 켜짐이 되면 바로 J (엑스거너는 켤 때 언제나 마우스 모드), 켜져 있는데 게임패드 신호가 안 보이면 8초마다 다시 (최대 3번)
//   onSwitch(player): J 를 보냈을 때 · onStatus([{ player, state }]): state = 'ok'|'switching'|'mouse'|'off'|'busy'
function startGunModeWatch({ isEnabled, isConfirmed = () => false, onSwitch = () => {}, onStatus = () => {}, log = () => {} }) {
  const info = new Map();     // player → { alive, tries, lastJ }
  let running = false, stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const now = Date.now();
      const ports = await receiverPorts();
      const present = new Set(ports.map((p) => p.player));
      for (const player of [...info.keys()]) if (!present.has(player)) info.delete(player);
      const status = [];
      for (const { path, player } of ports) {
        const st = info.get(player) || { alive: false, tries: 0, lastJ: 0 };
        const confirmed = isConfirmed(player);
        if (confirmed) st.tries = 0;
        // 막 켜진 총(꺼짐 → 켜짐, 또는 앱을 막 켬)은 언제나 J. 켜져 있는데 게임패드 신호가 안 보이면 8초마다 다시 (최대 3번)
        const wantJ = isEnabled() && (!st.alive || (!confirmed && st.tries < RETRIES && now - st.lastJ >= RETRY_MS));
        const result = await checkPort(path, wantJ);
        if (result === 'busy') { status.push({ player, state: 'busy' }); info.set(player, st); continue; }
        if (result === 'off') { info.set(player, { alive: false, tries: 0, lastJ: 0 }); status.push({ player, state: 'off' }); continue; }
        st.alive = true;
        if (result === 'switched') {
          st.tries += 1; st.lastJ = now;
          log(`${player}P 총: 게임패드 신호가 없어 게임패드 모드로 바꿈 (${st.tries}번째)`);
          if (st.tries === 1) onSwitch(player);
        }
        info.set(player, st);
        const state = confirmed ? 'ok' : st.tries > 0 && st.tries < RETRIES ? 'switching' : st.tries >= RETRIES ? 'mouse' : 'switching';
        status.push({ player, state });
      }
      onStatus(status);
    } catch (err) {
      log(`총 모드 확인 실패: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, CHECK_MS);
  tick();
  return () => { stopped = true; clearInterval(timer); };
}

module.exports = { startGunModeWatch, receiverPorts, checkPort };
