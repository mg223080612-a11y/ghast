// =============================================================
// 엑스거너 총 모드 자동 전환 + 연사 자동 OFF (앱 전용 — 웹 버전은 시리얼 장치를 쓸 수 없다)
//   총은 켤 때마다 라이트건(마우스) 모드로 시작한다. 게임은 게임패드(조이스틱) 모드여야 1P·2P 총으로 알아본다.
//   수신기마다 USB 시리얼 포트가 있어서(장치 번호 1209 / 0001 = P1, 0002 = P2), 접시 사격(Unity)과 같은 방법으로 처리한다:
//   포트를 잠깐 열어 총이 켜졌는지 묻고(XQ;), 막 켜졌거나 게임에 게임패드 신호가 안 들어오면 'J'(게임패드 왼쪽 스틱 모드)를 보낸다.
//   - 다른 프로그램이 포트를 쓰고 있으면 건너뛴다 (윈도우는 한 프로그램만 열 수 있음)
//   - 꺼진 총(수신기만 꽂힘)에는 J 를 보내지 않고 '꺼짐'으로 알린다 (먼저 XQ; 로 켜졌는지 묻는다)
//   - 켜진 총인데 3번 바꿔도 게임패드 신호가 안 오면 그만 보내고 '직접 바꾸세요'로 안내한다
//   - 'J' 는 모드만 바꾼다 (반동·보정값은 그대로). 총 전원을 껐다 켜면 다시 마우스 모드
//   연사 자동 OFF (v3.5.1, 설정 '연사 자동 끄기'): 켜진 총에 3초마다 자동 연사 끄기(XA:0;)를 보낸다.
//   2026-11-20 실측: XA:0; 는 단축키(5+스페이스+E)로 켠 연사를 실제로 끄지만 답(XAOK)은 오지 않는다.
//   연사 조회(XLQ;)는 연사를 켜도 늘 'XLV:0,…' 이라 상태를 알 수 없다 → 묻지 않고 그냥 보낸다.
//   (총 위쪽 Rapid Fire 스위치는 이 총에서 연사를 켜지 않았다.) 연사가 ON 인지는 게임이 방아쇠 신호로 알아보고(rapid-detect.js)
//   requestOff 로 바로 OFF 를 부탁한다 → 보낸 뒤 onRapidOff 로 알린다.
//   - J 를 보낸 회차에는 OFF 를 보내지 않는다 (모드가 바뀌는 중이라, 다음 회차에)
// =============================================================
const { SerialPort } = require('serialport');

const VENDOR_ID = '1209';
const PLAYERS = { '0001': 1, '0002': 2 };
const PLAYER_NUMBERS = Object.values(PLAYERS);
const CHECK_MS = 3000;          // 확인 간격
const RETRIES = 3;              // 켜진 총인데 게임패드 신호가 안 보이면 J 를 다시 보내는 최대 횟수
const RETRY_MS = 8000;          // 다시 보내는 간격
const GAMEPAD_MODE = 'J';
const RAPID_OFF = 'XA:0;';      // 자동 연사 끄기 (펌웨어 글: XA:1,n; 켜기 · XA:0; 끄기, 메모리에만 저장돼 총을 끄면 OFF 로 돌아감)
const ALIVE_QUERY = 'XQ;';     // 총이 켜져 있을 때만 'XV…' 로 답한다 (접시 사격 M0 실측)
const ALIVE_WAIT_MS = 800;      // 답을 기다리는 시간
const OFF_MISSES = 2;           // 켜져 있던 총은 이만큼 이어서 답이 없어야 꺼짐으로 본다 (2026-11-20 실측: 2P 가 몇 초마다 꺼짐↔켜짐)
const CHECK_TIMEOUT_MS = 3000;  // 포트 확인 전체 제한 — 수신기 시리얼이 멈추면(앱이 포트를 연 채 강제 종료된 뒤 등) 열기·쓰기가 끝나지 않는다
const STUCK_RETRY_MS = 20000;   // 멈춘 수신기는 이 간격으로만 다시 시도
const OFF_REQUEST_MS = 10000;   // 게임의 OFF 부탁은 이 안에 보냈을 때만 알린다 (수신기가 한동안 바빴다가 한참 뒤 알리지 않게)

