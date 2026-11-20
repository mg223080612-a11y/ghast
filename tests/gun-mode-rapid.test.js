// 총 모드 자동 전환 + 연사 자동 OFF(desktop/gun-mode.js) 점검 — 실행: npm test
//   진짜 수신기 없이, 명령마다 정해 둔 답을 돌려주는 가짜 시리얼 포트로 '어떤 명령을 어떤 순서로 보내는지' 확인한다.
//   2026-11-20 실측: 연사 조회(XLQ;)는 단축키로 연사를 켜도 늘 'XLV:0,…' 이라 쓸 수 없고, 끄기(XA:0;)는 답(XAOK)이 없지만 실제로 끈다
//   → 켜진 총에는 3초마다 XA:0; 를 그냥 보낸다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkPort, startGunModeWatch } = require('../desktop/gun-mode.js');

const GUN_ON = 'XV:85,30,300,200,0,0,20,1100\r\n';
const GT = 'GT:A40953071NNNNNNZ\r\n'; // 수신기가 쉬지 않고 보내는 버튼 상태 줄 (실측)

// replies: 명령 → 답 (글자 하나 또는 차례로 올 조각 배열, 없으면 답하지 않음). written 에 보낸 명령이 차례로 쌓인다
//   fastReply: 답이 쓰기 완료(drain) 알림보다 먼저 온다 (빠른 수신기)
function fakePortFactory(replies, { fastReply = false } = {}) {
  const written = [];
  class FakePort {
    constructor() { this.handlers = {}; this.isOpen = false; }
    on(ev, fn) { this.handlers[ev] = fn; return this; }
    open(cb) { this.isOpen = true; setImmediate(() => cb(null)); }
    write(data, cb) {
      const cmd = String(data);
      written.push(cmd);
      setImmediate(() => cb(null));
      const reply = replies[cmd];
      if (!reply) return;
      const chunks = Array.isArray(reply) ? reply : [reply];
      const deliver = () => chunks.forEach((c) => this.handlers.data?.(Buffer.from(c, 'latin1')));
      if (fastReply) deliver(); else setTimeout(deliver, 5);
    }
    drain(cb) { setTimeout(() => cb(null), fastReply ? 10 : 0); }
    close(cb) { this.isOpen = false; setImmediate(() => cb && cb(null)); }
  }
  return { openPort: (path) => new FakePort(path), written };
}

test('켜진 총: XQ; 다음에 연사 OFF(XA:0;)를 답을 기다리지 않고 보낸다', async () => {
  const { openPort, written } = fakePortFactory({ 'XQ;': GUN_ON });
  const r = await checkPort('p1', { rapidOff: true, openPort });
  assert.deepEqual(written, ['XQ;', 'XA:0;']);
  assert.deepEqual(r, { state: 'alive', rapid: { sent: true } });
});

test('답이 쓰기 완료 알림보다 먼저 와도 켜짐으로 본다 (빠른 수신기)', async () => {
  const { openPort, written } = fakePortFactory({ 'XQ;': GUN_ON }, { fastReply: true });
  const r = await checkPort('p1', { rapidOff: true, openPort });
  assert.equal(r.state, 'alive');
  assert.deepEqual(written, ['XQ;', 'XA:0;']);
});

test('XV 답 뒤에 버튼 줄이 1KB 넘게 한꺼번에 와도 켜짐으로 본다 (예전에는 잘라 내다 XV 를 잃어 꺼짐으로 봄)', async () => {
  const { openPort } = fakePortFactory({ 'XQ;': GUN_ON + GT.repeat(120) });
  const r = await checkPort('p1', { openPort });
  assert.equal(r.state, 'alive');
});

test('XV 가 두 조각으로 나뉘어 와도 켜짐으로 본다', async () => {
  const { openPort } = fakePortFactory({ 'XQ;': [GT + 'X', 'V:85,30\r\n'] });
  const r = await checkPort('p1', { openPort });
  assert.equal(r.state, 'alive');
});

test('총 모드 전환(J)을 보내는 회차에는 연사 OFF 를 보내지 않는다', async () => {
  const { openPort, written } = fakePortFactory({ 'XQ;': GUN_ON });
  const r = await checkPort('p1', { sendJ: true, rapidOff: true, openPort });
  assert.deepEqual(written, ['XQ;', 'J']);
  assert.deepEqual(r, { state: 'switched', rapid: null });
});

