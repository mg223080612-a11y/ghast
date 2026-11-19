// 대회 관리(이름 고치기 · 기권 · 결과 CSV) 테스트 — 실행: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Bracket = require('../tournament-core.js');
const League = require('../league-core.js');
const ContestCsv = require('../contest-csv.js');

const fixedRng = () => 0.42;
const names = (n) => Array.from({ length: n }, (_, i) => `선수${i + 1}`);

// ---------- 이름 고치기 ----------
test('토너먼트: 이름을 고치면 새 대진표를 돌려주고 원래 것은 그대로', () => {
  const t = Bracket.createBracket(names(4), { rng: fixedRng });
  const next = Bracket.renamePlayer(t, 2, '  새이름  ');
  assert.equal(Bracket.playerName(next, 2), '새이름');
  assert.equal(Bracket.playerName(t, 2), '선수3');
});

test('토너먼트: 빈 이름·다른 사람과 같은 이름은 거절, 12자로 자른다', () => {
  const t = Bracket.createBracket(names(4), { rng: fixedRng });
  assert.throws(() => Bracket.renamePlayer(t, 0, '   '), /이름/);
  assert.throws(() => Bracket.renamePlayer(t, 0, '선수2'), /같은 이름/);
  assert.equal(Bracket.playerName(Bracket.renamePlayer(t, 0, '가'.repeat(20)), 0), '가'.repeat(12));
  assert.throws(() => Bracket.renamePlayer(t, 9, '없는사람'), /선수/);
});

test('리그: 이름 고치기도 같은 규칙', () => {
  const lg = League.createLeague(names(4), { games: 2, rng: fixedRng });
  assert.equal(League.playerName(League.renamePlayer(lg, 1, '판다'), 1), '판다');
  assert.throws(() => League.renamePlayer(lg, 1, '선수1'), /같은 이름/);
});

// ---------- 토너먼트 기권 ----------
test('토너먼트: 다음 경기 선수가 기권하면 상대가 올라가고 기권으로 남는다', () => {
  const t = Bracket.createBracket(names(4), { thirdPlace: false, rng: fixedRng });
  const m = Bracket.nextMatch(t);
  const next = Bracket.recordForfeit(t, m.id, m.a);
  assert.equal(Bracket.findMatch(next, m.id).winner, m.b);
  assert.equal(next.results[m.id].forfeit, m.a);
  assert.equal(next.results[m.id].scores, null);
  assert.equal(t.results[m.id], undefined);
});

test('토너먼트: 기권할 수 있는 경기 찾기 — 아직 상대가 안 정해졌거나 끝난 선수는 없음', () => {
  const t = Bracket.createBracket(names(4), { thirdPlace: false, rng: fixedRng });
  const m = Bracket.nextMatch(t);
  assert.equal(Bracket.forfeitableMatch(t, m.a).id, m.id);
  const after = Bracket.recordForfeit(t, m.id, m.a);
  assert.equal(Bracket.forfeitableMatch(after, m.a), null);
});

test('토너먼트: 경기 선수가 아니면 기권 거절, 기권 결과도 취소할 수 있다', () => {
  const t = Bracket.createBracket(names(4), { thirdPlace: false, rng: fixedRng });
  const m = Bracket.nextMatch(t);
  const outsider = [0, 1, 2, 3].find((id) => id !== m.a && id !== m.b);
  assert.throws(() => Bracket.recordForfeit(t, m.id, outsider), /선수가 아니/);
  const undone = Bracket.undoResult(Bracket.recordForfeit(t, m.id, m.b), m.id);
  assert.deepEqual(undone.results, {});
});

test('토너먼트: 준결승에서 기권한 선수는 3·4위전에 나오지 않고 상대가 저절로 3위 (결과 취소하면 함께 되돌아감)', () => {
  let t = Bracket.createBracket(names(4), { thirdPlace: true, rng: fixedRng });
  const semi1 = Bracket.nextMatch(t);
  t = Bracket.recordForfeit(t, semi1.id, semi1.a);
  const semi2 = Bracket.nextMatch(t);
  t = Bracket.recordResult(t, semi2.id, semi2.a, [30, 10]);
  const third = Bracket.thirdPlaceMatch(t);
  assert.equal(third.winner, semi2.b);
  assert.equal(third.autoForfeit, semi1.a);
  assert.equal(Bracket.nextMatch(t).id, Bracket.rounds(t).at(-1)[0].id); // 다음은 결승
  assert.equal(Bracket.forfeitableMatch(t, semi1.a), null);
  const undone = Bracket.thirdPlaceMatch(Bracket.undoResult(t, semi1.id));
  assert.equal(undone.winner, undefined);
  assert.equal(undone.autoForfeit, undefined);
});

test('토너먼트 CSV: 저절로 정해진 3·4위전도 기권으로 적는다', () => {
  let t = Bracket.createBracket(['가', '나', '다', '라'], { thirdPlace: true, rng: fixedRng });
  const semi1 = Bracket.nextMatch(t);
  t = Bracket.recordForfeit(t, semi1.id, semi1.a);
  const semi2 = Bracket.nextMatch(t);
  t = Bracket.recordResult(t, semi2.id, semi2.a, [30, 10]);
  const csv = ContestCsv.bracketCsv(t, { title: 't', date: 'd' });
  assert.match(csv, /3·4위전,.*기권/);
});