const lower = (v) => String(v || '').toLowerCase();
const realPort = (path) => new SerialPort({ path, baudRate: 115200, autoOpen: false });

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
//   rapidOff 이면 (J 를 보내지 않는 회차에) 켜진 총에 연사 OFF(XA:0;)를 보낸다 (답은 오지 않는다)
//   주의: 시리얼 좌표(GT:A…)는 총이 마우스 모드여도 흘러서 모드를 알려 주지 않는다 (2026-11-19 실측).
//   그래서 '게임패드 모드인지'는 게임 쪽에서 그 총의 게임패드 신호가 실제로 들어오는지로 판단한다 (confirmed)
//   결과 { state, rapid }: state 'alive' 켜짐 · 'switched' 켜짐 + J 보냄 · 'off' 꺼짐 · 'busy' 못 엶(다른 프로그램 등)
//   · 'stuck' 3초 안에 안 끝남(수신기 다시 꽂기). rapid: OFF 를 보냈으면 { sent: true }, 아니면 null
//   openPort: 시험에서 가짜 포트를 넣을 때만
function checkPort(path, { sendJ = false, rapidOff = false, openPort = realPort } = {}) {
  return new Promise((resolve) => {
    const port = openPort(path);
    let done = false, timer = null;
    const finish = (state, rapid = null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(limit);
      const result = { state, rapid };
      if (state === 'stuck') { resolve(result); try { if (port.isOpen) port.close(() => {}); } catch { /* 이미 멈춤 */ } return; }
      if (port.isOpen) port.close(() => resolve(result)); else resolve(result);
    };
    const limit = setTimeout(() => finish('stuck'), CHECK_TIMEOUT_MS);
    const send = (cmd, next) => port.write(cmd, (err) => (err ? finish('busy') : port.drain(next)));

    // XQ; 를 보낸 뒤의 XV 만 본다. 답이 쓰기 완료(drain) 알림보다 먼저 와도 놓치지 않게.
    //   수신기는 버튼 상태 줄(GT:A…)을 쉬지 않고 보내 한 번에 1KB 넘게 올 수 있다 → 들어온 조각 전체에서 찾고,
    //   조각 사이에 'X' | 'V' 로 나뉜 경우만 위해 끝 몇 글자를 남긴다 (예전에는 1KB 로 잘라 낸 뒤 찾다가 XV 를 잃었다)
    let asked = false, gotXV = false, tail = '';
    port.on('error', () => finish('busy'));
    port.on('data', (d) => {
      const joined = tail + d.toString('latin1');
      tail = joined.slice(-8);
      if (!asked || gotXV || !joined.includes('XV')) return;
      gotXV = true;
      clearTimeout(timer); timer = null;
      if (sendJ) send(GAMEPAD_MODE, () => finish('switched'));
      else if (rapidOff) send(RAPID_OFF, () => finish('alive', { sent: true }));
      else finish('alive');
    });
    port.open((err) => {
      if (err) { finish('busy'); return; }
      asked = true;
      send(ALIVE_QUERY, () => { if (!gotXV && !done) timer = setTimeout(() => finish('off'), ALIVE_WAIT_MS); });
    });
  });
}

// 켜진 총의 게임패드 모드 확인 상태 → 상태 줄 값
function aliveState(st, confirmed) {
  if (confirmed) return 'ok';
  return st.tries >= RETRIES ? 'mouse' : 'switching';
}