test('연사 자동 끄기를 끄면 XQ; 만 보낸다', async () => {
  const { openPort, written } = fakePortFactory({ 'XQ;': GUN_ON });
  const r = await checkPort('p1', { rapidOff: false, openPort });
  assert.deepEqual(written, ['XQ;']);
  assert.deepEqual(r, { state: 'alive', rapid: null });
});

test('꺼진 총(XQ; 무응답): 연사 OFF 를 보내지 않는다', async () => {
  const { openPort, written } = fakePortFactory({});
  const r = await checkPort('p1', { rapidOff: true, openPort });
  assert.deepEqual(written, ['XQ;']);
  assert.deepEqual(r, { state: 'off', rapid: null });
});

test('게임이 연사를 본 총(offFirst): XA:0; 를 먼저 보내고 XQ; 로 켜짐을 묻는다', async () => {
  const { openPort, written } = fakePortFactory({ 'XQ;': GUN_ON });
  const r = await checkPort('p1', { rapidOff: true, offFirst: true, openPort });
  assert.deepEqual(written, ['XA:0;', 'XQ;']);
  assert.deepEqual(r, { state: 'alive', rapid: { sent: true } });
});

test('offFirst 인데 XQ; 에 답이 없어도 OFF 는 이미 보냈다 (2026-11-20 실측: 2P 가 연사 중 답하지 않아 OFF 가 5초 늦음)', async () => {
  const { openPort, written } = fakePortFactory({});
  const r = await checkPort('p1', { rapidOff: true, offFirst: true, openPort });
  assert.deepEqual(written, ['XA:0;', 'XQ;']);
  assert.deepEqual(r, { state: 'off', rapid: { sent: true } });
});

// 3초 확인(startGunModeWatch). results: 회차마다 check 가 돌려줄 결과 (모자라면 마지막 것)
function watch({ results, ticks = 1, intervalMs = 30, ...opts }) {
  const calls = [], statuses = [], offs = [], logs = [];
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const w = startGunModeWatch({
    isEnabled: () => true,
    isConfirmed: () => true,
    listPorts: async () => [{ path: 'p1', player: 1 }],
    intervalMs,
    check: async (path, o) => { calls.push(o); return results[Math.min(calls.length - 1, results.length - 1)]; },
    onRapidOff: (p) => offs.push(p),
    log: (m) => logs.push(m),
    ...opts,
    onStatus: (list) => { statuses.push(list); if (statuses.length >= ticks) { w.stop(); resolveDone(); } },
  });
  return { w, done, calls, statuses, offs, logs };
}
const ALIVE_SENT = { state: 'alive', rapid: { sent: true } };

test('3초 확인: 연사 OFF 를 보낸 총은 상태 줄 rapid = off', async () => {
  const t = watch({ results: [ALIVE_SENT], ticks: 2, isRapidEnabled: () => true });
  await t.done;
  assert.equal(t.calls[1].rapidOff, true);
  assert.equal(t.statuses[1][0].rapid, 'off');
  assert.deepEqual(t.offs, [], '게임이 연사를 보지 않았으면 OFF 알림은 없다');
});

test('3초 확인: 설정에서 끄면 연사 명령 없이 rapid = disabled', async () => {
  const t = watch({ results: [{ state: 'alive', rapid: null }], ticks: 2, isRapidEnabled: () => false });
  await t.done;
  assert.equal(t.calls[1].rapidOff, false);
  assert.equal(t.statuses[1][0].rapid, 'disabled');
});

test('게임이 연사 ON 을 보면(requestOff) 3초를 기다리지 않고 바로 OFF 를 보내고, 보낸 뒤에 알린다', async () => {
  const t = watch({ results: [ALIVE_SENT], ticks: 2, intervalMs: 60000, isRapidEnabled: () => true });
  await new Promise((r) => setTimeout(r, 20)); // 첫 회차가 끝난 뒤
  assert.deepEqual(t.offs, []);
  t.w.requestOff(1);
  await t.done;
  assert.equal(t.calls.length, 2, '요청하자마자 한 번 더 확인');
  assert.deepEqual(t.offs, [1]);
});

test('J 를 보내는 회차에는 OFF 를 못 보냈으니 알리지 않고 다음 회차에 보낸 뒤 알린다', async () => {
  const t = watch({
    results: [{ state: 'switched', rapid: null }, ALIVE_SENT],
    ticks: 2, isConfirmed: () => false, isRapidEnabled: () => true,
  });
  t.w.requestOff(1);
  await t.done;
  assert.deepEqual(t.offs, [1]);
});

