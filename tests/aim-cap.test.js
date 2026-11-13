// 2인 대결 조준 위치 속도 제한 테스트 — 실행: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { nextCappedAim, gapForHz } = require('../aim-cap.js');

const POLL_MS = 4; // 게임이 총을 읽는 간격 (1초에 약 250번)

// 하드웨어가 hz 로 새 위치를 보내는 총을 seconds 초 동안 읽어서, 받아들인 위치 수(1초당)를 센다
function simulate({ hz, jitterMs = 0, gapMs, seconds = 2 }) {
  let raw = { x: 0, y: 0 };
  let nextRawAt = 0;
  let state = { x: 0, y: 0, at: -1e9 };
  let accepted = 0;
  let k = 0;
  for (let now = 0; now < seconds * 1000; now += POLL_MS) {
    while (now >= nextRawAt) {
      k += 1;
      raw = { x: k, y: k };
      const jitter = jitterMs ? ((k % 3) - 1) * jitterMs : 0;
      nextRawAt += 1000 / hz + jitter;
    }
    const next = nextCappedAim(state, raw.x, raw.y, now, gapMs);
    if (next.at !== state.at) accepted += 1;
    state = next;
  }
  return accepted / seconds;
}

test('Hz 를 간격(ms)으로: 40Hz → 23ms(2ms 여유), 0 이하·숫자 아님은 제한 없음', () => {
  assert.equal(gapForHz(40), 23);
  assert.equal(gapForHz(0), 0);
  assert.equal(gapForHz(-5), 0);
  assert.equal(gapForHz('abc'), 0);
});

test('제한이 없으면 새 위치를 바로 받는다', () => {
  const next = nextCappedAim({ x: 0, y: 0, at: 100 }, 5, 7, 101, 0);
  assert.deepEqual(next, { x: 5, y: 7, at: 101 });
});

test('간격이 덜 지났으면 이전 위치를 그대로 둔다 (원래 상태는 바꾸지 않음)', () => {
  const prev = Object.freeze({ x: 1, y: 1, at: 100 });
  const next = nextCappedAim(prev, 9, 9, 110, 25);
  assert.deepEqual(next, { x: 1, y: 1, at: 100 });
});

test('위치가 그대로면 시각도 바꾸지 않는다 (가만히 있는 총)', () => {
  const prev = { x: 3, y: 4, at: 0 };
  assert.deepEqual(nextCappedAim(prev, 3, 4, 500, 25), prev);
});

test('멈추기 직전에 막힌 위치도 간격이 지나면 받는다', () => {
  const held = nextCappedAim({ x: 0, y: 0, at: 0 }, 8, 8, 10, 25);
  assert.deepEqual(held, { x: 0, y: 0, at: 0 });
  assert.deepEqual(nextCappedAim(held, 8, 8, 26, 25), { x: 8, y: 8, at: 26 });
});

const GAP = gapForHz(40);

test('130Hz 총은 1초에 약 40번(44번 이하)으로 줄어든다', () => {
  const rate = simulate({ hz: 130, gapMs: GAP });
  assert.ok(rate <= 44, `${rate}`);
  assert.ok(rate >= 36, `${rate}`);
});

test('40Hz 총은 그대로 받는다 (흔들림 ±3ms 가 있어도)', () => {
  assert.ok(simulate({ hz: 40, gapMs: GAP }) >= 39);
  assert.ok(simulate({ hz: 40, jitterMs: 3, gapMs: GAP }) >= 39);
});

test('제한을 걸면 빠른 총과 느린 총의 갱신 횟수 차이가 10% 안쪽', () => {
  const fast = simulate({ hz: 130, gapMs: GAP });
  const slow = simulate({ hz: 40, jitterMs: 3, gapMs: GAP });
  assert.ok(fast <= slow * 1.1, `fast ${fast} slow ${slow}`);
});
