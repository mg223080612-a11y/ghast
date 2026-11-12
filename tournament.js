// =============================================================
// 토너먼트 모드 — 참가자 입력 창 · 대진표 화면 · 경기 진행 · 우승 발표
//   대진표 계산은 tournament-core.js(전역 Bracket), 그리기·점수·경기는 game.js 의 함수를 그대로 쓴다.
//   경기는 2인 대결과 같은 방식(총 2대, 위쪽 자리 = 1P)이고, 시간은 고정(보너스 시간 없음)이다.
//   비기면 15초 연장전을 승부가 날 때까지 반복한다.
//   진행 상황은 이 PC(localStorage)에 저장되어, 프로그램을 껐다 켜도 처음 화면 [토너먼트 이어하기] 로 이어진다.
// =============================================================
const TOURNAMENT_KEY = 'ghast-shooting-tournament';
const TOURNAMENT = {
  overtime: 15,      // 동점이면 이만큼 연장 (초)
  lock: 1.5,         // 대진표가 뜬 뒤 버튼 잠금 (경기 끝까지 쏘던 총알이 '경기 시작'을 누르지 않게)
  defaultCount: 8,   // 처음 열 때 참가 인원
  defaultSeconds: 40,
  minSeconds: 10,
  maxSeconds: 600,
};

const tEntry = document.getElementById('tournament-entry');
const tForm = document.getElementById('tournament-form');
const tNames = document.getElementById('t-names');
const tHint = document.getElementById('t-hint');
const tCount = tForm.elements.count;
const T_HINT = tHint.textContent;

// 저장 모양: { bracket, seconds, diff, current: { id } | null, last: { id, winner, scores, overtime } | null }
function loadTournament() {
  const d = readJson(TOURNAMENT_KEY, null);
  if (!d || !Bracket.isValid(d.bracket)) return null;
  const seconds = clamp(Math.round(Number(d.seconds)) || TOURNAMENT.defaultSeconds, TOURNAMENT.minSeconds, TOURNAMENT.maxSeconds);
  return { bracket: d.bracket, seconds, diff: diffKeyOf(d.diff), current: d.current ?? null, last: d.last ?? null };
}

// 경기장에 남은 가스트·화염구를 치우고 메뉴 화면으로
function leaveField() {
  game.paused = false;
  game.confirmHome = false;
  banner = null;
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave(true));
}

