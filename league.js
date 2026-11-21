// =============================================================
// 리그 화면 — 순위표(1위부터 차례로 나타남) · 경기 결과 문구 · 리그 우승 발표
//   계산은 league-core.js(전역 League), 진행은 tournament.js 의 Tournament 가 맡는다.
//   한 판이 끝나면 결과 화면을 잠깐 보여 준 뒤 순위표로 넘어가고, 방금 경기한 두 사람의 이번 판 점수와
//   순위 변화(▲▼)를 함께 보여 준다. 다음 경기는 순위표 아래에서 시작한다.
// =============================================================
const LEAGUE = {
  resultHold: 6,     // 경기 결과 화면을 이만큼 보여 준 뒤 순위표로 (초)
  rowReveal: 0.15,   // 순위표 한 줄이 나타나는 간격 (초)
  revealPause: 0.8,  // 다 나타난 뒤 다음 경기 안내까지 (초)
  oneColumnMax: 12,  // 이 인원까지는 한 줄로, 넘으면 두 줄로 나눠 그린다
};
const RANK_UP = '#7dff8a', RANK_DOWN = '#ff8a7a';

// ---------- 경기 결과 화면 문구 ----------
function leagueResultHeading(tour) {
  const m = tour.lastMatch();
  return m ? `리그전 ${m.index + 1}경기 종료!` : '경기 종료!';
}
function leagueResultNote(tour) {
  const lg = tour.data.league;
  const left = League.matches(lg).filter((m) => !m.done).length;
  return left ? `남은 경기 ${left}  ·  순위는 점수 합계로` : '모든 경기 끝! 최종 순위를 확인하세요';
}
function drawLeagueResultButtons(tour, cx, by, ready) {
  const wait = Math.max(0, Math.ceil(LEAGUE.resultHold - game.resultTime));
  button(`순위표 보기 ▶${wait ? ` (${wait})` : ''}`, cx, by, U * 50, U * 9, () => tour.afterResult(), ready, true);
}

// ---------- 순위표 ----------
// 순위표가 '방금 끝난 경기' 뒤에 열렸으면 1위부터 한 줄씩 나타난다
function revealProgress(tour) {
  if (!tour.reveal) return { rows: Infinity, done: true };
  const rows = Math.floor(game.resultTime / LEAGUE.rowReveal) + 1;
  const n = tour.data.league.players.length;
  return { rows, done: game.resultTime > n * LEAGUE.rowReveal + LEAGUE.revealPause };
}

function leagueTableLayout(n, L) {
  const cols = n > LEAGUE.oneColumnMax ? 2 : 1;
  const perCol = Math.ceil(n / cols);
  const gap = U * 4;
  const colW = Math.min((L.pw - U * 8 - gap * (cols - 1)) / cols, U * 90);
  const totalW = colW * cols + gap * (cols - 1);
  const headH = U * 3.4;
  const rowH = Math.min((L.bottom - L.top - headH) / perCol, U * 5.2);
  return { cols, perCol, gap, colW, left: W / 2 - totalW / 2, headH, rowH };
}

// 표 한 칸의 x 위치 (칸 넓이에 대한 비율)
const LEAGUE_COLS = { rank: 0.05, move: 0.11, name: 0.17, played: 0.52, now: 0.67, total: 0.84, best: 0.97 };

function drawLeagueHead(x, y, w) {
  const c = '#c9a89a', s = U * 2.2;
  text('순위', x + w * LEAGUE_COLS.rank, y, s, c);
  text('이름', x + w * LEAGUE_COLS.name, y, s, c, 'left');
  text('판', x + w * LEAGUE_COLS.played, y, s, c);
  text('이번 판', x + w * LEAGUE_COLS.now, y, s, c);
  text('합계', x + w * LEAGUE_COLS.total, y, s, c, 'right');
  text('최고', x + w * LEAGUE_COLS.best, y, s, c, 'right');
}

