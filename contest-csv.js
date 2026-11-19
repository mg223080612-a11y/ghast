// =============================================================
// 대회 결과 CSV 만들기 (화면과 상관없는 순수 계산) — 대회 관리 창의 [결과 저장]
//   엑셀에서 한글이 깨지지 않게 BOM 으로 시작하고, 줄바꿈은 \r\n.
//   이름이 = + - @ 로 시작하면 엑셀이 수식으로 실행하지 않게 앞에 작은따옴표를 붙인다.
//   게임(index.html)에서는 전역 ContestCsv 로 (Bracket·League 전역을 씀), 테스트(node)에서는 require 로 쓴다.
// =============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./tournament-core.js'), require('./league-core.js'));
  } else {
    root.ContestCsv = factory(root.Bracket, root.League);
  }
})(typeof self !== 'undefined' ? self : this, function (Bracket, League) {
  const BOM = '﻿';
  const EOL = '\r\n';

  // 칸 하나. 숫자는 그대로, 글자는 수식 막기 → 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸기
  function cell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    const safe = /^[=+\-@\t\r]/.test(String(value)) ? `'${value}` : String(value);
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }
  const line = (cells) => cells.map(cell).join(',');
  const toCsv = (rows) => BOM + rows.map(line).join(EOL) + EOL;
  const header = (title, date, kind) => [['대회', title], ['날짜', date], ['방식', kind], []];

  // ---------- 토너먼트 ----------
  function bracketRanks(t) {
    if (!Bracket.isFinished(t)) return [['진행 중 (아직 끝나지 않음)']];
    const s = Bracket.standings(t);
    const name = (id) => Bracket.playerName(t, id);
    return [
      [1, name(s.champion)],
      [2, name(s.runnerUp)],
      ...s.third.map((id) => [3, name(id)]),
      ...s.fourth.map((id) => [4, name(id)]),
    ];
  }
  function bracketMatches(t) {
    const all = Bracket.rounds(t);
    const third = Bracket.thirdPlaceMatch(t, all);
    const final = all[all.length - 1][0];
    const order = [...all.slice(0, -1).flat(), ...(third ? [third] : []), final];
    const name = (id) => Bracket.playerName(t, id);
    // 저절로 정해진 3·4위전(준결승 기권자가 나옴)은 결과가 저장되지 않아서 경기의 autoForfeit 로 적는다
    return order.filter((m) => !m.bye && (t.results[m.id] || m.autoForfeit !== undefined)).map((m) => {
      const r = t.results[m.id] || { winner: m.winner, scores: null, forfeit: m.autoForfeit };
      const note = r.forfeit !== undefined ? `${name(r.forfeit)} 기권` : '';
      return [Bracket.matchLabel(t, m), name(m.a), name(m.b), r.scores?.[0] ?? '', r.scores?.[1] ?? '', name(r.winner), note];
    });
  }
  function bracketCsv(t, { title = '가스트 사격 토너먼트', date = '' } = {}) {
    return toCsv([
      ...header(title, date, `토너먼트 (${t.players.length}명)`),
      ['순위', '이름'],
      ...bracketRanks(t),
      [],
      ['경기', '1P', '2P', '1P 점수', '2P 점수', '승자', '비고'],
      ...bracketMatches(t),
    ]);
  }

  // ---------- 리그전 ----------
  function leagueCsv(lg, { title = '가스트 사격 리그전', date = '' } = {}) {
    const name = (id) => League.playerName(lg, id);
    const ranks = League.standings(lg).map((r) => [r.rank, r.name, r.played, r.total, r.best, r.wins, r.draws, r.losses, r.withdrawn ? '기권' : '']);
    const games = League.matches(lg).filter((m) => m.done).map((m) => [
      `${m.index + 1}경기`, name(m.a), name(m.b), m.scores[0], m.scores[1],
      m.forfeit !== undefined ? `${name(m.forfeit)} 기권 (상대는 한 판 평균 점수)` : '',
    ]);
    const status = League.isFinished(lg) ? '' : ' — 진행 중';
    return toCsv([
      ...header(title, date, `리그전 (${lg.players.length}명, 한 사람당 ${lg.games}판)${status}`),
      ['순위', '이름', '경기 수', '합계', '최고 한 판', '승', '무', '패', '비고'],
      ...ranks,
      [],
      ['경기', '1P', '2P', '1P 점수', '2P 점수', '비고'],
      ...games,
    ]);
  }

  return { cell, bracketCsv, leagueCsv };
});