const Tournament = {
  data: loadTournament(),

  set(next) {
    this.data = next;
    if (next) writeJson(TOURNAMENT_KEY, next);
    else { try { localStorage.removeItem(TOURNAMENT_KEY); } catch { /* 저장 불가 환경 */ } }
  },
  bracket() { return this.data?.bracket; },
  name(id) { return Bracket.playerName(this.bracket(), id); },
  inProgress() { return !!this.data && !Bracket.isFinished(this.data.bracket); },

  // 처음 화면 [토너먼트] · 3 키: 진행 중이면 대진표로, 아니면 참가자 입력
  open() {
    Sound.init();
    if (this.inProgress()) this.showBracket();
    else this.openForm();
  },

  // ---------- 참가자 입력 창 ----------
  formOpen() { return !tEntry.hidden; },
  openForm() {
    Sound.init();
    if (nameOpen()) closeNameEntry();
    if (game.state !== 'title') goTitle();
    tForm.elements.seconds.value = settings.tournamentSeconds;
    tForm.elements.third.checked = settings.tournamentThird;
    // 지난 토너먼트 참가자를 미리 채워 둔다 (같은 반이 한 번 더 할 때 편하게)
    const names = this.data ? this.data.bracket.players.map((p) => p.name) : [];
    tNames.replaceChildren();
    setNameCount(names.length || TOURNAMENT.defaultCount);
    nameInputs().forEach((input, i) => { input.value = names[i] ?? ''; });
    showHint(T_HINT, false);
    updateDiffButtons();
    tEntry.hidden = false;
    setTimeout(() => nameInputs()[0]?.focus(), 0);
  },
  closeForm() { tEntry.hidden = true; },

  create(names, opts) {
    const bracket = Bracket.createBracket(names, { thirdPlace: opts.third });
    this.set({ bracket, seconds: opts.seconds, diff: opts.diff, current: null, last: null });
    Sound.bonus();
    this.showBracket();
  },
  // 첫 경기 전에만: 같은 참가자로 대진을 다시 뽑는다
  reshuffle() {
    if (!this.data) return;
    this.set({ ...this.data, bracket: Bracket.reshuffle(this.data.bracket) });
    Sound.tick();
  },
  // 진행 중인 토너먼트를 버리고 새로 (진행요원 확인)
  startOver() {
    if (this.inProgress() && !confirm('진행 중인 토너먼트를 끝내고 새로 만들까요? 지금 대진표는 사라집니다.')) return;
    this.openForm();
  },

  // ---------- 화면 이동 ----------
  showBracket() {
    leaveField();
    game.state = 'bracket';
    game.resultTime = 0;
    updateCornerButtons();
  },
  showChampion() {
    leaveField();
    game.state = 'champion';
    game.resultTime = 0;
    Sound.reward();
    updateCornerButtons();
  },
  // 경기 결과 화면 → 대진표 (마지막 경기였으면 우승 발표)
  afterResult() {
    if (this.data && Bracket.isFinished(this.data.bracket)) this.showChampion();
    else this.showBracket();
  },

  // ---------- 경기 ----------
  startNextIfReady() {
    if (game.resultTime > TOURNAMENT.lock) this.startNext();
  },
  startNext() {
    const m = this.data && Bracket.nextMatch(this.data.bracket);
    if (!m) { this.showChampion(); return; }
    if (!ensureVersusGuns()) return; // 총 2대가 1P·2P 로 지정돼 있어야 한다 (아니면 총 연결 화면으로)
    this.set({ ...this.data, current: { id: m.id } });
    startGame('tournament', [this.name(m.a), this.name(m.b)], { seconds: this.data.seconds, diff: this.data.diff });
  },
  currentMatch() {
    const id = this.data?.current?.id;
    return id ? Bracket.findMatch(this.data.bracket, id) : null;
  },
  tied() {
    const [a, b] = game.players;
    return !!a && !!b && a.score === b.score;
  },
  startOvertime() {
    game.overtime += 1;
    game.timeLeft = TOURNAMENT.overtime;
    Sound.bonus();
    showBanner('연장전!', `동점이라 ${TOURNAMENT.overtime}초 더 — 끝날 때 앞선 사람이 승리`, '#ff8a7a', 2.6);
  },
  // 경기가 끝나면 (endGame) 승자를 대진표에 넣고 저장한다
  finishMatch() {
    const m = this.currentMatch();
    if (!m) return; // 대진표가 바뀌었으면(새 토너먼트 등) 결과를 넣지 않는다
    banner = null; // 경기 막판의 '연장전!'·'레벨 UP!' 안내가 결과 화면에 겹치지 않게
    const scores = game.players.map((p) => p.score);
    const winner = scores[0] > scores[1] ? m.a : m.b;
    try {
      const bracket = Bracket.recordResult(this.data.bracket, m.id, winner, scores);
      this.set({ ...this.data, bracket, current: null, last: { id: m.id, winner, scores, overtime: game.overtime } });
    } catch (err) {
      reportError(err);
    }
  },

  // ---------- 경기 결과 화면 (game.js 의 2인 대결 결과 화면 안에서 부른다) ----------
  lastMatch() {
    const id = this.data?.last?.id;
    return id ? Bracket.findMatch(this.data.bracket, id) : null;
  },
  resultHeading() {
    const m = this.lastMatch();
    return m ? `${Bracket.matchLabel(this.data.bracket, m)} 종료!` : '경기 종료!';
  },
  resultNote() {
    const m = this.lastMatch();
    if (!m) return '';
    const t = this.data.bracket;
    const finalRound = Math.log2(t.size) - 1;
    const what = m.id === 'THIRD' ? '3위 확정!'
      : m.round === finalRound ? '토너먼트 우승!'
      : `${Bracket.roundName(t, m.round + 1)} 진출!`;
    const ot = this.data.last.overtime;
    return `${this.name(m.winner)} ${what}${ot ? `  (연장 ${ot}번)` : ''}`;
  },
  drawResultButtons(cx, by, ready) {
    if (this.data && Bracket.isFinished(this.data.bracket)) {
      button('우승 발표 ▶', cx - U * 20, by, U * 36, U * 9, () => this.showChampion(), ready, true);
      button('대진표 보기', cx + U * 20, by, U * 36, U * 9, () => this.showBracket(), ready);
      return;
    }
    button('대진표 보기 ▶', cx, by, U * 50, U * 9, () => this.showBracket(), ready, true);
  },

  drawBracketScreen(time) { drawBracketScreen(this, time); },
  drawChampion(time) { drawChampionScreen(this, time); },
};