// 한 사람 줄. info: { justPlayed: 0|1|-1(1P/2P), now: 이번 판 점수, move: 순위 변화, next: 다음 경기 자리 0|1|-1 }
function drawLeagueRow(x, y, w, h, row, games, info, time) {
  const hot = info.justPlayed >= 0;
  ctx.fillStyle = hot ? 'rgba(255, 216, 74, 0.16)' : 'rgba(255, 220, 190, 0.06)';
  ctx.fillRect(x, y - h * 0.45, w, h * 0.9);
  if (hot || info.next >= 0) {
    const who = hot ? info.justPlayed : info.next;
    const blink = !hot && Math.sin(time * 6) > 0;
    ctx.strokeStyle = blink ? 'rgba(255,255,255,0.5)' : PLAYER_COLORS[who];
    ctx.lineWidth = Math.max(1, U * 0.4);
    ctx.strokeRect(x, y - h * 0.45, w, h * 0.9);
  }
  const size = Math.min(h * 0.62, U * 3.2);
  const rankColor = MEDAL[row.rank - 1] || '#ffd9b0';
  text(String(row.rank), x + w * LEAGUE_COLS.rank, y, size, rankColor);
  if (info.move) text(info.move > 0 ? `▲${info.move}` : `▼${-info.move}`, x + w * LEAGUE_COLS.move, y, size * 0.62, info.move > 0 ? RANK_UP : RANK_DOWN);
  const nameColor = hot ? PLAYER_COLORS[info.justPlayed] : '#ffffff';
  text(row.name, x + w * LEAGUE_COLS.name, y, fitTextSize(row.name, size, w * (LEAGUE_COLS.played - LEAGUE_COLS.name - 0.05)), nameColor, 'left');
  text(`${row.played}/${games}`, x + w * LEAGUE_COLS.played, y, size * 0.85, row.played === games ? '#c9a89a' : '#ffd9b0');
  if (hot) text(`${info.now}점`, x + w * LEAGUE_COLS.now, y, size, '#ffe14a');
  else if (info.next >= 0) text('다음', x + w * LEAGUE_COLS.now, y, size * 0.8, PLAYER_COLORS[info.next]);
  text(`${row.total}`, x + w * LEAGUE_COLS.total, y, size * 1.05, '#ffe14a', 'right');
  text(`${row.best}`, x + w * LEAGUE_COLS.best, y, size * 0.85, '#ffd9b0', 'right');
}

// 사람마다 표에 덧붙일 정보 (방금 경기·이번 판 점수·순위 변화·다음 경기)
function leagueRowInfo(tour, rows, next) {
  const last = tour.data.last;
  const lastMatch = tour.lastMatch();
  const prev = tour.reveal ? last?.prevRanks : null;
  return Object.fromEntries(rows.map((row) => {
    const justPlayed = tour.reveal && lastMatch ? [lastMatch.a, lastMatch.b].indexOf(row.id) : -1;
    const nextPos = next ? [next.a, next.b].indexOf(row.id) : -1;
    const before = prev?.[row.id];
    return [row.id, {
      justPlayed,
      now: justPlayed >= 0 ? lastMatch.scores[justPlayed] : null,
      move: justPlayed >= 0 && typeof before === 'number' ? before - row.rank : 0, // 방금 경기한 두 사람만
      next: nextPos,
    }];
  }));
}

function drawLeagueTable(L, tour, rows, next, time) {
  const lg = tour.data.league;
  const T = leagueTableLayout(rows.length, L);
  const info = leagueRowInfo(tour, rows, next);
  const reveal = revealProgress(tour);
  for (let c = 0; c < T.cols; c++) {
    const x = T.left + c * (T.colW + T.gap);
    drawLeagueHead(x, L.top + T.headH / 2, T.colW);
    rows.slice(c * T.perCol, (c + 1) * T.perCol).forEach((row, j) => {
      const order = c * T.perCol + j;
      if (order >= reveal.rows) return;
      const y = L.top + T.headH + T.rowH * (j + 0.5);
      drawLeagueRow(x, y, T.colW, T.rowH, row, lg.games, info[row.id], time);
    });
  }
}

function drawLeagueHeader(L, tour) {
  const lg = tour.data.league;
  const d = DIFFICULTIES[tour.data.diff];
  const done = Object.keys(lg.results).length;
  text(lg.solo ? '기록전 대회 순위표' : '리그전 순위표', W / 2, L.py + U * 9, U * 6, '#ffcf5a', 'center', { shadow: '#a3200c' });
  const info = lg.solo
    ? `${lg.players.length}명  ·  한 사람씩 1인 기록전 ${lg.games}판  ·  난이도 ${d.label}  ·  한 판 ${timeLabel(tour.data.seconds)}  ·  ${done}/${lg.matches.length}번  ·  순위: 합계 → 최고 한 판`
    : `${lg.players.length}명  ·  한 사람당 ${lg.games}판  ·  난이도 ${d.label}  ·  한 경기 ${timeLabel(tour.data.seconds)}  ·  ${done}/${lg.matches.length}경기  ·  순위: 합계 → 최고 한 판`;
  text(info, W / 2, L.py + U * 14.5, fitTextSize(info, U * 2.6, L.pw - U * 6), '#ffd9b0');
}

