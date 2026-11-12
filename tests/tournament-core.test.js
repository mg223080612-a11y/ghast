// 토너먼트 대진표 계산 테스트 — 실행: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../tournament-core.js');

// 늘 같은 순서로 섞이게 하는 가짜 난수 (테스트를 매번 같게)
function fixedRng(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const names = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

// 다음 경기를 차례로 a(위쪽)가 이기게 끝까지 진행
function playAll(t, pickWinner = (m) => m.a) {
  let cur = t;
  for (let guard = 0; guard < 100 && !B.isFinished(cur); guard++) {
    const m = B.nextMatch(cur);
    assert.ok(m, '끝나지 않았는데 다음 경기가 없음');
    cur = B.recordResult(cur, m.id, pickWinner(m), [10, 5]);
  }
  return cur;
}

test('참가자가 3명보다 적거나 32명보다 많으면 거절한다', () => {
  assert.throws(() => B.createBracket(names(2)), /3~32/);
  assert.throws(() => B.createBracket(names(33)), /3~32/);
});

test('대진표 크기는 참가자 수 이상인 가장 작은 2의 거듭제곱이다', () => {
  assert.equal(B.createBracket(names(3)).size, 4);
  assert.equal(B.createBracket(names(4)).size, 4);
  assert.equal(B.createBracket(names(5)).size, 8);
  assert.equal(B.createBracket(names(17)).size, 32);
  assert.equal(B.createBracket(names(32)).size, 32);
});

test('모든 참가자가 정확히 한 자리씩 들어간다', () => {
  const t = B.createBracket(names(11), { rng: fixedRng(3) });
  const placed = t.slots.filter((s) => s !== null).sort((a, b) => a - b);
  assert.deepEqual(placed, Array.from({ length: 11 }, (_, i) => i));
});

test('부전승끼리 붙는 경기(빈 자리 둘)는 없다', () => {
  for (let n = 3; n <= 32; n++) {
    const t = B.createBracket(names(n), { rng: fixedRng(n) });
    for (let k = 0; k < t.size / 2; k++) {
      assert.ok(t.slots[2 * k] !== null || t.slots[2 * k + 1] !== null, `${n}명: ${k}번째 경기가 비어 있음`);
    }
  }
});

test('부전승은 왼쪽·오른쪽 절반에 고르게 나뉜다', () => {
  const t = B.createBracket(names(10), { rng: fixedRng(5) }); // 크기 16, 부전승 6
  const half = t.size / 2;
  const emptyLeft = t.slots.slice(0, half).filter((s) => s === null).length;
  const emptyRight = t.slots.slice(half).filter((s) => s === null).length;
  assert.equal(emptyLeft + emptyRight, 6);
  assert.equal(emptyLeft, emptyRight);
});

test('부전승 경기는 저절로 승자가 정해지고 다음 경기로 고르지 않는다', () => {
  const t = B.createBracket(names(3), { rng: fixedRng(1) });
  const first = B.rounds(t)[0];
  const bye = first.find((m) => m.bye);
  assert.ok(bye);
  assert.notEqual(bye.winner, undefined);
  assert.equal(B.nextMatch(t).bye, false);
});

test('경기 결과를 넣으면 원래 대진표는 바뀌지 않고 새 대진표가 나온다', () => {
  const t = B.createBracket(names(4), { rng: fixedRng(2) });
  const m = B.nextMatch(t);
  const next = B.recordResult(t, m.id, m.a, [12, 3]);
  assert.equal(Object.keys(t.results).length, 0);
  assert.equal(next.results[m.id].winner, m.a);
  assert.deepEqual(next.results[m.id].scores, [12, 3]);
});

test('승자는 다음 라운드 자리로 올라간다', () => {
  const t = B.createBracket(names(4), { rng: fixedRng(2), thirdPlace: false });
  const m = B.nextMatch(t); // 4강 1경기
  const next = B.recordResult(t, m.id, m.b, [1, 9]);
  const final = B.rounds(next)[1][0];
  assert.equal(final.a, m.b);
});

test('경기에 나오지 않은 사람을 승자로 넣으면 거절한다', () => {
  const t = B.createBracket(names(4), { rng: fixedRng(2) });
  const m = B.nextMatch(t);
  const outsider = [0, 1, 2, 3].find((id) => id !== m.a && id !== m.b);
  assert.throws(() => B.recordResult(t, m.id, outsider, [1, 0]), /이 경기의 선수가 아니에요/);
});

test('아직 할 수 없는 경기(상대 미정)나 끝난 경기에는 결과를 넣을 수 없다', () => {
  const t = B.createBracket(names(4), { rng: fixedRng(2) });
  assert.throws(() => B.recordResult(t, B.rounds(t)[1][0].id, 0, [1, 0]), /할 수 없는 경기/);
  const m = B.nextMatch(t);
  const done = B.recordResult(t, m.id, m.a, [3, 1]);
  assert.throws(() => B.recordResult(done, m.id, m.a, [3, 1]), /할 수 없는 경기/);
});

test('4명 + 3·4위전: 4강 2경기 → 3·4위전 → 결승 순서로 진행된다', () => {
  let t = B.createBracket(names(4), { rng: fixedRng(7), thirdPlace: true });
  const order = [];
  while (!B.isFinished(t)) {
    const m = B.nextMatch(t);
    order.push(m.id);
    t = B.recordResult(t, m.id, m.a, [5, 1]);
  }
  assert.deepEqual(order, ['R0-0', 'R0-1', 'THIRD', 'R1-0']);
});

test('순위: 우승·준우승·3위·4위를 돌려준다', () => {
  const t = playAll(B.createBracket(names(8), { rng: fixedRng(9), thirdPlace: true }));
  const s = B.standings(t);
  const [semiA, semiB] = B.rounds(t)[1];
  const final = B.rounds(t)[2][0];
  assert.equal(s.champion, final.winner);
  assert.equal(s.runnerUp, final.a === final.winner ? final.b : final.a);
  const third = B.thirdPlaceMatch(t);
  assert.deepEqual(new Set([third.a, third.b]), new Set([B.loserOf(semiA), B.loserOf(semiB)]));
  assert.deepEqual(s.third, [third.winner]);
  assert.deepEqual(s.fourth, [B.loserOf(third)]);
});

test('3·4위전이 없으면 준결승 진 두 사람이 공동 3위', () => {
  const t = playAll(B.createBracket(names(6), { rng: fixedRng(4), thirdPlace: false }));
  const s = B.standings(t);
  assert.equal(B.thirdPlaceMatch(t), null);
  assert.equal(s.third.length, 2);
  assert.deepEqual(s.fourth, []);
});

test('3명이면 준결승 하나가 부전승이라 3·4위전 없이 진 한 사람이 3위', () => {
  const t = playAll(B.createBracket(names(3), { rng: fixedRng(6), thirdPlace: true }));
  const s = B.standings(t);
  assert.equal(B.thirdPlaceMatch(t), null);
  assert.equal(s.third.length, 1);
  assert.ok(B.isFinished(t));
});

test('3~32명 모두 끝까지 진행되고 경기 수는 (인원 − 1) + 3·4위전', () => {
  for (let n = 3; n <= 32; n++) {
    let played = 0;
    let t = B.createBracket(names(n), { rng: fixedRng(n + 100), thirdPlace: true });
    while (!B.isFinished(t)) {
      const m = B.nextMatch(t);
      t = B.recordResult(t, m.id, played % 2 ? m.a : m.b, [1, 2]);
      played++;
    }
    const expected = n - 1 + (n >= 4 ? 1 : 0);
    assert.equal(played, expected, `${n}명`);
  }
});

test('첫 경기 전에는 다시 섞을 수 있고, 결과가 하나라도 있으면 거절한다', () => {
  const t = B.createBracket(names(8), { rng: fixedRng(1), thirdPlace: false });
  const again = B.reshuffle(t, fixedRng(99));
  assert.equal(again.players.length, 8);
  assert.equal(again.thirdPlace, false);
  assert.notDeepEqual(again.slots, t.slots);
  const m = B.nextMatch(t);
  const started = B.recordResult(t, m.id, m.a, [1, 0]);
  assert.throws(() => B.reshuffle(started), /이미 경기를 시작/);
});

test('라운드 이름: 결승·4강·8강·16강·32강', () => {
  const t = B.createBracket(names(32), { rng: fixedRng(1) });
  assert.deepEqual([0, 1, 2, 3, 4].map((r) => B.roundName(t, r)), ['32강', '16강', '8강', '4강', '결승']);
  assert.equal(B.matchLabel(t, B.thirdPlaceMatch(t) || { id: 'THIRD' }), '3·4위전');
});

test('경기 이름은 그 라운드의 실제 경기(부전승 제외) 순번을 쓴다', () => {
  const t = B.createBracket(names(5), { rng: fixedRng(1) }); // 크기 8, 부전승 3 → 1라운드 실제 경기 1개
  const real = B.rounds(t)[0].filter((m) => !m.bye);
  assert.equal(real.length, 1);
  assert.equal(B.matchLabel(t, real[0]), '8강 1경기');
  assert.equal(B.matchLabel(t, B.rounds(t)[2][0]), '결승');
});

test('JSON 으로 저장했다 불러와도 그대로 이어서 진행된다', () => {
  let t = B.createBracket(names(6), { rng: fixedRng(8) });
  const m = B.nextMatch(t);
  t = B.recordResult(t, m.id, m.a, [4, 2]);
  const restored = JSON.parse(JSON.stringify(t));
  assert.ok(B.isValid(restored));
  assert.deepEqual(B.nextMatch(restored), B.nextMatch(t));
});

test('망가진 저장 데이터는 올바르지 않다고 알려 준다', () => {
  assert.equal(B.isValid(null), false);
  assert.equal(B.isValid({ size: 4, slots: [0, 1], players: [] }), false);
  assert.equal(B.isValid({ size: 4, slots: [0, 1, 2, 9], players: [{ id: 0, name: 'a' }], results: {} }), false);
});

test('경기 id 로 경기를 찾는다 (3·4위전 포함), 없는 id 는 null', () => {
  let t = B.createBracket(names(4), { rng: fixedRng(3), thirdPlace: true });
  assert.equal(B.findMatch(t, 'R0-1').index, 1);
  assert.equal(B.findMatch(t, 'NOPE'), null);
  for (let i = 0; i < 2; i++) { const m = B.nextMatch(t); t = B.recordResult(t, m.id, m.a, [2, 1]); }
  const third = B.findMatch(t, 'THIRD');
  assert.ok(typeof third.a === 'number' && typeof third.b === 'number');
});