// ---------- 참가자 입력 창 도우미 ----------
function nameInputs() { return [...tNames.querySelectorAll('input')]; }
function showHint(message, isError) {
  tHint.textContent = message;
  tHint.classList.toggle('error', isError);
}
// 인원 수만큼 이름 칸을 만든다 (이미 쓴 이름은 남긴다)
function setNameCount(n) {
  const count = clamp(Math.round(Number(n)) || TOURNAMENT.defaultCount, Bracket.MIN_PLAYERS, Bracket.MAX_PLAYERS);
  const keep = nameInputs().map((i) => i.value);
  tCount.value = count;
  const labels = Array.from({ length: count }, (_, i) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.maxLength = 12;
    input.spellcheck = false;
    input.placeholder = '빈 칸: 랜덤';
    input.value = keep[i] ?? '';
    label.append(`${i + 1}`, input);
    return label;
  });
  tNames.replaceChildren(...labels);
}
// 같은 이름이 있으면 뒤에 숫자를 붙인다 (판다 → 판다2). 12자를 넘지 않게
function uniqueName(base, used) {
  if (!used.includes(base)) return base;
  for (let k = 2; k <= Bracket.MAX_PLAYERS + 1; k++) {
    const candidate = `${base.slice(0, 12 - String(k).length)}${k}`;
    if (!used.includes(candidate)) return candidate;
  }
  return base;
}
// 칸의 이름을 정리해서 돌려준다. 빈 칸은 랜덤 닉네임
function collectNames() {
  return nameInputs().reduce((used, input) => {
    const typed = cleanName(input.value);
    return [...used, uniqueName(typed || randomNickname(...used), used)];
  }, []);
}

tCount.addEventListener('change', () => setNameCount(tCount.value));
tCount.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  setNameCount(tCount.value);
  nameInputs()[0]?.focus();
});
document.getElementById('t-minus').addEventListener('click', () => setNameCount(Number(tCount.value) - 1));
document.getElementById('t-plus').addEventListener('click', () => setNameCount(Number(tCount.value) + 1));
// 이름 칸에서 Enter: 다음 칸으로, 마지막 칸이면 대진표 만들기
tNames.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || e.target.tagName !== 'INPUT') return;
  e.preventDefault();
  const inputs = nameInputs();
  const next = inputs[inputs.indexOf(e.target) + 1];
  if (next) next.focus();
  else tForm.requestSubmit();
});
document.getElementById('t-random').addEventListener('click', () => {
  const inputs = nameInputs();
  const typed = inputs.map((i) => cleanName(i.value)).filter(Boolean);
  inputs.filter((i) => !cleanName(i.value)).reduce((used, input) => {
    const name = uniqueName(randomNickname(...used), used);
    input.value = name;
    return [...used, name];
  }, typed);
  Sound.tick();
});
document.getElementById('t-cancel').addEventListener('click', () => Tournament.closeForm());
tForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const seconds = clamp(Math.round(Number(tForm.elements.seconds.value)) || TOURNAMENT.defaultSeconds, TOURNAMENT.minSeconds, TOURNAMENT.maxSeconds);
  const third = tForm.elements.third.checked;
  settings = { ...settings, tournamentSeconds: seconds, tournamentThird: third };
  saveSettings();
  try {
    const names = collectNames();
    Tournament.closeForm();
    Tournament.create(names, { seconds, third, diff: settings.diffLevel });
  } catch (err) {
    showHint(err.message, true);
  }
});

