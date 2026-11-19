// =============================================================
// 엑스거너 총 모드 자동 전환 + 연사 자동 끄기 (앱 전용 — 웹 버전은 시리얼 장치를 쓸 수 없다)
//   총은 켤 때마다 라이트건(마우스) 모드로 시작한다. 게임은 게임패드(조이스틱) 모드여야 1P·2P 총으로 알아본다.
//   수신기마다 USB 시리얼 포트가 있어서(장치 번호 1209 / 0001 = P1, 0002 = P2), 접시 사격(Unity)과 같은 방법으로 처리한다:
//   포트를 잠깐 열어 총이 켜졌는지 묻고(XQ;), 막 켜졌거나 게임에 게임패드 신호가 안 들어오면 'J'(게임패드 왼쪽 스틱 모드)를 보낸다.
//   - 다른 프로그램이 포트를 쓰고 있으면 건너뛴다 (윈도우는 한 프로그램만 열 수 있음)
//   - 꺼진 총(수신기만 꽂힘)에는 J 를 보내지 않고 '꺼짐'으로 알린다 (먼저 XQ; 로 켜졌는지 묻는다)
//   - 켜진 총인데 3번 바꿔도 게임패드 신호가 안 오면 그만 보내고 '직접 바꾸세요'로 안내한다
//   - 'J' 는 모드만 바꾼다 (반동·보정값은 그대로). 총 전원을 껐다 켜면 다시 마우스 모드
//   연사 자동 끄기 (v3.5.0, 설정에서 끌 수 있음): 켜진 총에 연사 설정을 묻고(XLQ;) 자동 연사 끄기(XA:0;)를 보낸 뒤
//   답(XAOK)으로 꺼진 것을 확인한다 (desktop/rapid-fire.js). 선수가 총 단축키로 다시 켜도 3초 안에 다시 끈다.
//   - J 를 보낸 회차에는 연사 명령을 보내지 않는다 (모드가 바뀌는 중이라 답이 섞일 수 있어서, 다음 회차에)
//   - 두 명령 다 답이 없는 총(펌웨어가 모르는 명령)은 30초 동안 다시 묻지 않는다 (3초 확인이 느려지지 않게)
// =============================================================
const { SerialPort } = require('serialport');
const { RAPID_QUERY, RAPID_OFF, readRapidState, readRapidAck, rapidVerdict } = require('./rapid-fire');