test('연사 자동 끄기가 꺼져 있으면 requestOff 를 무시한다', async () => {
  const t = watch({ results: [{ state: 'alive', rapid: null }], ticks: 2, isRapidEnabled: () => false });
  t.w.requestOff(1);
  await t.done;
  assert.deepEqual(t.offs, []);
});

test('켜진 총의 답이 한 번 늦어도(XQ; 무응답 한 번) 꺼짐으로 보지 않고 J 도 다시 보내지 않는다 (2026-11-20 실측: 2P 가 몇 초마다 깜빡임)', async () => {
  const OFF = { state: 'off', rapid: null };
  const t = watch({ results: [ALIVE_SENT, OFF, ALIVE_SENT, ALIVE_SENT], ticks: 4, isRapidEnabled: () => true });
  await t.done;
  assert.deepEqual(t.statuses.map((s) => s[0].state), ['ok', 'ok', 'ok', 'ok']);
  assert.deepEqual(t.calls.map((o) => o.sendJ), [true, false, false, false], '처음 켜졌을 때만 J');
});

test('두 번 이어서 답이 없으면 꺼짐으로 보고, 다시 켜지면 J 를 보낸다', async () => {
  const OFF = { state: 'off', rapid: null };
  const t = watch({ results: [ALIVE_SENT, OFF, OFF, ALIVE_SENT], ticks: 4, isRapidEnabled: () => true });
  await t.done;
  assert.deepEqual(t.statuses.map((s) => s[0].state), ['ok', 'ok', 'off', 'ok']);
  assert.equal(t.statuses[2][0].rapid, undefined, '꺼진 총은 연사 상태를 모른다');
  assert.deepEqual(t.calls.map((o) => o.sendJ), [true, false, false, true]);
});

test('OFF 부탁 뒤 수신기가 한동안 바빠 10초 넘게 지나서야 보냈으면 알리지 않는다 (한참 뒤 엉뚱한 화면에 OFF 가 뜨지 않게)', async () => {
  const realNow = Date.now;
  let skew = 0;
  Date.now = () => realNow() + skew;
  try {
    const BUSY = { state: 'busy', rapid: null };
    let n = 0;
    const t = watch({
      results: [ALIVE_SENT], ticks: 4, isRapidEnabled: () => true,
      check: async () => {
        n += 1;
        if (n === 2) { skew += 11000; return BUSY; } // 부탁 직후 회차: 바쁨, 그사이 11초 지남
        return ALIVE_SENT;
      },
    });
    await new Promise((r) => setTimeout(r, 10));
    t.w.requestOff(1);
    await t.done;
    assert.deepEqual(t.offs, []);
  } finally {
    Date.now = realNow;
  }
});

test('연사를 본 총은 XQ; 답이 없어도 바로 OFF 를 보내고 알리며, 꺼짐으로 세지 않고 J 도 보내지 않는다', async () => {
  const calls = [];
  const t = watch({
    results: [ALIVE_SENT], ticks: 4, intervalMs: 60000, isRapidEnabled: () => true, isConfirmed: () => true,
    check: async (path, o) => {
      calls.push(o);
      if (o.offFirst) return { state: 'off', rapid: { sent: true } }; // 연사 중이라 XQ; 에 답 없음
      return ALIVE_SENT;
    },
  });
  await new Promise((r) => setTimeout(r, 10));
  t.w.requestOff(1);
  await new Promise((r) => setTimeout(r, 10));
  t.w.requestOff(1);
  await new Promise((r) => setTimeout(r, 10));
  t.w.requestOff(1);
  await t.done;
  assert.deepEqual(calls.map((o) => [o.sendJ, !!o.offFirst]), [[true, false], [false, true], [false, true], [false, true]]);
  assert.deepEqual(t.offs, [1, 1, 1]);
  assert.deepEqual(t.statuses.map((s) => s[0].state), ['ok', 'ok', 'ok', 'ok'], '게임이 신호를 받고 있으니 꺼짐이 아니다');
});