// ---------- 대진표 그리기 ----------
// 왼쪽 절반은 왼쪽에서, 오른쪽 절반은 오른쪽에서 가운데 결승(우승 자리)으로 모인다
function bracketLayout(t) {
  const R = Math.log2(t.size);
  const px = U * 3, py = U * 2, pw = W - U * 6, ph = H - U * 4;
  const top = py + U * 15, bottom = py + ph - U * 24.5;
  const colW = (pw - U * 4) / (2 * R + 1);
  const rowH = (bottom - top) / (t.size / 2);
  return {
    R, px, py, pw, ph, top, bottom, colW, rowH,
    left: px + U * 2,
    boxW: colW - U * 3,
    boxH: Math.min(rowH * 0.78, U * 6.5),
    champW: colW - U * 3, // 양옆 결승 진출자 칸과 겹치지 않게 같은 넓이
  };
}
// 자리(라운드 깊이 d 의 k 번째)의 화면 위치. side: -1 왼쪽 · 1 오른쪽 · 0 가운데(우승)
function seatPos(L, t, d, k) {
  if (d === L.R) return { x: L.left + L.colW * (L.R + 0.5), y: (L.top + L.bottom) / 2, side: 0 };
  const half = t.size / 2 ** d / 2;
  const right = k >= half;
  const j = right ? k - half : k;
  const col = right ? 2 * L.R - d : d;
  return { x: L.left + L.colW * (col + 0.5), y: L.top + L.rowH * (j + 0.5) * 2 ** d, side: right ? 1 : -1 };
}
// 그 자리에 앉은 사람 (1라운드는 처음 배정, 그다음부터는 앞 경기의 승자)
function seatOccupant(t, all, d, k) {
  return d === 0 ? t.slots[k] : all[d - 1][k].winner;
}

// 자리 → 다음 라운드 자리를 잇는 ㄱ자 선. 이긴 쪽은 금색
function drawConnector(L, from, to, won) {
  const fromEdge = from.x - from.side * L.boxW / 2;  // 가운데 쪽 모서리
  const toEdge = to.side === 0 ? to.x + from.side * L.champW / 2 : to.x + to.side * L.boxW / 2;
  const midX = (fromEdge + toEdge) / 2;
  ctx.strokeStyle = won ? '#ffd84a' : 'rgba(255, 170, 120, 0.4)';
  ctx.lineWidth = Math.max(2, U * (won ? 0.55 : 0.3));
  ctx.beginPath();
  ctx.moveTo(fromEdge, from.y);
  ctx.lineTo(midX, from.y);
  ctx.lineTo(midX, to.y);
  ctx.lineTo(toEdge, to.y);
  ctx.stroke();
}

const SEAT_TEXT = { tbd: '#8a7a74', lost: '#7a6a66', won: '#ffffff', plain: '#ffd9b0' };
// 이름 칸 하나. state: 'tbd' 미정 · 'lost' 탈락 · 'won' 이긴 경기 · 'next' 다음 경기(1P/2P 색) · 'plain' 아직 안 함
function drawSeatBox(x, y, w, h, seat, time) {
  const { name, score, state, who } = seat;
  const blink = state === 'next' && Math.sin(time * 6) > 0;
  ctx.fillStyle = state === 'next' ? 'rgba(255, 225, 74, 0.16)' : state === 'won' ? 'rgba(255, 216, 74, 0.12)' : 'rgba(255, 220, 190, 0.07)';
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeStyle = state === 'next' ? (blink ? PLAYER_COLORS[who] : 'rgba(255,255,255,0.5)') : state === 'won' ? '#ffd84a' : 'rgba(255, 170, 120, 0.35)';
  ctx.lineWidth = Math.max(1, U * (state === 'next' ? 0.5 : 0.2));
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  const size = Math.min(h * 0.58, U * 3.2);
  const color = state === 'next' ? PLAYER_COLORS[who] : SEAT_TEXT[state];
  const scoreW = score == null ? 0 : U * 5;
  const label = state === 'tbd' ? '?' : name;
  text(label, x - w / 2 + U, y, fitTextSize(label, size, w - U * 2 - scoreW), color, 'left');
  if (score != null) text(String(score), x + w / 2 - U, y, size * 0.9, state === 'lost' ? '#7a6a66' : '#ffe14a', 'right');
}