// 3초마다 모든 수신기를 확인한다.
//   isConfirmed(player): 게임 쪽에서 그 총의 게임패드 신호가 들어오고 있는지 (렌더러가 알려 줌)
//   총이 꺼짐 → 켜짐이 되면 바로 J (엑스거너는 켤 때 언제나 마우스 모드), 켜져 있는데 게임패드 신호가 안 보이면 8초마다 다시 (최대 3번)
//   isRapidEnabled(): 설정 '연사 자동 끄기' → 켜진 총에 회차마다 연사 OFF
//   onRapidOff(player): 게임이 연사 ON 을 보고 부탁한(requestOff) 총에 OFF 를 보냈을 때
//   onSwitch(player): J 를 보냈을 때 · onStatus([{ player, state, rapid }]): state = 'ok'|'switching'|'mouse'|'off'|'busy'|'stuck',
//   rapid = 'off' 연사 OFF 를 보내고 있음 · 'disabled' 설정에서 끔 · 없음(총 꺼짐·아직 못 보냄)
//   listPorts·check·intervalMs: 시험에서 바꿔 넣을 때만
//   돌려주는 것: { stop() 멈춤, requestOff(player) 바로 확인해 OFF 를 보내고 알림 }
function startGunModeWatch({
  isEnabled, isConfirmed = () => false, isRapidEnabled = () => false,
  onSwitch = () => {}, onRapidOff = () => {}, onStatus = () => {}, log = () => {},
  listPorts = receiverPorts, check = checkPort, intervalMs = CHECK_MS,
}) {
  const info = new Map();       // player → { alive, tries, lastJ, misses }
  const rapidSent = new Set();  // 켜진 뒤 연사 OFF 를 보낸 적이 있는 자리 (총이 꺼지면 지움)
  const offWanted = new Map();  // 게임이 연사 ON 을 본 자리 → 부탁한 시각. OFF 를 보내면 알린다
  const stuckUntil = new Map(); // path → 멈춘 수신기를 다시 시도할 시각
  let running = false, stopped = false, again = false;
  const rapidStatus = (player, rapidWanted) => {
    if (!rapidWanted) return 'disabled';
    return rapidSent.has(player) ? 'off' : undefined;
  };

  // 수신기 하나 확인 → 상태 줄 한 칸
  const checkOne = async ({ path, player }, now, rapidWanted) => {
    const st = info.get(player) || { alive: false, tries: 0, lastJ: 0, misses: 0 };
    const confirmed = isConfirmed(player);
    if (confirmed) st.tries = 0;
    if ((stuckUntil.get(path) || 0) > now) return { player, state: 'stuck' };
    // 막 켜진 총(꺼짐 → 켜짐, 또는 앱을 막 켬)은 언제나 J. 켜져 있는데 게임패드 신호가 안 보이면 8초마다 다시 (최대 3번)
    const wantJ = isEnabled() && (!st.alive || (!confirmed && st.tries < RETRIES && now - st.lastJ >= RETRY_MS));
    const { state: result, rapid } = await check(path, { sendJ: wantJ, rapidOff: rapidWanted && !wantJ });
    if (result === 'busy') { info.set(player, st); return { player, state: 'busy' }; }
    if (result === 'stuck') {
      stuckUntil.set(path, now + STUCK_RETRY_MS);
      log(`${player}P 수신기 시리얼이 응답하지 않음 — 수신기를 다시 꽂아야 할 수 있음`);
      return { player, state: 'stuck' };
    }
    stuckUntil.delete(path);
    if (result === 'off') {
      const misses = (st.misses || 0) + 1;
      // 켜져 있던 총의 답이 한 번 늦은 것은 꺼짐으로 보지 않는다 (J 를 다시 보내지 않게)
      if (st.alive && misses < OFF_MISSES) {
        info.set(player, { ...st, misses });
        return { player, state: aliveState(st, confirmed), rapid: rapidStatus(player, rapidWanted) };
      }
      // 총 전원을 끄면 연사도 OFF 로 돌아간다 → 다시 켜지면 처음부터
      info.set(player, { alive: false, tries: 0, lastJ: 0, misses: 0 });
      rapidSent.delete(player);
      offWanted.delete(player);
      return { player, state: 'off' };
    }
    st.alive = true;
    st.misses = 0;
    if (result === 'switched') {
      st.tries += 1; st.lastJ = now;
      log(`${player}P 총: 게임패드 신호가 없어 게임패드 모드로 바꿈 (${st.tries}번째)`);
      if (st.tries === 1) onSwitch(player);
    }
    info.set(player, st);
    if (rapid?.sent) {
      rapidSent.add(player);
      const askedAt = offWanted.get(player);
      offWanted.delete(player);
      if (askedAt !== undefined && now - askedAt <= OFF_REQUEST_MS) { log(`${player}P 연사 ON 을 봐서 OFF 보냄`); onRapidOff(player); }
    }
    return { player, state: aliveState(st, confirmed), rapid: rapidStatus(player, rapidWanted) };
  };

  const tick = async () => {
    if (stopped) return;
    if (running) { again = true; return; } // 확인 중에 요청이 오면 끝나자마자 한 번 더
    running = true;
    try {
      const now = Date.now();
      const ports = await listPorts();
      const present = new Set(ports.map((p) => p.player));
      for (const player of [...info.keys()]) if (!present.has(player)) info.delete(player);
      for (const player of [...rapidSent]) if (!present.has(player)) rapidSent.delete(player);
      const rapidWanted = isRapidEnabled();
      if (!rapidWanted) offWanted.clear();
      const status = [];
      for (const port of ports) status.push(await checkOne(port, now, rapidWanted));
      onStatus(status);
    } catch (err) {
      log(`총 모드 확인 실패: ${err.message}`);
    } finally {
      running = false;
      if (again && !stopped) { again = false; setImmediate(tick); }
    }
  };
  const timer = setInterval(tick, intervalMs);
  tick();
  return {
    stop: () => { stopped = true; clearInterval(timer); },
    // 게임이 연사 ON 을 봤을 때: 3초를 기다리지 않고 바로 확인해 OFF 를 보낸다 (설정에서 껐으면 무시)
    requestOff: (player) => {
      if (stopped || !isRapidEnabled() || !PLAYER_NUMBERS.includes(player)) return;
      offWanted.set(player, Date.now());
      tick();
    },
  };
}

module.exports = { startGunModeWatch, receiverPorts, checkPort };
