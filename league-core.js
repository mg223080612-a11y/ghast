// =============================================================
// 리그 (부분 리그전) 계산 — 화면 그리기와 상관없는 순수 계산
//   한 사람당 정해진 판 수(기본 4판)만큼, 모두 서로 다른 상대와 한 번씩 1:1 경기를 한다.
//   순위는 점수 합계 → 같으면 가장 잘한 한 판 점수 → 그래도 같으면 공동 순위.
//   (인원 × 판 수)가 짝수여야 짤 수 있다 (홀수 인원이면 판 수는 짝수). 라운드 없이 경기를 차례로 한다.
//   게임(index.html)에서는 전역 League 로, 테스트(node)에서는 require 로 쓴다.
//
// 리그 = { format: 'league', players: [{ id, name }], games, matches: [[a, b], …], results: { 경기 id: { scores: [a 점수, b 점수] } } }
//   matches 는 진행 순서대로, a(앞) 가 1P · b(뒤) 가 2P. 경기 id 는 'L순번'
// =============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.League = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 32;
  const DEFAULT_GAMES = 4;
  const FORMAT = 'league';
  const ORDER_TRIES = 60; // 경기 순서를 여러 번 짜 보고 연달아 하는 사람이 가장 적은 것을 고른다

  const matchId = (index) => `L${index}`;
  const isPlayer = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

  function shuffled(list, rng) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // n 명이 한 사람당 g 판을 할 수 있는지. 판 수는 (n − 1) 을 넘지 않게 줄인다
  function checkGames(n, g) {
    const want = Math.max(1, Math.round(Number(g)) || DEFAULT_GAMES);
    const games = Math.min(want, n - 1);
    if ((n * games) % 2 === 0) return { ok: true, games, message: `${n}명 × ${games}판 = 모두 ${(n * games) / 2}경기` };
    const other = [games - 1, games + 1].filter((k) => k >= 1 && k <= n - 1).map((k) => `${k}판`).join('이나 ');
    return { ok: false, games, message: `${n}명은 한 사람당 ${games}판으로 짤 수 없어요 (인원이 홀수면 판 수는 짝수) — ${other}으로 해 주세요` };
  }

  // 무작위로 둥글게 세운 뒤, 거리 d 만큼 떨어진 사람끼리 붙인다 (거리가 다르면 상대가 겹치지 않는다).
  // 판 수가 홀수면 (인원이 짝수일 때) 정반대 사람과도 한 판.
  // [앞, 뒤] 순서 = [1P, 2P]: 거리마다 누구나 한 번은 앞, 한 번은 뒤라서 1P·2P 횟수가 같다 (정반대 판만 한쪽이 1P)
  function pairings(n, games, rng) {
    const ring = shuffled(Array.from({ length: n }, (_, i) => i), rng);
    const maxPair = n % 2 ? (n - 1) / 2 : n / 2 - 1;
    const steps = shuffled(Array.from({ length: maxPair }, (_, i) => i + 1), rng).slice(0, Math.floor(games / 2));
    const all = games % 2 ? [...steps, n / 2] : steps;
    return all.flatMap((d) => {
      const count = d * 2 === n ? n / 2 : n;
      return Array.from({ length: count }, (_, i) => [ring[i], ring[(i + d) % n]]);
    });
  }

  // 경기 순서: 방금 한 사람은 되도록 쉬고, 덜 한 사람·오래 기다린 사람 먼저
  function orderOnce(pairs, n, rng) {
    const played = Array.from({ length: n }, () => 0);
    const last = Array.from({ length: n }, () => -Infinity);
    let left = pairs.map((p) => ({ p, r: rng() }));
    const seq = [];
    let backToBack = 0;
    for (let step = 0; left.length; step++) {
      const cost = ({ p: [a, b], r }) => [
        last[a] === step - 1 || last[b] === step - 1 ? 1 : 0,
        played[a] + played[b],
        -Math.min(step - last[a], step - last[b]),
        r,
      ];
      const better = (x, y) => {
        const cx = cost(x), cy = cost(y);
        const k = cx.findIndex((v, i) => v !== cy[i]);
        return k >= 0 && cx[k] < cy[k];
      };
      const pick = left.reduce((best, x) => (better(x, best) ? x : best));
      const [a, b] = pick.p;
      if (last[a] === step - 1 || last[b] === step - 1) backToBack += 1;
      played[a] += 1; played[b] += 1;
      last[a] = step; last[b] = step;
      seq.push(pick.p);
      left = left.filter((x) => x !== pick);
    }
    return { seq, backToBack };
  }

  function createLeague(names, { games = DEFAULT_GAMES, rng = Math.random } = {}) {
    if (!Array.isArray(names) || names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
      throw new Error(`참가 인원은 ${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 해요`);
    }
    const n = names.length;
    const check = checkGames(n, games);
    if (!check.ok) throw new Error(check.message);
    const pairs = pairings(n, check.games, rng);
    let best = null;
    for (let t = 0; t < ORDER_TRIES && (!best || best.backToBack > 0); t++) {
      const tried = orderOnce(pairs, n, rng);
      if (!best || tried.backToBack < best.backToBack) best = tried;
    }
    return {
      format: FORMAT,
      players: names.map((name, id) => ({ id, name: String(name) })),
      games: check.games,
      matches: best.seq.map((p) => [...p]),
      results: {},
    };
  }

  // 첫 경기 전에만: 같은 참가자·판 수로 다시 짠다
  function reshuffle(lg, rng = Math.random) {
    if (Object.keys(lg.results).length) throw new Error('이미 경기를 시작해서 다시 섞을 수 없어요');
    return createLeague(lg.players.map((p) => p.name), { games: lg.games, rng });
  }

  function matches(lg) {
    return lg.matches.map(([a, b], index) => {
      const id = matchId(index);
      const res = lg.results[id];
      return { id, index, a, b, scores: res ? [...res.scores] : null, done: !!res };
    });
  }

  const nextMatch = (lg) => matches(lg).find((m) => !m.done) || null;
  const findMatch = (lg, id) => matches(lg).find((m) => m.id === id) || null;
  const isFinished = (lg) => matches(lg).every((m) => m.done);

  function recordResult(lg, id, scores) {
    const m = findMatch(lg, id);
    if (!m || m.done) throw new Error('지금 할 수 없는 경기예요');
    const clean = [0, 1].map((i) => Math.round(Number(scores?.[i])) || 0);
    return { ...lg, results: { ...lg.results, [id]: { scores: clean } } };
  }

  // 결과 취소: 그 경기 결과만 뺀 새 리그 (그 경기를 다시 할 수 있다)
  function undoResult(lg, id) {
    if (!Object.hasOwn(lg.results, id)) throw new Error('결과가 없는 경기라 취소할 수 없어요');
    const { [id]: _removed, ...rest } = lg.results;
    return { ...lg, results: rest };
  }

  // 순위표: 점수 합계 → 최고 한 판 → 공동 순위. 아직 경기 안 한 사람도 0점으로 넣는다
  function standings(lg) {
    const empty = lg.players.map((p) => ({ id: p.id, name: p.name, played: 0, total: 0, best: 0, wins: 0, draws: 0, losses: 0 }));
    const rows = matches(lg).filter((m) => m.done).reduce((acc, m) => {
      const [sa, sb] = m.scores;
      const add = (row, mine, theirs) => ({
        ...row,
        played: row.played + 1,
        total: row.total + mine,
        best: Math.max(row.best, mine),
        wins: row.wins + (mine > theirs ? 1 : 0),
        draws: row.draws + (mine === theirs ? 1 : 0),
        losses: row.losses + (mine < theirs ? 1 : 0),
      });
      return acc.map((row) => (row.id === m.a ? add(row, sa, sb) : row.id === m.b ? add(row, sb, sa) : row));
    }, empty);
    const sorted = [...rows].sort((x, y) => y.total - x.total || y.best - x.best || x.id - y.id);
    return sorted.map((row) => ({
      ...row,
      rank: 1 + sorted.filter((o) => o.total > row.total || (o.total === row.total && o.best > row.best)).length,
    }));
  }

  function matchLabel(lg, m) {
    return `${m.index + 1}경기 (${lg.matches.length}경기 중)`;
  }

  function playerName(lg, id) {
    return isPlayer(id, lg.players.length) ? lg.players[id].name : '';
  }

  // 저장해 둔 리그(localStorage)가 망가지지 않았는지
  function isValid(lg) {
    if (!lg || typeof lg !== 'object' || lg.format !== FORMAT) return false;
    const { players, games, matches: list, results } = lg;
    if (!Array.isArray(players) || !Array.isArray(list) || !results || typeof results !== 'object') return false;
    const n = players.length;
    if (n < MIN_PLAYERS || n > MAX_PLAYERS || !players.every((p, i) => p && p.id === i && typeof p.name === 'string')) return false;
    if (!Number.isInteger(games) || games < 1 || games > n - 1 || list.length !== (n * games) / 2) return false;
    const pairsOk = list.every((p) => Array.isArray(p) && p.length === 2 && isPlayer(p[0], n) && isPlayer(p[1], n) && p[0] !== p[1]);
    if (!pairsOk) return false;
    const keys = list.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`));
    if (new Set(keys).size !== keys.length) return false;
    const count = list.flat().reduce((acc, id) => ({ ...acc, [id]: (acc[id] || 0) + 1 }), {});
    if (!players.every((p) => count[p.id] === games)) return false;
    // 결과: 있는 경기 id 에, 점수 두 개(숫자)
    return Object.entries(results).every(([id, r]) => /^L\d+$/.test(id) && Number(id.slice(1)) < list.length
      && r && Array.isArray(r.scores) && r.scores.length === 2 && r.scores.every((v) => Number.isFinite(v)));
  }

  return {
    MIN_PLAYERS, MAX_PLAYERS, DEFAULT_GAMES,
    checkGames, createLeague, reshuffle, matches, nextMatch, findMatch, recordResult, undoResult,
    isFinished, standings, matchLabel, playerName, isValid,
  };
});