// 자리 상태: 그 자리에서 치른(치를) 경기를 보고 정한다
function seatState(t, all, d, k, next) {
  const id = seatOccupant(t, all, d, k);
  const name = Bracket.playerName(t, id);
  if (typeof id !== 'number') return { id, name, state: 'tbd', score: null, who: -1 };
  const m = all[d][Math.floor(k / 2)];
  if (next && m.id === next.id) return { id, name, state: 'next', score: null, who: k % 2 };
  if (m.bye || typeof m.winner !== 'number') return { id, name, state: 'plain', score: null, who: -1 };
  const score = t.results[m.id]?.scores?.[k % 2] ?? null;
  return { id, name, state: m.winner === id ? 'won' : 'lost', score, who: -1 };
}

function drawBracketLines(L, t, all) {
  all.forEach((round, r) => round.forEach((m, idx) => {
    const parent = seatPos(L, t, r + 1, idx);
    [2 * idx, 2 * idx + 1].forEach((k) => {
      const id = seatOccupant(t, all, r, k);
      if (id === null) return; // 빈 자리(부전승 상대)는 선을 긋지 않는다
      drawConnector(L, seatPos(L, t, r, k), parent, !m.bye && typeof id === 'number' && m.winner === id);
    });
  }));
}

function drawBracketSeats(L, t, all, next, time) {
  for (let d = 0; d < L.R; d++) {
    const count = t.size / 2 ** d;
    for (let k = 0; k < count; k++) {
      const seat = seatState(t, all, d, k, next);
      if (seat.id === null) continue; // 빈 자리는 그리지 않는다 (상대는 부전승)
      const p = seatPos(L, t, d, k);
      drawSeatBox(p.x, p.y, L.boxW, L.boxH, seat, time);
    }
  }
  // 가운데: 우승 자리
  const c = seatPos(L, t, L.R, 0);
  const champ = all[L.R - 1][0].winner;
  const decided = typeof champ === 'number';
  const h = Math.max(L.boxH, U * 5);
  if (decided) drawCrown(c.x, c.y - h * 1.2, U * 6, time);
  else text('우승', c.x, c.y - h, U * 2.8, '#ffd84a');
  drawSeatBox(c.x, c.y, L.champW, h, { name: Bracket.playerName(t, champ), score: null, state: decided ? 'won' : 'tbd', who: -1 }, time);
}

function drawThirdPlace(L, t, next, time) {
  const m = Bracket.thirdPlaceMatch(t);
  if (!m) return;
  const c = seatPos(L, t, L.R, 0);
  const h = Math.max(L.boxH, U * 4.5);
  const y0 = c.y + U * 13;
  const decided = typeof m.winner === 'number';
  text('3·4위전', c.x, y0 - h, U * 2.8, '#e09a5a');
  [m.a, m.b].forEach((id, i) => {
    const state = typeof id !== 'number' ? 'tbd' : next?.id === m.id ? 'next' : decided ? (m.winner === id ? 'won' : 'lost') : 'plain';
    const score = decided ? t.results[m.id]?.scores?.[i] ?? null : null;
    drawSeatBox(c.x, y0 + i * (h + U), L.champW, h, { name: Bracket.playerName(t, id), score, state, who: i }, time);
  });
}

function drawBracketHeader(L, tour) {
  const t = tour.data.bracket;
  const d = DIFFICULTIES[tour.data.diff];
  text('토너먼트 대진표', W / 2, L.py + U * 5.5, U * 6, '#ffcf5a', 'center', { shadow: '#a3200c' });
  const info = `${t.players.length}명  ·  난이도 ${d.label}  ·  한 경기 ${timeLabel(tour.data.seconds)} (동점이면 ${TOURNAMENT.overtime}초 연장)  ·  3·4위전 ${Bracket.thirdPlaceMatch(t) ? '있음' : '없음'}`;
  text(info, W / 2, L.py + U * 11, fitTextSize(info, U * 2.6, L.pw - U * 6), '#ffd9b0');
}