const VENDOR_ID = '1209';
const PLAYERS = { '0001': 1, '0002': 2 };
const CHECK_MS = 3000;          // 확인 간격
const RETRIES = 3;              // 켜진 총인데 게임패드 신호가 안 보이면 J 를 다시 보내는 최대 횟수
const RETRY_MS = 8000;          // 다시 보내는 간격
const GAMEPAD_MODE = 'J';
const ALIVE_QUERY = 'XQ;';     // 총이 켜져 있을 때만 'XV…' 로 답한다 (접시 사격 M0 실측)
const ALIVE_WAIT_MS = 800;      // 답을 기다리는 시간
const RAPID_WAIT_MS = 400;      // 연사 명령마다 답을 기다리는 시간 (XQ; 800ms 와 합쳐도 아래 3초 제한 안)
const RAPID_RETRY_MS = 30000;   // 연사 명령에 답하지 않는 총은 이 간격으로만 다시 묻는다
const RAPID_NOTICE_MS = 30000;  // '연사를 껐어요' 알림은 같은 총에 이 간격으로 한 번까지
const CHECK_TIMEOUT_MS = 3000;  // 포트 확인 전체 제한 — 수신기 시리얼이 멈추면(앱이 포트를 연 채 강제 종료된 뒤 등) 열기·쓰기가 끝나지 않는다
const STUCK_RETRY_MS = 20000;   // 멈춘 수신기는 이 간격으로만 다시 시도

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
//   rapidOff 이면 (J 를 보내지 않는 회차에) 켜진 총의 연사를 묻고 끈다: XLQ; → XA:0; → XAOK 확인
//   주의: 시리얼 좌표(GT:A…)는 총이 마우스 모드여도 흘러서 모드를 알려 주지 않는다 (2026-11-19 실측).
//   그래서 '게임패드 모드인지'는 게임 쪽에서 그 총의 게임패드 신호가 실제로 들어오는지로 판단한다 (confirmed)
//   결과 { state, rapid }: state 'alive' 켜짐 · 'switched' 켜짐 + J 보냄 · 'off' 꺼짐 · 'busy' 못 엶(다른 프로그램 등)
//   · 'stuck' 3초 안에 안 끝남(수신기 다시 꽂기). rapid: 연사를 물었으면 { state, turnedOff, raw }, 아니면 null
//   openPort: 시험에서 가짜 포트를 넣을 때만
function checkPort(path, { sendJ = false, rapidOff = false, openPort = realPort } = {}) {
  return new Promise((resolve) => {
    const port = openPort(path);
    let done = false, timer = null, buf = '';
    let phase = 'alive';        // 'alive' XV 기다림 → 'query' XLV 기다림 → 'off' XAOK 기다림
    let rapidBefore = null;
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
    const waitFor = (forPhase, onTimeout, ms) => () => { if (phase === forPhase && !done) timer = setTimeout(onTimeout, ms); };

    // 연사: 지금 상태를 묻고(XLQ;) → 끄고(XA:0;) → 답으로 결과를 정한다. 각 답은 줄이 다 오면 바로, 아니면 기다린 만큼 읽는다
    const offDone = (final) => {
      if (phase !== 'off' || done) return;
      clearTimeout(timer);
      const ack = readRapidAck(buf, { final });
      const raw = [rapidBefore?.raw, ack?.raw].filter(Boolean).join(' ');
      finish('alive', { ...rapidVerdict(rapidBefore, ack), raw });
    };
    const queryDone = (final) => {
      if (phase !== 'query' || done) return;
      clearTimeout(timer);
      rapidBefore = readRapidState(buf, { final });
      // 이미 꺼져 있으면 끄기를 보내지 않는다 (경기 내내 3초마다 무선 통신을 늘리지 않게). 켜짐·답 없음일 때만 XA:0;
      if (rapidBefore && !rapidBefore.on) { finish('alive', { ...rapidVerdict(rapidBefore, null), raw: rapidBefore.raw }); return; }
      phase = 'off';
      buf = '';
      send(RAPID_OFF, waitFor('off', () => offDone(true), RAPID_WAIT_MS));
    };
    const askRapid = () => {
      phase = 'query';
      buf = '';
      send(RAPID_QUERY, waitFor('query', () => queryDone(true), RAPID_WAIT_MS));
    };

    // XQ; 를 보낸 뒤의 XV 만 본다. 답이 쓰기 완료(drain) 알림보다 먼저 와도 놓치지 않게 (예전에는 꺼짐으로 잘못 봤다)
    let asked = false, gotXV = false;
    port.on('error', () => finish('busy'));
    port.on('data', (d) => {
      buf = (buf + d.toString('latin1')).slice(-1024);
      if (phase === 'alive' && asked && !gotXV && buf.includes('XV')) {
        gotXV = true;
        clearTimeout(timer); timer = null;
        if (sendJ) send(GAMEPAD_MODE, () => finish('switched'));
        else if (rapidOff) askRapid();
        else finish('alive');
      } else if (phase === 'query' && readRapidState(buf)) queryDone(false);
      else if (phase === 'off' && readRapidAck(buf)) offDone(false);
    });
    port.open((err) => {
      if (err) { finish('busy'); return; }
      asked = true;
      send(ALIVE_QUERY, () => { if (!gotXV && !done) timer = setTimeout(() => finish('off'), ALIVE_WAIT_MS); });
    });
  });
}

