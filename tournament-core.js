// =============================================================
// 토너먼트 대진표 계산 (화면 그리기와 상관없는 순수 계산)
//   게임(index.html)에서는 전역 Bracket 으로, 테스트(node)에서는 require 로 쓴다.
//
// 방식: 라운드마다 남은 사람끼리 모두 짝을 짓는다 (20명 → 첫 판 10경기).
//   사람 수가 홀수인 라운드에서만 한 명이 쉬고(부전승) 올라가며, 이미 쉰 쪽은 되도록 다시 쉬지 않는다.
//   예) 20명: 20 → 10 → 5(2경기 + 1명 쉼) → 3(준결승 1경기 + 1명 쉼) → 결승
//
// 대진표 = { format: 2, players: [{ id, name }], order: [선수 id], results: { 경기 id: { winner, scores } }, thirdPlace }
//   order : 1라운드 자리 순서 (무작위). 라운드 짜임은 인원 수만으로 정해진다 (plan)
//   결과를 넣을 때마다 원래 대진표는 그대로 두고 새 대진표를 돌려준다.
// 경기 = { id: 'R라운드-순번' | 'THIRD', round, index, a, b, winner, bye, src }
//   a·b·winner: 선수 id, null(부전승이라 상대 없음), undefined(아직 모름). a(위쪽) 가 1P, b(아래쪽) 가 2P
//   src: 앞 라운드(1라운드는 order)의 몇 번째 자리에서 왔는지. 부전승은 한 자리
// =============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Bracket = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 32;
  const FORMAT = 2; // 1 = 예전 방식(2의 거듭제곱 칸 + 첫 판 부전승)
  const THIRD_ID = 'THIRD';

  const matchId = (round, index) => `R${round}-${index}`;
  const isPlayer = (v) => typeof v === 'number';

  // 홀수 라운드에서 쉴 자리: 짝을 깨지 않게 짝수 번째 자리 중, 아직 안 쉰 쪽의 맨 뒤
  function pickBye(hadBye) {
    const evens = hadBye.map((_, i) => i).filter((i) => i % 2 === 0);
    const fresh = evens.filter((i) => !hadBye[i]);
    const pool = fresh.length ? fresh : evens;
    return pool[pool.length - 1];
  }

  // 인원 n 의 라운드 짜임: 라운드마다 [{ src: [자리, 자리] } 경기 | { src: [자리] } 부전승]
  const planCache = new Map();
  function plan(n) {
    if (planCache.has(n)) return planCache.get(n);
    const out = [];
    let hadBye = Array.from({ length: n }, () => false);
    while (hadBye.length > 1) {
      const byeAt = hadBye.length % 2 ? pickBye(hadBye) : -1;
      const entries = [];
      for (let i = 0; i < hadBye.length; i += i === byeAt ? 1 : 2) {
        entries.push({ src: i === byeAt ? [i] : [i, i + 1] });
      }
      const prev = hadBye;
      hadBye = entries.map((e) => e.src.length === 1 || e.src.some((k) => prev[k]));
      out.push(entries);
    }
    planCache.set(n, out);
    return out;
  }

  const roundCount = (t) => plan(t.order.length).length;

  function shuffled(list, rng) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function createBracket(names, { thirdPlace = true, rng = Math.random } = {}) {
    if (!Array.isArray(names) || names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
      throw new Error(`참가 인원은 ${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 해요`);
    }
    const players = names.map((name, id) => ({ id, name: String(name) }));
    const order = shuffled(players.map((p) => p.id), rng);
    return { format: FORMAT, players, order, results: {}, thirdPlace: !!thirdPlace };
  }

  // 첫 경기 전에만: 같은 참가자로 대진을 다시 뽑는다
  function reshuffle(t, rng = Math.random) {
    if (Object.keys(t.results).length) throw new Error('이미 경기를 시작해서 다시 섞을 수 없어요');
    return createBracket(t.players.map((p) => p.name), { thirdPlace: t.thirdPlace, rng });
  }

  // 라운드별 경기 목록. 앞 라운드 승자가 다음 라운드 자리로 올라간다
  function rounds(t) {
    let seats = t.order;
    return plan(t.order.length).map((entries, r) => {
      const list = entries.map((e, index) => {
        const id = matchId(r, index);
        const bye = e.src.length === 1;
        const a = seats[e.src[0]];
        const b = bye ? null : seats[e.src[1]];
        const winner = bye ? a : t.results[id]?.winner;
        return { id, round: r, index, a, b, winner, bye, src: [...e.src] };
      });
      seats = list.map((m) => m.winner);
      return list;
    });
  }

  // 그 자리로 올라온 마지막 진짜 경기 (부전승을 거슬러 내려간다). 처음부터 쉬어 올라왔으면 null
  function realMatchBehind(all, round, index) {
    let i = index;
    for (let r = round; r >= 0; r--) {
      const m = all[r][i];
      if (!m.bye) return m;
      i = m.src[0];
    }
    return null;
  }

  // 결승에 오른 두 사람이 마지막으로 이긴 경기 (진 사람이 3위 후보)
  function semiMatches(all) {
    if (all.length < 2) return [];
    const final = all[all.length - 1][0];
    return final.src.map((k) => realMatchBehind(all, all.length - 2, k));
  }

  function loserOf(m) {
    if (!m || m.bye || !isPlayer(m.winner)) return undefined;
    return m.winner === m.a ? m.b : m.a;
  }

  // 3·4위전: 결승 진출자 두 사람 모두 앞에서 진짜 경기를 이겼을 때만 (3명이면 한 명이 쉬고 올라와서 없음)
  function thirdPlaceMatch(t, all = rounds(t)) {
    if (!t.thirdPlace) return null;
    const semis = semiMatches(all);
    if (semis.length < 2 || semis.some((m) => !m)) return null;
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

  // 결과 취소: 그 경기 결과만 뺀 새 대진표. 뒤 경기가 이 결과에 기대므로 가장 최근 결과에만 쓴다
  function undoResult(t, id) {
    if (!Object.hasOwn(t.results, id)) throw new Error('결과가 없는 경기라 취소할 수 없어요');
    const { [id]: _removed, ...rest } = t.results;
    return { ...t, results: rest };
  }

  function isFinished(t) {
    const all = rounds(t);
    const final = all[all.length - 1][0];
    const third = thirdPlaceMatch(t, all);
    return isPlayer(final.winner) && (!third || isPlayer(third.winner));
  }

  // 순위: 3·4위전을 했으면 3위·4위 한 명씩, 아니면 결승 진출자에게 마지막으로 진 사람이 공동 3위
  function standings(t) {
    const all = rounds(t);
    const final = all[all.length - 1][0];
    const third = thirdPlaceMatch(t, all);
    const semis = semiMatches(all).filter(Boolean);
    const defined = (list) => list.filter(isPlayer);
    return {
      champion: final.winner,
      runnerUp: loserOf(final),
      third: third ? defined([third.winner]) : defined(semis.map(loserOf)),
      fourth: third ? defined([loserOf(third)]) : [],
    };
  }

  // 라운드 이름: 남은 사람이 2의 거듭제곱이면 N강, 결승 바로 앞은 준결승, 나머지는 N라운드
  function roundName(t, r) {
    const steps = plan(t.order.length);
    const left = r === 0 ? t.order.length : (steps[r - 1] || []).length;
    if (r >= steps.length - 1) return '결승';
    if ((left & (left - 1)) === 0) return `${left}강`;
    if (r === steps.length - 2) return '준결승';
    return `${r + 1}라운드`;
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

  // 저장해 둔 대진표(localStorage)가 망가지지 않았는지. 예전 방식 저장본은 이어 할 수 없다
  function isValid(t) {
    if (!t || typeof t !== 'object' || t.format !== FORMAT) return false;
    const { players, order, results } = t;
    if (!Array.isArray(players) || !Array.isArray(order) || !results || typeof results !== 'object') return false;
    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS || order.length !== players.length) return false;
    if (!players.every((p, i) => p && p.id === i && typeof p.name === 'string')) return false;
    if (new Set(order).size !== order.length) return false;
    return order.every((s) => isPlayer(s) && s >= 0 && s < players.length);
  }

  return {
    MIN_PLAYERS, MAX_PLAYERS,
    createBracket, reshuffle, rounds, roundCount, thirdPlaceMatch, nextMatch, findMatch, recordResult, undoResult,
    isFinished, standings, loserOf, roundName, matchLabel, playerName, isValid,
  };
});
