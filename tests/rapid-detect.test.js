// 연사 ON 알아보기(rapid-detect.js) 점검 — 실행: npm test
//   총의 연사가 ON 이면 방아쇠를 꾹 당기고 있는 동안 게임패드 방아쇠 신호가 1초에 약 10번 눌림·뗌을 되풀이한다
//   (2026-11-20 실측: 5+스페이스+E 로 켜고 1초씩 당기면 당길 때마다 10~16번). 사람이 당기는 속도와 구분되는지 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const RapidDetect = require('../rapid-detect.js');

// 일정 간격으로 n 번 누름 → 마지막 결과와 처음 rapid 가 된 번째
function pressEvery(gapMs, n, start = 1000) {
  let history = [], first = -1, last = null;
  for (let i = 0; i < n; i++) {
    last = RapidDetect.notePress(history, start + i * gapMs);
    history = last.history;
    if (last.rapid && first < 0) first = i + 1;
  }
  return { last, first };
}

test('연사 ON (초당 10번, 100ms 간격): 다섯 번째 누름에서 알아본다', () => {
  const { first, last } = pressEvery(100, 8);
  assert.equal(first, 5);
  assert.equal(last.rapid, true);
});

test('연사 ON (초당 16번): 알아본다', () => {
  assert.equal(pressEvery(62, 6).first, 5);
});

test('사람이 아주 빨리 당김 (초당 7번, 143ms): 연사로 보지 않는다', () => {
  assert.equal(pressEvery(143, 20).first, -1);
});

test('사람이 아주 빨리 당김 (초당 8번, 125ms): 연사로 보지 않는다', () => {
  assert.equal(pressEvery(125, 20).first, -1);
});

test('네 번만 빠르게 눌림 (짧게 튐): 연사로 보지 않는다', () => {
  assert.equal(pressEvery(100, 4).first, -1);
});

test('기록은 최근 몇 번만 남기고, 넘겨받은 배열은 바꾸지 않는다', () => {
  const before = [0, 100, 200, 300, 400];
  const copy = [...before];
  const r = RapidDetect.notePress(before, 500);
  assert.deepEqual(before, copy);
  assert.ok(r.history.length <= RapidDetect.PRESSES);
  assert.equal(r.history.at(-1), 500);
});

test('잘못된 시각·기록은 무시한다', () => {
  assert.deepEqual(RapidDetect.notePress([100], NaN), { history: [100], rapid: false, spanMs: 0 });
  assert.equal(RapidDetect.notePress(null, 100).rapid, false);
  assert.deepEqual(RapidDetect.notePress(null, 100).history, [100]);
});

test('rapid 일 때 spanMs 는 다섯 번 누른 동안의 시간', () => {
  const { last } = pressEvery(100, 5);
  assert.equal(last.spanMs, 400);
});
