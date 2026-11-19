// 총 모드 자동 전환 + 연사 자동 끄기(desktop/gun-mode.js) 점검 — 실행: npm test
//   진짜 수신기 없이, 명령마다 정해 둔 답을 돌려주는 가짜 시리얼 포트로 '어떤 명령을 어떤 순서로 보내는지' 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkPort, startGunModeWatch } = require('../desktop/gun-mode.js');

const GUN_ON = 'XV:85,30,300,200,0,0,20,1100\r\n';
const RAPID_ON = 'XLV:1,10,0,0,50,0,50,1\r\n';
const RAPID_OFF_STATE = 'XLV:0,10,0,0,50,0,50,1\r\n';
const ACK_OFF = 'XAOK:0,10\r\nXAOK:0,10\r\nXAOK:0,10\r\n';

// replies: 명령 → 답 글자 (없으면 답하지 않음). written 에 보낸 명령이 차례로 쌓인다
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
      if (reply && fastReply) this.handlers.data?.(Buffer.from(reply, 'latin1'));
      else if (reply) setTimeout(() => this.handlers.data?.(Buffer.from(reply, 'latin1')), 5);
    }
    drain(cb) { setTimeout(() => cb(null), fastReply ? 10 : 0); }
    close(cb) { this.isOpen = false; setImmediate(() => cb && cb(null)); }
  }
  return { openPort: (path) => new FakePort(path), written };
}

test('연사가 켜진 총: XQ; → XLQ; → XA:0; 순서로 보내고, 꺼짐을 확인하면 turnedOff', async () => {
  const { openPort, written } = fakePortFactory({ 'XQ;': GUN_ON, 'XLQ;': RAPID_ON, 'XA:0;': ACK_OFF });
  const r = await checkPort('p1', { rapidOff: true, openPort });
  assert.deepEqual(written, ['XQ;', 'XLQ;', 'XA:0;']);
  assert.equal(r.state, 'alive');
  assert.equal(r.rapid.state, 'off');
  assert.equal(r.rapid.turnedOff, true);
  assert.match(r.rapid.raw, /XLV:1,10.*XAOK:0,10/);
});

test('연사가 이미 꺼진 총: 끄기 명령 없이 꺼짐 확인 (3초마다 무선 통신을 늘리지 않게)', async () => {
  const { openPort, written } = fakePortFactory({ 'XQ;': GUN_ON, 'XLQ;': RAPID_OFF_STATE, 'XA:0;': ACK_OFF });
  const r = await checkPort('p1', { rapidOff: true, openPort });
  assert.deepEqual(written, ['XQ;', 'XLQ;']);
  assert.deepEqual([r.rapid.state, r.rapid.turnedOff], ['off', false]);
});

test('조회에는 답이 없고 끄기에는 답하는 총: 끄기를 보내 꺼짐 확인', async () => {
  const { openPort, written } = fakePortFactory({ 'XQ;': GUN_ON, 'XA:0;': ACK_OFF });
  const r = await checkPort('p1', { rapidOff: true, openPort });
  assert.deepEqual(written, ['XQ;', 'XLQ;', 'XA:0;']);
  assert.deepEqual([r.rapid.state, r.rapid.turnedOff], ['off', false]);
});

test('답이 쓰기 완료 알림보다 먼저 와도 놓치지 않는다 (빠른 수신기 — 예전에는 꺼짐으로 잘못 봄)', async () => {
  const { openPort, written } = fakePortFactory({ 'XQ;': GUN_ON, 'XLQ;': RAPID_ON, 'XA:0;': ACK_OFF }, { fastReply: true });
  const r = await checkPort('p1', { rapidOff: true, openPort });
  assert.equal(r.state, 'alive');
  assert.deepEqual(written, ['XQ;', 'XLQ;', 'XA:0;']);
  assert.deepEqual([r.rapid.state, r.rapid.turnedOff], ['off', true]);
});

test('연사 명령에 답하지 않는 총: noReply, 3초 제한 안에 끝난다 (멈춤으로 보지 않음)', async () => {
  const { openPort, written } = fakePortFactory({ 'XQ;': GUN_ON });
  const t0 = Date.now();
  const r = await checkPort('p1', { rapidOff: true, openPort });
  assert.equal(r.state, 'alive');
  assert.equal(r.rapid.state, 'noReply');
  assert.deepEqual(written, ['XQ;', 'XLQ;', 'XA:0;']);
  assert.ok(Date.now() - t0 < 2500, `너무 오래 걸림: ${Date.now() - t0}ms`);
});