test('연사를 본 총은 게임패드 신호가 안 보이는 회차여도 J 대신 OFF 부터 보낸다', async () => {
  const calls = [];
  const t = watch({
    results: [ALIVE_SENT], ticks: 2, intervalMs: 60000, isRapidEnabled: () => true, isConfirmed: () => false,
    check: async (path, o) => { calls.push(o); return o.sendJ ? { state: 'switched', rapid: null } : ALIVE_SENT; },
  });
  await new Promise((r) => setTimeout(r, 10));
  t.w.requestOff(1);
  await t.done;
  assert.deepEqual(calls.map((o) => [o.sendJ, !!o.offFirst]), [[true, false], [false, true]]);
  assert.deepEqual(t.offs, [1]);
});

test('앱을 연사 도중에 켜서 켜짐을 본 적이 없어도, 연사를 본 총은 꺼짐으로 보이지 않고 J 도 다시 보내지 않는다', async () => {
  const calls = [];
  let first = true;
  const t = watch({
    results: [ALIVE_SENT], ticks: 3, intervalMs: 60, isRapidEnabled: () => true, isConfirmed: () => true,
    check: async (path, o) => {
      calls.push(o);
      if (first) { first = false; return { state: 'off', rapid: null }; } // 연사 중이라 첫 XQ; 에 답 없음
      return o.offFirst ? { state: 'off', rapid: { sent: true } } : ALIVE_SENT;
    },
  });
  await new Promise((r) => setTimeout(r, 15));
  t.w.requestOff(1); // 곧바로 한 번 더 확인 (연사를 본 총), 그다음은 60ms 뒤 보통 회차
  await t.done;
  assert.deepEqual(t.statuses.map((s) => s[0].state), ['off', 'ok', 'ok']);
  assert.deepEqual(calls.map((o) => [o.sendJ, !!o.offFirst]), [[true, false], [false, true], [false, false]], '보통 회차에도 J 를 다시 보내지 않는다');
  assert.deepEqual(t.offs, [1]);
});

// v3.6.0: 게임이 그 총의 신호(조준 위치 변화·방아쇠)를 지금 받고 있으면(isLive) 켜져 있고 게임패드 모드다
//   → XQ; 답이 없어도 꺼짐으로 세지 않고 J 도 보내지 않는다 (11-20 TV 실기: 경기 중 2P 에 J 가 다시 가고 조준점이 가끔 끊김)
test('신호가 들어오고 있는 총은 XQ; 답이 몇 번 없어도 꺼짐으로 보지 않고 J 도 보내지 않는다', async () => {
  const OFF = { state: 'off', rapid: null };
  let asked = 0; // 첫 회차(앱을 막 켬)에는 아직 게임 소식이 없다 → 그다음부터 신호가 들어오는 중
  const t = watch({
    results: [ALIVE_SENT, OFF, OFF, OFF, ALIVE_SENT], ticks: 5, isRapidEnabled: () => true,
    isLive: () => (asked++ > 0),
  });
  await t.done;
  assert.deepEqual(t.statuses.map((s) => s[0].state), ['ok', 'ok', 'ok', 'ok', 'ok']);
  assert.deepEqual(t.calls.map((o) => o.sendJ), [true, false, false, false, false]);
});

test('신호가 끊긴 총은 예전처럼 두 번 이어서 답이 없으면 꺼짐, 다시 켜지면 J', async () => {
  const OFF = { state: 'off', rapid: null };
  const t = watch({ results: [ALIVE_SENT, OFF, OFF, ALIVE_SENT], ticks: 4, isRapidEnabled: () => true, isLive: () => false });
  await t.done;
  assert.deepEqual(t.statuses.map((s) => s[0].state), ['ok', 'ok', 'off', 'ok']);
  assert.deepEqual(t.calls.map((o) => o.sendJ), [true, false, false, true]);
});

test('신호가 들어오는 동안 답이 두 번 넘게 없던 총이, 신호가 끊긴 채 다시 답하면 J 를 보낸다 (전원을 빨리 껐다 켜 마우스 모드가 된 총)', async () => {
  const OFF = { state: 'off', rapid: null };
  let n = 0;
  const liveAt = [false, true, true, false, false]; // 회차마다 신호가 들어오는지
  const t = watch({
    results: [ALIVE_SENT, OFF, OFF, ALIVE_SENT, ALIVE_SENT], ticks: 5, isRapidEnabled: () => true,
    isLive: () => liveAt[Math.min(n++, liveAt.length - 1)],
  });
  await t.done;
  assert.deepEqual(t.calls.map((o) => o.sendJ), [true, false, false, true, false]);
  assert.deepEqual(t.statuses.map((s) => s[0].state), ['ok', 'ok', 'ok', 'ok', 'ok']);
});
