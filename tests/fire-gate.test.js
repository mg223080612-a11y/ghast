// 연사 차단(fire-gate.js) 테스트 — 실행: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const FireGate = require('../fire-gate.js');

// 시각 목록대로 쏴 보고 각 발의 결과를 돌려준다
function shoot(times) {
  let state = FireGate.initial();
  return times.map((now) => {
    const r = FireGate.next(state, now);
    state = r.state;
    return r;
  });
}

test('사람이 쏘는 간격(0.15초 이상)은 모두 들어간다', () => {
  const results = shoot([0, 200, 400, 560, 800]);
  assert.deepEqual(results.map((r) => r.allowed), [true, true, true, true, true]);
  assert.ok(results.every((r) => !r.lockStarted));
});

test('0.08초 안에 또 들어온 클릭은 막고, 잠금이 시작됐다고 알린다', () => {
  const [, second] = shoot([1000, 1050]);
  assert.equal(second.allowed, false);
  assert.equal(second.lockStarted, true);
});

test('0.14초 안쪽 간격이 세 번 이어지면 세 번째에서 막고 잠금 시작을 알린다', () => {
  const r = shoot([1000, 1100, 1200]);
  assert.deepEqual(r.map((x) => x.allowed), [true, true, false]);
  assert.equal(r[2].lockStarted, true);
});

test('잠긴 동안 막힌 발은 잠금 시작으로 다시 알리지 않는다 (알림은 한 번만)', () => {
  const r = shoot([1000, 1050, 1100, 1150]);
  assert.deepEqual(r.map((x) => x.lockStarted), [false, true, false, false]);
  assert.ok(r.slice(1).every((x) => !x.allowed));
});

test('연사를 계속 당기면 잠금이 계속 늘어난다', () => {
  // 1050 에 잠금(→2550). 2500 에 또 빠른 발 → 4000 까지 연장. 2700 은 사람 간격이지만 아직 잠김
  const r = shoot([1000, 1050, 2400, 2500, 2700]);
  assert.equal(r[4].allowed, false);
  assert.equal(r[4].lockStarted, false);
});

test('연사를 끄고 보통 속도로 쏘면 잠금이 끝난 뒤 다시 들어간다', () => {
  const r = shoot([1000, 1050, 1050 + FireGate.LOCK_MS + 10]);
  assert.equal(r[2].allowed, true);
});

test('원래 상태 객체는 바꾸지 않는다', () => {
  const state = FireGate.initial();
  const before = JSON.stringify(state);
  FireGate.next(state, 1000);
  assert.equal(JSON.stringify(state), before);
});