test('총 모드 전환(J)을 보내는 회차에는 연사 명령을 보내지 않는다', async () => {
  const { openPort, written } = fakePortFactory({ 'XQ;': GUN_ON, 'XLQ;': RAPID_ON, 'XA:0;': ACK_OFF });
  const r = await checkPort('p1', { sendJ: true, rapidOff: true, openPort });
  assert.deepEqual(written, ['XQ;', 'J']);
  assert.equal(r.state, 'switched');
  assert.equal(r.rapid, null);
});

test('연사 자동 끄기를 끄면 XQ; 만 보낸다', async () => {
  const { openPort, written } = fakePortFactory({ 'XQ;': GUN_ON });
  const r = await checkPort('p1', { rapidOff: false, openPort });
  assert.deepEqual(written, ['XQ;']);
  assert.deepEqual([r.state, r.rapid], ['alive', null]);
});

test('꺼진 총(XQ; 무응답): 연사 명령을 보내지 않는다', async () => {
  const { openPort, written } = fakePortFactory({});
  const r = await checkPort('p1', { rapidOff: true, openPort });
  assert.deepEqual(written, ['XQ;']);
  assert.deepEqual([r.state, r.rapid], ['off', null]);
});

// 3초 확인(startGunModeWatch): 연사 결과를 상태 줄(rapid)과 알림(onRapidOff)으로 넘긴다
function watchOnce(opts) {
  return new Promise((resolve) => {
    const statuses = [];
    const stop = startGunModeWatch({
      isEnabled: () => false,
      listPorts: async () => [{ path: 'p1', player: 1 }],
      intervalMs: 30,
      ...opts,
      onStatus: (list) => {
        statuses.push(list);
        if (statuses.length >= (opts.ticks || 1)) { stop(); resolve(statuses); }
      },
    });
  });
}

test('3초 확인: 켜진 연사를 끄면 onRapidOff(자리) 와 상태 줄 rapid=off', async () => {
  const offs = [];
  const statuses = await watchOnce({
    isRapidEnabled: () => true,
    onRapidOff: (p) => offs.push(p),
    check: async () => ({ state: 'alive', rapid: { state: 'off', turnedOff: true, raw: 'XLV:1,10 XAOK:0,10' } }),
  });
  assert.deepEqual(offs, [1]);
  assert.equal(statuses[0][0].rapid, 'off');
});

test('3초 확인: 응답 없는 총은 다음 회차부터 한동안 연사 명령을 건너뛴다 (확인이 느려지지 않게)', async () => {
  const calls = [];
  const statuses = await watchOnce({
    ticks: 2,
    isRapidEnabled: () => true,
    check: async (path, o) => { calls.push(o.rapidOff); return { state: 'alive', rapid: o.rapidOff ? { state: 'noReply', turnedOff: false, raw: '' } : null }; },
  });
  assert.deepEqual(calls, [true, false]);
  assert.equal(statuses[1][0].rapid, 'noReply', '건너뛰는 동안에도 마지막 결과(확인 불가)를 알린다');
});

test('3초 확인: 끈 연사가 매번 다시 켜짐으로 보여도 알림은 30초에 한 번, 세 번 이어지면 해석 의심 기록', async () => {
  const offs = [], logs = [];
  await watchOnce({
    ticks: 3,
    isRapidEnabled: () => true,
    onRapidOff: (p) => offs.push(p),
    log: (m) => logs.push(m),
    check: async () => ({ state: 'alive', rapid: { state: 'off', turnedOff: true, raw: 'XLV:1,10 XAOK:0,10' } }),
  });
  assert.deepEqual(offs, [1], '알림은 한 번');
  assert.equal(logs.filter((m) => m.includes('해석 의심')).length, 1);
});

test('3초 확인: 설정에서 끄면 연사 명령 없이 rapid=disabled', async () => {
  const calls = [];
  const statuses = await watchOnce({
    isRapidEnabled: () => false,
    check: async (path, o) => { calls.push(o.rapidOff); return { state: 'alive', rapid: null }; },
  });
  assert.deepEqual(calls, [false]);
  assert.equal(statuses[0][0].rapid, 'disabled');
});
