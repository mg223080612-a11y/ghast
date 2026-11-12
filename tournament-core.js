// =============================================================
// 토너먼트 대진표 계산 (화면 그리기와 상관없는 순수 계산)
//   게임(index.html)에서는 전역 Bracket 으로, 테스트(node)에서는 require 로 쓴다.
//
// 대진표 = { size, players: [{ id, name }], slots: [선수 id | null], results: { 경기 id: { winner, scores } }, thirdPlace }
//   size  : 4·8·16·32 (참가자 수 이상인 가장 작은 2의 거듭제곱)
//   slots : 1라운드 자리. null 은 빈 자리(그 경기의 상대는 부전승)
//   결과를 넣을 때마다 원래 대진표는 그대로 두고 새 대진표를 돌려준다.
// 경기 = { id: 'R라운드-순번' | 'THIRD', round, index, a, b, winner, bye }
//   a·b·winner: 선수 id, null(빈 자리), undefined(아직 모름). a(위쪽) 가 1P, b(아래쪽) 가 2P
// =============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Bracket = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 32;
  const THIRD_ID = 'THIRD';

  const roundCount = (t) => Math.log2(t.size);
  const matchId = (round, index) => `R${round}-${index}`;
  const isPlayer = (v) => typeof v === 'number';

  function bracketSize(n) {
    let size = 4;
    while (size < n) size *= 2;
    return size;
  }

  // 0..m-1 을 비트를 뒤집은 순서로 (0,4,2,6,1,5,3,7 …) — 부전승을 양쪽 절반·4분의 1 에 고르게 퍼뜨린다
  function spreadOrder(m) {
    const bits = Math.log2(m);
    const rev = (i) => {
      let r = 0;
      for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1);
      return r;
    };
    return Array.from({ length: m }, (_, i) => rev(i));
  }

  function shuffled(list, rng) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // 선수 id 들을 1라운드 자리에 넣는다. 부전승 경기에는 위쪽 자리에만 한 명
  function placeSlots(ids, size) {
    const matches = size / 2;
    const byes = new Set(spreadOrder(matches).slice(0, size - ids.length));
    const queue = [...ids];
    return Array.from({ length: matches }, (_, k) => (byes.has(k) ? [queue.shift(), null] : [queue.shift(), queue.shift()])).flat();
  }

  function createBracket(names, { thirdPlace = true, rng = Math.random } = {}) {
    if (!Array.isArray(names) || names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
      throw new Error(`참가 인원은 ${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 해요`);
    }
    const players = names.map((name, id) => ({ id, name: String(name) }));
    const size = bracketSize(players.length);
    const ids = shuffled(players.map((p) => p.id), rng);
    return { size, players, slots: placeSlots(ids, size), results: {}, thirdPlace: !!thirdPlace };
  }

  // 첫 경기 전에만: 같은 참가자로 대진을 다시 뽑는다
  function reshuffle(t, rng = Math.random) {
    if (Object.keys(t.results).length) throw new Error('이미 경기를 시작해서 다시 섞을 수 없어요');
    return createBracket(t.players.map((p) => p.name), { thirdPlace: t.thirdPlace, rng });
  }

  function decide(t, id, a, b) {
    if (a === null && b === null) return { winner: null, bye: true };
    if (a === null || b === null) {
      const only = a === null ? b : a;
      return { winner: only, bye: true }; // 상대가 빈 자리면 부전승 (한쪽이 아직 모르면 winner 도 모름)
    }
    return { winner: t.results[id]?.winner, bye: false };
  }

  // 라운드별 경기 목록. 앞 라운드 승자가 다음 라운드 자리로 올라간다
  function rounds(t) {
    const out = [];
    let seats = t.slots;
    for (let r = 0; r < roundCount(t); r++) {
      const list = [];
      for (let k = 0; k < seats.length / 2; k++) {
        const id = matchId(r, k);
        const a = seats[2 * k], b = seats[2 * k + 1];
        list.push({ id, round: r, index: k, a, b, ...decide(t, id, a, b) });
      }
      out.push(list);
      seats = list.map((m) => m.winner);
    }
    return out;
  }

  function loserOf(m) {
    if (!m || m.bye || !isPlayer(m.winner)) return undefined;
    return m.winner === m.a ? m.b : m.a;
  }

  // 3·4위전: 준결승 두 경기가 모두 진짜 경기일 때만 (3명이면 준결승 하나가 부전승이라 없음)
  function thirdPlaceMatch(t, all = rounds(t)) {
    if (!t.thirdPlace || all.length < 2) return null;
    const semis = all[all.length - 2];
    if (semis.some((m) => m.bye)) return null;
    const a = loserOf(semis[0]), b = loserOf(semis[1]);
    return { id: THIRD_ID, round: all.length - 1, index: -1, a, b, winner: t.results[THIRD_ID]?.winner, bye: false };
  }

  const playable = (m) => !!m && isPlayer(m.a) && isPlayer(m.b) && m.winner === undefined;

  // 진행 순서: 앞 라운드부터 → 3·4위전 → 결승
  function playOrder(t) {
    const all = rounds(t);
    const final = all[all.length - 1][0];
    const third = thirdPlaceMatch(t, all);
    return [...all.slice(0, -1).flat(), ...(third ? [third] : []), final];
  }

  function nextMatch(t) {
    return playOrder(t).find(playable) || null;
  }

  function findMatch(t, id) {
    return playOrder(t).find((m) => m.id === id) || null;
  }

  function recordResult(t, id, winner, scores) {
    const m = findMatch(t, id);
    if (!playable(m)) throw new Error('지금 할 수 없는 경기예요');
    if (winner !== m.a && winner !== m.b) throw new Error('이 경기의 선수가 아니에요');
    return { ...t, results: { ...t.results, [id]: { winner, scores: [...scores] } } };
  }

  function isFinished(t) {
    const all = rounds(t);
    const final = all[all.length - 1][0];
    const third = thirdPlaceMatch(t, all);
    return isPlayer(final.winner) && (!third || isPlayer(third.winner));
  }

  // 순위: 3·4위전을 했으면 3위·4위 한 명씩, 아니면 준결승에서 진 사람이 공동 3위
  function standings(t) {
    const all = rounds(t);
    const final = all[all.length - 1][0];
    const third = thirdPlaceMatch(t, all);
    const semis = all.length >= 2 ? all[all.length - 2] : [];
    const defined = (list) => list.filter(isPlayer);
    return {
      champion: final.winner,
      runnerUp: loserOf(final),
      third: third ? defined([third.winner]) : defined(semis.map(loserOf)),
      fourth: third ? defined([loserOf(third)]) : [],
    };
  }

  function roundName(t, r) {
    const left = t.size / 2 ** r;
    return left === 2 ? '결승' : `${left}강`;
  }

  function matchLabel(t, m) {
    if (m.id === THIRD_ID) return '3·4위전';
    if (m.round === roundCount(t) - 1) return '결승';
    const order = rounds(t)[m.round].filter((x) => !x.bye && x.index <= m.index).length;
    return `${roundName(t, m.round)} ${order}경기`;
  }

  function playerName(t, id) {
    return isPlayer(id) ? t.players[id]?.name ?? '' : '';
  }

  // 저장해 둔 대진표(localStorage)가 망가지지 않았는지
  function isValid(t) {
    if (!t || typeof t !== 'object') return false;
    const { size, players, slots, results } = t;
    if (![4, 8, 16, 32].includes(size) || !Array.isArray(players) || !Array.isArray(slots) || slots.length !== size) return false;
    if (!results || typeof results !== 'object') return false;
    if (players.length < MIN_PLAYERS || players.length > size) return false;
    if (!players.every((p, i) => p && p.id === i && typeof p.name === 'string')) return false;
    const placed = slots.filter((s) => s !== null);
    if (placed.length !== players.length || new Set(placed).size !== placed.length) return false;
    return placed.every((s) => isPlayer(s) && s >= 0 && s < players.length);
  }

  return {
    MIN_PLAYERS, MAX_PLAYERS,
    createBracket, reshuffle, rounds, thirdPlaceMatch, nextMatch, findMatch, recordResult,
    isFinished, standings, loserOf, roundName, matchLabel, playerName, isValid,
  };
});