function drawLeagueFooter(L, tour, next, revealed) {
  const lg = tour.data.league;
  const cx = W / 2, fy = L.py + L.ph - U * 21.5, by = L.py + L.ph - U * 6.5;
  const ready = revealed && game.resultTime > TOURNAMENT.lock;
  if (!revealed) return;
  if (!next) {
    text('모든 경기가 끝났어요!', cx, fy + U * 3, U * 4.4, '#ffe14a');
    button('최종 순위 발표 ▶', cx - U * 20, by, U * 36, U * 8.5, () => tour.showChampion(), ready, true);
    button('새 대회', cx + U * 20, by, U * 36, U * 8.5, () => tour.startOver(), ready);
    return;
  }
  if (lg.solo) { // 기록전 대회: 다음 차례 한 사람
    text(`다음 차례  ·  ${League.matchLabel(lg, next)}`, cx, fy, U * 3.2, '#ffcf5a');
    const who = tour.name(next.a);
    text(who, cx, fy + U * 5.5, fitTextSize(who, U * 5.4, W * 0.6), PLAYER_COLORS[0]);
    if (Object.keys(lg.results).length === 0) button('순서 다시 섞기', cx - U * 40, by, U * 32, U * 8.5, () => tour.reshuffle(), ready);
    button('게임 시작 ▶', cx, by, U * 40, U * 8.5, () => tour.startNext(), ready, true);
    button('새 대회', cx + U * 40, by, U * 32, U * 8.5, () => tour.startOver(), ready);
    return;
  }
  text(`다음 경기  ·  ${League.matchLabel(lg, next)}`, cx, fy, U * 3.2, '#ffcf5a');
  const size = U * 4.6, a = `1P ${tour.name(next.a)}`, b = `2P ${tour.name(next.b)}`;
  text(a, cx - U * 6, fy + U * 5.5, fitTextSize(a, size, W * 0.4), PLAYER_COLORS[0], 'right');
  text('VS', cx, fy + U * 5.5, size, '#ff8a3a');
  text(b, cx + U * 6, fy + U * 5.5, fitTextSize(b, size, W * 0.4), PLAYER_COLORS[1], 'left');
  if (Object.keys(lg.results).length === 0) button('대진 다시 섞기', cx - U * 40, by, U * 32, U * 8.5, () => tour.reshuffle(), ready);
  button('경기 시작 ▶', cx, by, U * 40, U * 8.5, () => tour.startNext(), ready, true);
  button('새 대회', cx + U * 40, by, U * 32, U * 8.5, () => tour.startOver(), ready);
}

function leagueLayout() {
  const px = U * 3, py = U * 2, pw = W - U * 6, ph = H - U * 4;
  return { px, py, pw, ph, top: py + U * 19, bottom: py + ph - U * 24.5 };
}

function drawLeagueScreen(tour, time) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  const L = leagueLayout();
  panel(L.px, L.py, L.pw, L.ph, 0.88);
  const lg = tour.data.league;
  const rows = League.standings(lg);
  const next = League.nextMatch(lg);
  const { done } = revealProgress(tour);
  drawLeagueHeader(L, tour);
  drawLeagueTable(L, tour, rows, done ? next : null, time);
  drawLeagueFooter(L, tour, next, done);
}

// 순위표가 다 나타나기 전에는 Space·총으로 경기를 시작하지 않는다
function leagueRevealDone(tour) {
  return revealProgress(tour).done;
}

// ---------- 리그 우승 발표 ----------
function drawLeagueChampion(tour, time) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  const lg = tour.data.league;
  const rows = League.standings(lg);
  const byRank = (r) => rows.filter((row) => row.rank === r);
  const firsts = byRank(1);
  const cx = W / 2, pw = Math.min(W - U * 8, U * 120), ph = U * 90;
  const py = panelTopBelowCorner(ph);
  panel(cx - pw / 2, py, pw, ph, 0.88);
  const kind = lg.solo ? '기록전 대회' : '리그전';
  text(firsts.length > 1 ? `${kind} 공동 우승!` : `${kind} 우승!`, cx, py + U * 8, U * 7, '#ffcf5a', 'center', { shadow: '#a3200c' });
  const cy = py + U * 34;
  drawGlow(cx, cy, U * 30, '255,216,74', 0.35);
  drawCrown(cx, cy - U * 13, U * 16, time);
  const champ = firsts.map((r) => r.name).join(' · ');
  text(champ, cx, cy + U * 2, fitTextSize(champ, U * 13, pw - U * 12), '#ffd84a', 'center', { shadow: '#a3200c' });
  drawSparkles(cx - pw * 0.35, cy - U * 20, pw * 0.7, U * 30, time, 22, 7);
  text(`합계 ${firsts[0].total}점  ·  최고 한 판 ${firsts[0].best}점`, cx, cy + U * 12, U * 3.2, '#ffe14a');
  // 우승 다음 두 순위 (공동이면 한 줄에)
  const shown = [...new Set(rows.map((r) => r.rank))].filter((r) => r > 1).slice(0, 2);
  shown.forEach((r, i) => {
    const list = byRank(r);
    const str = `${list.length > 1 ? '공동 ' : ''}${r}위  ${list.map((x) => x.name).join(' · ')}  (${list[0].total}점)`;
    text(str, cx, cy + U * (19 + i * 6), fitTextSize(str, U * 4.2, pw - U * 10), MEDAL[r - 1] || '#c9a89a');
  });
  const d = DIFFICULTIES[tour.data.diff];
  text(`${lg.players.length}명 참가  ·  한 사람당 ${lg.games}판  ·  난이도 ${d.label}  ·  총 ${lg.matches.length}${lg.solo ? '판' : '경기'}`, cx, py + ph - U * 17, U * 2.8, '#c9a89a');
  const ready = game.resultTime > RESULT_LOCK;
  const by = py + ph - U * 8;
  button('순위표 보기', cx - U * 17, by, U * 30, U * 9, () => tour.showBracket(), ready);
  button('새 대회', cx + U * 17, by, U * 30, U * 9, () => tour.openPick(), ready, true);
}