// ---------- 리그 기권 ----------
test('리그: 기권하면 남은 경기는 기권자 0점, 상대는 그때까지의 한 판 평균 점수', () => {
  const lg = League.createLeague(names(4), { games: 2, rng: fixedRng });
  const [m1] = League.matches(lg);
  const played = League.recordResult(lg, m1.id, [10, 30]); // 한 판 평균 = (10 + 30) / 2 = 20
  const quitter = League.matches(played).find((m) => !m.done).a;
  const { league, ids } = League.withdraw(played, quitter);
  assert.ok(ids.length >= 1);
  for (const id of ids) {
    const m = League.findMatch(league, id);
    const mine = m.a === quitter ? 0 : 1;
    assert.equal(m.scores[mine], 0);
    assert.equal(m.scores[1 - mine], 20);
    assert.equal(league.results[id].forfeit, quitter);
  }
  assert.ok(League.matches(league).filter((m) => m.a === quitter || m.b === quitter).every((m) => m.done));
  assert.ok(League.isValid(league));
});

test('리그: 아무 경기도 안 했으면 평균 0, 이미 한 경기는 그대로 둔다', () => {
  const lg = League.createLeague(names(4), { games: 2, rng: fixedRng });
  const first = League.matches(lg)[0];
  const { league } = League.withdraw(lg, first.a);
  assert.ok(Object.values(league.results).every((r) => r.scores.every((v) => v === 0)));
  const done = League.recordResult(lg, first.id, [50, 40]);
  const kept = League.withdraw(done, first.a).league;
  assert.deepEqual(kept.results[first.id].scores, [50, 40]);
  assert.equal(kept.results[first.id].forfeit, undefined);
});

test('리그: 기권 경기로 받은 점수는 합계·승수에 들지만 최고 한 판(동점 가르기)에는 넣지 않는다', () => {
  const lg = League.createLeague(names(4), { games: 2, rng: fixedRng });
  const [m1] = League.matches(lg);
  const played = League.recordResult(lg, m1.id, [10, 30]);
  const quitter = m1.a;
  const { league } = League.withdraw(played, quitter);
  const rows = League.standings(league);
  assert.equal(rows.find((r) => r.id === quitter).withdrawn, true);
  const opp = League.matches(league).find((m) => league.results[m.id]?.forfeit === quitter);
  const oppId = opp.a === quitter ? opp.b : opp.a;
  const o = rows.find((r) => r.id === oppId);
  assert.ok(o.total >= 20 && o.wins >= 1);
  assert.equal(o.withdrawn, false);
  const realBest = League.matches(league)
    .filter((m) => m.done && !league.results[m.id].forfeit && (m.a === oppId || m.b === oppId))
    .map((m) => (m.a === oppId ? m.scores[0] : m.scores[1]));
  assert.equal(o.best, Math.max(0, ...realBest));
});

test('리그: 남은 경기가 없으면(이미 기권 등) 거절', () => {
  const lg = League.createLeague(names(4), { games: 2, rng: fixedRng });
  const { league } = League.withdraw(lg, 0);
  assert.throws(() => League.withdraw(league, 0), /남은 경기/);
});

// ---------- 결과 CSV ----------
test('토너먼트 CSV: 순위와 경기 결과(기권 표시)가 들어가고 엑셀용 BOM 으로 시작한다', () => {
  let t = Bracket.createBracket(['가', '나', '다', '라'], { thirdPlace: false, rng: fixedRng });
  const m = Bracket.nextMatch(t);
  t = Bracket.recordForfeit(t, m.id, m.a);
  const csv = ContestCsv.bracketCsv(t, { title: '테스트 대회', date: '2026-11-19' });
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /테스트 대회/);
  assert.match(csv, /기권/);
  assert.match(csv, new RegExp(Bracket.playerName(t, m.b)));
});

test('리그 CSV: 순위표 줄 수 = 인원 수, 쉼표·따옴표가 든 이름은 따옴표로 감싼다', () => {
  const lg = League.createLeague(['a,b', 'c"d', 'e', 'f'], { games: 2, rng: fixedRng });
  const csv = ContestCsv.leagueCsv(lg, { title: '리그', date: '2026-11-19' });
  assert.match(csv, /"a,b"/);
  assert.match(csv, /"c""d"/);
  const lines = csv.split('\r\n');
  const head = lines.findIndex((l) => l.startsWith('순위,'));
  assert.ok(head >= 0);
  assert.equal(lines.slice(head + 1, head + 5).filter((l) => /^\d+,/.test(l)).length, 4);
});

test('CSV: = + - @ 로 시작하는 이름은 수식으로 실행되지 않게 앞에 작은따옴표', () => {
  assert.equal(ContestCsv.cell('=1+1'), "'=1+1");
  assert.equal(ContestCsv.cell('+82'), "'+82");
  assert.equal(ContestCsv.cell(12), '12');
  assert.equal(ContestCsv.cell(-5), '-5');
});
