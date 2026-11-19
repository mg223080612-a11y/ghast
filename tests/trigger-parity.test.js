// 2인 경기 방아쇠 공정성 보정 테스트 — 실행: npm test
// 접시 사격(gvcs-clay-shooting-unity DESIGN §4.2.1)과 같은 규칙: 1P(Pro) 방아쇠를 '다음 25ms 칸 + 25ms' 에 처리.
// 2P(보통 총)는 25ms 단위로 25~50ms 늦게 들어오므로(실측 10회 중 9회) 1P 도 25~50ms 로 맞춘다.
// 접시 사격 실측: 보정 뒤 동시 당김 63쌍 P2−P1 평균 −6.4ms, 먼저 들어온 쪽 P1 33 : P2 30
const test = require('node:test');
const assert = require('node:assert/strict');
const { parityFireAt } = require('../aim-cap.js');

test('늦추는 시간은 언제나 25ms 초과 50ms 이하 (2P 실측 분포와 같게)', () => {
  for (let now = 1000; now < 1100; now += 0.7) {
    const wait = parityFireAt(now, 25, 25) - now;
    assert.ok(wait > 25 && wait <= 50, `now=${now} wait=${wait}`);
  }
});

test('처리 시각은 25ms 칸에 맞춘다', () => {
  assert.equal(parityFireAt(1003, 25, 25), 1050);
  assert.equal(parityFireAt(1024.9, 25, 25), 1050);
  assert.equal(parityFireAt(1025, 25, 25), 1075);
});

test('칸이 0 이면 칸 맞춤 없이 delay 만, 둘 다 0 이면 보정 끔(바로 처리)', () => {
  assert.equal(parityFireAt(1003, 0, 30), 1033);
  assert.equal(parityFireAt(1003, 0, 0), 1003);
  assert.equal(parityFireAt(1003, 'x', undefined), 1003);
});
