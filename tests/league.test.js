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

test('저장된 결과가 망가졌으면(점수 없음·없는 경기) 거절한다', () => {
  const lg = L.createLeague(names(6), { games: 2, rng: fixedRng(3) });
  assert.equal(L.isValid({ ...lg, results: { L0: {} } }), false);
  assert.equal(L.isValid({ ...lg, results: { L99: { scores: [1, 2] } } }), false);
  assert.equal(L.isValid({ ...lg, results: { L0: { scores: [1, 'x'] } } }), false);
  assert.equal(L.isValid({ ...lg, results: { L0: { scores: [1, 2] } } }), true);
});

// ---------- 기록전 대회 (한 사람씩 1인 기록전, v2.6.0) ----------
test('기록전 대회: 한 사람당 정한 판 수만큼, 판마다 모두 한 번씩 차례가 온다', () => {
  const lg = L.createLeague(names(21), { games: 2, solo: true, rng: fixedRng(3) });
  assert.equal(lg.solo, true);
  assert.equal(lg.matches.length, 42);
  const first = lg.matches.slice(0, 21).map(([a]) => a).sort((x, y) => x - y);
  assert.deepEqual(first, Array.from({ length: 21 }, (_, i) => i));
  assert.ok(lg.matches.every(([, b]) => b === -1));
  assert.ok(L.isValid(lg));
  assert.ok(L.isValid(JSON.parse(JSON.stringify(lg))));
});

test('기록전 대회: 홀수 인원 1판도 만들 수 있고, 점수 순으로 순위가 정해진다', () => {
  let lg = L.createLeague(names(5), { games: 1, solo: true, rng: fixedRng(7) });
  const scores = [300, 500, 500, 100, 0];
  while (L.nextMatch(lg)) {
    const m = L.nextMatch(lg);
    lg = L.recordResult(lg, m.id, [scores[m.a], 0]);
  }
  assert.ok(L.isFinished(lg));
  assert.ok(L.isValid(lg));
  const rows = L.standings(lg);
  assert.deepEqual(rows.map((r) => r.rank), [1, 1, 3, 4, 5]);
  assert.deepEqual(rows.map((r) => r.total), [500, 500, 300, 100, 0]);
  assert.ok(rows.every((r) => r.played === 1));
});

test('기록전 대회: 다시 섞어도 기록전 대회이고, 망가진 저장값은 거른다', () => {
  const lg = L.createLeague(names(4), { games: 1, solo: true, rng: fixedRng(2) });
  const again = L.reshuffle(lg, fixedRng(9));
  assert.equal(again.solo, true);
  assert.equal(again.matches.length, 4);
  assert.equal(L.isValid({ ...lg, matches: lg.matches.slice(1) }), false);
  assert.equal(L.isValid({ ...lg, matches: lg.matches.map(([a]) => [a, 0]) }), false);
  assert.match(L.matchLabel(lg, L.nextMatch(lg)), /1번째 차례/);
});

test('기록전 대회: 기권은 0점으로 넣고 순위표에 기권 수가 남는다', () => {
  let lg = L.createLeague(names(3), { games: 1, solo: true, rng: fixedRng(5) });
  const first = L.nextMatch(lg);
  lg = L.recordResult(lg, first.id, [999, 0], { forfeit: true });
  const second = L.nextMatch(lg);
  lg = L.recordResult(lg, second.id, [200, 0]);
  assert.ok(L.isValid(JSON.parse(JSON.stringify(lg))));
  const rows = L.standings(lg);
  const out = rows.find((r) => r.id === first.a);
  assert.equal(out.total, 0);
  assert.equal(out.forfeits, 1);
  assert.equal(out.played, 1);
  assert.equal(rows[0].id, second.a);
  assert.equal(rows[0].forfeits, 0);
});

test('기록전 대회: 기권한 사람은 아직 안 한 사람(0점)보다도 아래, 맨 끝 순위', () => {
  let lg = L.createLeague(names(4), { games: 1, solo: true, rng: fixedRng(11) });
  const quit = L.nextMatch(lg);
  lg = L.recordResult(lg, quit.id, [0, 0], { forfeit: true });
  const played = L.nextMatch(lg);
  lg = L.recordResult(lg, played.id, [250, 0]);
  const rows = L.standings(lg);
  assert.equal(rows[0].id, played.a);
  assert.equal(rows[3].id, quit.a);
  assert.equal(rows[3].rank, 4);
  assert.deepEqual(rows.slice(1, 3).map((r) => r.rank), [2, 2]);
});
