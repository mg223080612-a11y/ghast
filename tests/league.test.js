// 리그(한 사람당 정해진 판 수, 점수 합계 순위) 계산 테스트 — 실행: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../league-core.js');

function fixedRng(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const names = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

// 사람마다 상대 목록
function opponents(lg) {
  const out = lg.players.map(() => []);
  L.matches(lg).forEach((m) => { out[m.a].push(m.b); out[m.b].push(m.a); });
  return out;
}
function assertRegular(lg, games, label) {
  opponents(lg).forEach((list, id) => {
    assert.equal(list.length, games, `${label}: ${id}번 판 수`);
    assert.equal(new Set(list).size, list.length, `${label}: ${id}번 상대 겹침`);
    assert.ok(!list.includes(id), `${label}: 자기 자신과 경기`);
  });
}
// 끝까지 a 가 10점, b 가 5점으로 진행
function playAll(lg, scoreOf = () => [10, 5]) {
  let cur = lg;
  for (let guard = 0; guard < 300 && !L.isFinished(cur); guard++) {
    const m = L.nextMatch(cur);
    cur = L.recordResult(cur, m.id, scoreOf(m));
  }
  return cur;
}

test('20명 × 4판: 40경기, 모두 서로 다른 상대 4명', () => {
  const lg = L.createLeague(names(20), { games: 4, rng: fixedRng(1) });
  assert.equal(L.matches(lg).length, 40);
  assertRegular(lg, 4, '20명');
});

test('21명 × 4판: 홀수 인원도 42경기, 모두 4판씩', () => {
  const lg = L.createLeague(names(21), { games: 4, rng: fixedRng(2) });
  assert.equal(L.matches(lg).length, 42);
  assertRegular(lg, 4, '21명');
});

test('홀수 인원 × 홀수 판은 짤 수 없다고 알려 준다', () => {
  assert.throws(() => L.createLeague(names(21), { games: 3 }), /짤 수 없어요/);
  assert.equal(L.checkGames(21, 3).ok, false);
  assert.equal(L.checkGames(20, 3).ok, true);
});

test('판 수가 (인원 − 1) 보다 많으면 모두와 한 번씩으로 줄인다', () => {
  const lg = L.createLeague(names(4), { games: 6, rng: fixedRng(3) });
  assert.equal(lg.games, 3);
  assertRegular(lg, 3, '4명');
  assert.equal(L.checkGames(4, 6).games, 3);
});

test('3~32명 × 1~6판: 가능한 조합은 모두 정확히 그 판 수, 상대 겹침 없음', () => {
  for (let n = 3; n <= 32; n++) {
    for (let g = 1; g <= 6; g++) {
      const check = L.checkGames(n, g);
      if (!check.ok) continue;
      const lg = L.createLeague(names(n), { games: g, rng: fixedRng(n * 10 + g) });
      assertRegular(lg, check.games, `${n}명 ${g}판`);
      assert.equal(L.matches(lg).length, (n * check.games) / 2, `${n}명 ${g}판 경기 수`);
    }
  }
});

test('6명 이상이면 같은 사람이 두 경기를 연달아 하지 않는다', () => {
  for (let n = 6; n <= 32; n++) {
    for (const g of [2, 3, 4, 5, 6]) {
      if (!L.checkGames(n, g).ok) continue;
      const list = L.matches(L.createLeague(names(n), { games: g, rng: fixedRng(n + g) }));
      list.slice(1).forEach((m, i) => {
        const prev = list[i];
        assert.ok(![prev.a, prev.b].includes(m.a) && ![prev.a, prev.b].includes(m.b), `${n}명 ${g}판 ${i + 2}번째 경기`);
      });
    }
  }
});

test('1P·2P 자리는 사람마다 고르게 (차이 1 이하)', () => {
  const lg = L.createLeague(names(20), { games: 4, rng: fixedRng(5) });
  const first = lg.players.map(() => 0);
  L.matches(lg).forEach((m) => { first[m.a] += 1; });
  first.forEach((k) => assert.ok(Math.abs(k - (4 - k)) <= 1, `1P ${k}번`));
});

test('결과를 넣으면 원래 리그는 그대로, 다음 경기로 넘어간다', () => {
  const lg = L.createLeague(names(6), { games: 2, rng: fixedRng(4) });
  const m = L.nextMatch(lg);
  const next = L.recordResult(lg, m.id, [12, 7]);
  assert.equal(Object.keys(lg.results).length, 0);
  assert.deepEqual(next.results[m.id].scores, [12, 7]);
  assert.notEqual(L.nextMatch(next).id, m.id);
  assert.throws(() => L.recordResult(next, m.id, [1, 1]), /할 수 없는 경기/);
  assert.throws(() => L.recordResult(next, 'NOPE', [1, 1]), /할 수 없는 경기/);
});

test('순위: 점수 합계 → 같으면 최고 한 판 → 그래도 같으면 공동', () => {
  // 3명 2판 = 3경기 (모두 한 번씩)
  let lg = L.createLeague(names(3), { games: 2, rng: fixedRng(1) });
  const scores = { 0: [], 1: [], 2: [] };
  const plan = [[30, 10], [20, 20], [10, 30]];
  plan.forEach((s) => {
    const m = L.nextMatch(lg);
    scores[m.a].push(s[0]);
    scores[m.b].push(s[1]);
    lg = L.recordResult(lg, m.id, s);
  });
  const rows = L.standings(lg);
  const total = (id) => scores[id].reduce((a, b) => a + b, 0);
  rows.forEach((r) => assert.equal(r.total, total(r.id)));
  rows.slice(1).forEach((r, i) => {
    const p = rows[i];
    assert.ok(p.total > r.total || (p.total === r.total && p.best >= r.best));
    const same = p.total === r.total && p.best === r.best;
    assert.equal(r.rank, same ? p.rank : i + 2);
  });
  assert.ok(L.isFinished(lg));
});

test('완전히 같으면 공동 순위, 승·무·패와 판 수도 센다', () => {
  let lg = L.createLeague(names(4), { games: 3, rng: fixedRng(2) });
  lg = playAll(lg, () => [10, 10]);
  const rows = L.standings(lg);
  assert.ok(rows.every((r) => r.rank === 1 && r.total === 30 && r.best === 10 && r.played === 3 && r.draws === 3));
});

test('경기 이름은 "n경기 (전체 중)"', () => {
  const lg = L.createLeague(names(20), { games: 4, rng: fixedRng(1) });
  assert.equal(L.matchLabel(lg, L.nextMatch(lg)), '1경기 (40경기 중)');
});

test('첫 경기 전에만 다시 섞을 수 있다', () => {
  const lg = L.createLeague(names(8), { games: 4, rng: fixedRng(1) });
  const again = L.reshuffle(lg, fixedRng(9));
  assert.equal(again.games, 4);
  assert.notDeepEqual(again.matches, lg.matches);
  const started = L.recordResult(lg, L.nextMatch(lg).id, [1, 0]);
  assert.throws(() => L.reshuffle(started), /이미 경기를 시작/);
});

test('JSON 저장 후 불러와도 이어지고, 망가진 데이터는 거절한다', () => {
  let lg = L.createLeague(names(10), { games: 4, rng: fixedRng(7) });
  lg = L.recordResult(lg, L.nextMatch(lg).id, [3, 4]);
  const restored = JSON.parse(JSON.stringify(lg));
  assert.ok(L.isValid(restored));
  assert.deepEqual(L.nextMatch(restored), L.nextMatch(lg));
  assert.equal(L.isValid(null), false);
  assert.equal(L.isValid({ ...lg, matches: [[0, 0]] }), false);
  assert.equal(L.isValid({ ...lg, matches: [[0, 99]] }), false);
  assert.equal(L.isValid({ ...lg, format: 2 }), false);
});

test('결과 취소: 원래 리그는 그대로, 그 경기 결과만 빠지고 그 경기가 다시 다음 경기', () => {
  const lg = L.createLeague(names(6), { games: 2, rng: fixedRng(4) });
  const m1 = L.nextMatch(lg);
  const lg1 = L.recordResult(lg, m1.id, [12, 7]);
  const m2 = L.nextMatch(lg1);
  const lg2 = L.recordResult(lg1, m2.id, [5, 9]);
  const before = JSON.stringify(lg2);
  const undone = L.undoResult(lg2, m2.id);
  assert.equal(JSON.stringify(lg2), before);
  assert.equal(undone.results[m2.id], undefined);
  assert.deepEqual(undone, lg1);
  assert.equal(L.nextMatch(undone).id, m2.id);
  assert.deepEqual(L.standings(undone), L.standings(lg1));
});

test('결과 취소: 결과가 없는 경기는 거절하고, 끝난 리그도 마지막 경기를 되돌리면 다시 진행 중', () => {
  const lg = L.createLeague(names(4), { games: 3, rng: fixedRng(2) });
  assert.throws(() => L.undoResult(lg, L.nextMatch(lg).id), /결과가 없는 경기/);
  assert.throws(() => L.undoResult(lg, 'NOPE'), /결과가 없는 경기/);
  const done = playAll(lg);
  const lastId = L.matches(done).at(-1).id;
  const undone = L.undoResult(done, lastId);
  assert.ok(L.isFinished(done));
  assert.equal(L.isFinished(undone), false);
  assert.equal(L.nextMatch(undone).id, lastId);
  assert.ok(L.isValid(undone));
});

test('저장된 결과가 망가졌으면(점수 없음·없는 경기) 거절한다', () => {
  const lg = L.createLeague(names(6), { games: 2, rng: fixedRng(3) });
  assert.equal(L.isValid({ ...lg, results: { L0: {} } }), false);
  assert.equal(L.isValid({ ...lg, results: { L99: { scores: [1, 2] } } }), false);
  assert.equal(L.isValid({ ...lg, results: { L0: { scores: [1, 'x'] } } }), false);
  assert.equal(L.isValid({ ...lg, results: { L0: { scores: [1, 2] } } }), true);
});