function drawBracketFooter(L, tour, next) {
  const t = tour.data.bracket;
  const cx = W / 2, fy = L.py + L.ph - U * 21.5, by = L.py + L.ph - U * 6.5;
  const ready = game.resultTime > TOURNAMENT.lock;
  if (!next) {
    text('모든 경기가 끝났어요!', cx, fy + U * 3, U * 4.4, '#ffe14a');
    button('우승 발표 ▶', cx - U * 20, by, U * 36, U * 8.5, () => tour.showChampion(), ready, true);
    button('새 토너먼트', cx + U * 20, by, U * 36, U * 8.5, () => tour.startOver(), ready);
    return;
  }
  text(`다음 경기  ·  ${Bracket.matchLabel(t, next)}`, cx, fy, U * 3.2, '#ffcf5a');
  const size = U * 4.6, a = `1P ${tour.name(next.a)}`, b = `2P ${tour.name(next.b)}`;
  text(a, cx - U * 6, fy + U * 5.5, fitTextSize(a, size, W * 0.4), PLAYER_COLORS[0], 'right');
  text('VS', cx, fy + U * 5.5, size, '#ff8a3a');
  text(b, cx + U * 6, fy + U * 5.5, fitTextSize(b, size, W * 0.4), PLAYER_COLORS[1], 'left');
  if (Object.keys(t.results).length === 0) button('대진 다시 섞기', cx - U * 40, by, U * 32, U * 8.5, () => tour.reshuffle(), ready);
  button('경기 시작 ▶', cx, by, U * 40, U * 8.5, () => tour.startNext(), ready, true);
  button('새 토너먼트', cx + U * 40, by, U * 32, U * 8.5, () => tour.startOver(), ready);
}

function drawBracketScreen(tour, time) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  if (!tour.data) { goTitle(); return; }
  const t = tour.data.bracket;
  const L = bracketLayout(t);
  panel(L.px, L.py, L.pw, L.ph, 0.88);
  const all = Bracket.rounds(t);
  const next = Bracket.nextMatch(t);
  drawBracketHeader(L, tour);
  drawBracketLines(L, t, all);
  drawBracketSeats(L, t, all, next, time);
  drawThirdPlace(L, t, next, time);
  drawBracketFooter(L, tour, next);
}

// ---------- 우승 발표 ----------
function drawChampionScreen(tour, time) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  if (!tour.data) { goTitle(); return; }
  const t = tour.data.bracket;
  const s = Bracket.standings(t);
  const cx = W / 2, pw = Math.min(W - U * 8, U * 120), ph = Math.min(H - U * 4, U * 92);
  const py = (H - ph) / 2;
  panel(cx - pw / 2, py, pw, ph, 0.88);
  text('토너먼트 우승!', cx, py + U * 8, U * 7, '#ffcf5a', 'center', { shadow: '#a3200c' });
  const cy = py + U * 34;
  drawGlow(cx, cy, U * 30, '255,216,74', 0.35);
  drawCrown(cx, cy - U * 13, U * 16, time);
  const champ = tour.name(s.champion);
  text(champ, cx, cy + U * 2, fitTextSize(champ, U * 13, pw - U * 12), '#ffd84a', 'center', { shadow: '#a3200c' });
  drawSparkles(cx - pw * 0.35, cy - U * 20, pw * 0.7, U * 30, time, 22, 7);
  const names = (ids) => ids.map((id) => tour.name(id)).join(' · ');
  const lines = [
    [`준우승  ${tour.name(s.runnerUp)}`, MEDAL[1]],
    s.third.length ? [`${s.third.length > 1 ? '공동 3위' : '3위'}  ${names(s.third)}`, MEDAL[2]] : null,
    s.fourth.length ? [`4위  ${names(s.fourth)}`, '#c9a89a'] : null,
  ].filter(Boolean);
  lines.forEach(([str, color], i) => text(str, cx, cy + U * (16 + i * 6), fitTextSize(str, U * 4.4, pw - U * 10), color));
  const d = DIFFICULTIES[tour.data.diff];
  text(`${t.players.length}명 참가  ·  난이도 ${d.label}  ·  총 ${Object.keys(t.results).length}경기`, cx, py + ph - U * 17, U * 2.8, '#c9a89a');
  const ready = game.resultTime > RESULT_LOCK;
  const by = py + ph - U * 8;
  button('대진표 보기', cx - U * 33, by, U * 29, U * 9, () => tour.showBracket(), ready);
  button('새 토너먼트', cx, by, U * 29, U * 9, () => tour.openForm(), ready, true);
  button('처음 화면', cx + U * 33, by, U * 29, U * 9, goTitle, ready);
}