// 3초마다 모든 수신기를 확인한다.
//   isConfirmed(player): 게임 쪽에서 그 총의 게임패드 신호가 들어오고 있는지 (렌더러가 알려 줌)
//   총이 꺼짐 → 켜짐이 되면 바로 J (엑스거너는 켤 때 언제나 마우스 모드), 켜져 있는데 게임패드 신호가 안 보이면 8초마다 다시 (최대 3번)
//   isRapidEnabled(): 설정 '연사 자동 끄기'. onRapidOff(player): 켜져 있던 연사를 껐을 때
//   onSwitch(player): J 를 보냈을 때 · onStatus([{ player, state, rapid }]): state = 'ok'|'switching'|'mouse'|'off'|'busy'|'stuck',
//   rapid = 'off' 꺼짐 확인 · 'on' 켜져 있는데 끄지 못함 · 'noReply' 확인 불가 · 'disabled' 설정에서 끔 · 없음(총 꺼짐 등 모름)
//   listPorts·check·intervalMs: 시험에서 바꿔 넣을 때만
function startGunModeWatch({
  isEnabled, isConfirmed = () => false, isRapidEnabled = () => false,
  onSwitch = () => {}, onRapidOff = () => {}, onStatus = () => {}, log = () => {},
  listPorts = receiverPorts, check = checkPort, intervalMs = CHECK_MS,
}) {
  const info = new Map();     // player → { alive, tries, lastJ }
  const rapidInfo = new Map(); // player → { state, raw, skipUntil } 마지막 연사 점검 결과
  const stuckUntil = new Map(); // path → 멈춘 수신기를 다시 시도할 시각
  let running = false, stopped = false;
  // 이번 연사 점검 결과를 정리해 상태 줄 값으로 (답이 바뀌면 원문을 기록, 켜진 것을 껐으면 알림)
  //   알림은 같은 총에 30초에 한 번 (응답 해석이 틀려 매번 '켜짐 → 끔' 으로 보여도 화면이 시끄럽지 않게),
  //   끈 뒤에도 연달아 세 번 다시 켜짐으로 보이면 해석이 의심스럽다고 한 번 기록한다 (실제 총 확인용)
  const noteRapid = (player, rapid, now) => {
    const prev = rapidInfo.get(player) || {};
    if (!rapid) return prev.state; // 이번에는 묻지 않음 (J 보낸 회차·건너뛰는 중) → 마지막 결과
    if (rapid.raw !== prev.raw || rapid.state !== prev.state) log(`${player}P 연사 점검: ${rapid.state} (응답 ${rapid.raw || '없음'})`);
    const streak = rapid.turnedOff ? (prev.streak || 0) + 1 : 0;
    let noticeAt = prev.noticeAt ?? -Infinity;
    if (rapid.turnedOff && now - noticeAt >= RAPID_NOTICE_MS) {
      noticeAt = now;
      log(`${player}P 총 연사가 켜져 있어 끔`);
      onRapidOff(player);
    }
    if (streak === 3) log(`${player}P 연사 해석 의심: 끈 뒤에도 매번 다시 켜짐으로 보임 (응답 ${rapid.raw})`);
    rapidInfo.set(player, { state: rapid.state, raw: rapid.raw, streak, noticeAt, skipUntil: rapid.state === 'noReply' ? now + RAPID_RETRY_MS : 0 });
    return rapid.state;
  };
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const now = Date.now();
      const ports = await listPorts();
      const present = new Set(ports.map((p) => p.player));
      for (const player of [...info.keys()]) if (!present.has(player)) info.delete(player);
      for (const player of [...rapidInfo.keys()]) if (!present.has(player)) rapidInfo.delete(player);
      const rapidWanted = isRapidEnabled();
      const status = [];
      for (const { path, player } of ports) {
        const st = info.get(player) || { alive: false, tries: 0, lastJ: 0 };
        const confirmed = isConfirmed(player);
        if (confirmed) st.tries = 0;
        // 막 켜진 총(꺼짐 → 켜짐, 또는 앱을 막 켬)은 언제나 J. 켜져 있는데 게임패드 신호가 안 보이면 8초마다 다시 (최대 3번)
        if ((stuckUntil.get(path) || 0) > now) { status.push({ player, state: 'stuck' }); continue; }
        const wantJ = isEnabled() && (!st.alive || (!confirmed && st.tries < RETRIES && now - st.lastJ >= RETRY_MS));
        const askRapid = rapidWanted && !wantJ && !((rapidInfo.get(player)?.skipUntil || 0) > now);
        const { state: result, rapid } = await check(path, { sendJ: wantJ, rapidOff: askRapid });
        if (result === 'busy') { status.push({ player, state: 'busy' }); info.set(player, st); continue; }
        if (result === 'stuck') {
          stuckUntil.set(path, now + STUCK_RETRY_MS);
          log(`${player}P 수신기 시리얼이 응답하지 않음 — 수신기를 다시 꽂아야 할 수 있음`);
          status.push({ player, state: 'stuck' });
          continue;
        }
        stuckUntil.delete(path);
        if (result === 'off') {
          // 총 전원을 끄면 연사도 꺼짐으로 돌아간다 → 다시 켜지면 처음부터 다시 묻는다
          info.set(player, { alive: false, tries: 0, lastJ: 0 });
          rapidInfo.delete(player);
          status.push({ player, state: 'off' });
          continue;
        }
        st.alive = true;
        if (result === 'switched') {
          st.tries += 1; st.lastJ = now;
          log(`${player}P 총: 게임패드 신호가 없어 게임패드 모드로 바꿈 (${st.tries}번째)`);
          if (st.tries === 1) onSwitch(player);
        }
        info.set(player, st);
        const state = confirmed ? 'ok' : st.tries > 0 && st.tries < RETRIES ? 'switching' : st.tries >= RETRIES ? 'mouse' : 'switching';
        status.push({ player, state, rapid: rapidWanted ? noteRapid(player, rapid, now) : 'disabled' });
      }
      onStatus(status);
    } catch (err) {
      log(`총 모드 확인 실패: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  tick();
  return () => { stopped = true; clearInterval(timer); };
}

module.exports = { startGunModeWatch, receiverPorts, checkPort };
