// =============================================================
// 1인 기록전 준비 화면 (팝업이 아닌 한 화면)
//   위: 난이도 → 가운데: 점수 안내(왼쪽) · 랭킹 오늘/전체 TOP 10(오른쪽) → 아래: 닉네임 · [게임 시작]
//   총으로 모든 버튼을 누를 수 있고, 닉네임은 랜덤으로 미리 채워 두며 키보드로 고칠 수도 있다.
//   game.js 의 함수(button·text·panel·drawRulesPanel·startGame …)를 그대로 쓴다.
// =============================================================
const SOLO = {
  rows: 10,          // 랭킹 줄 수
  refresh: 30,       // 이 화면에 머무는 동안 랭킹을 다시 불러오는 간격 (초)
};
const soloNameInput = document.getElementById('solo-name');

const SoloReady = {
  scope: 'today',    // 'today' 오늘 · 'all' 전체
  rows: null,        // null = 불러오는 중, [] = 기록 없음
  failed: false,
  request: 0,        // 늦게 도착한 옛 응답은 버린다
  refreshT: 0,
  openedAt: 0,
  typed: false,      // 키보드로 닉네임을 고쳤는지 (안 고쳤으면 총의 Start(1) 키는 글자 대신 시작)

  // 처음 화면 [1인 기록전] · Space · 결과 화면 [다음 사람]
  open() {
    Sound.init();
    if (nameOpen()) closeNameEntry();
    goTitle();
    game.state = 'solo';
    this.scope = 'today';
    soloNameInput.value = randomNickname();
    this.typed = false;
    this.openedAt = performance.now();
    updateCornerButtons();
    this.load(true);
  },
  isInput(el) { return el === soloNameInput; },
  // 키로 시작: 꾹 누른 키의 반복, 화면이 열린 바로 그 누름(0.4초 안)으로는 시작하지 않는다
  keyStartReady(e) { return !e.repeat && performance.now() - this.openedAt > 400; },
  // 닉네임 칸이 선택된 채 총의 Start(1) 키가 오면: 아직 키보드로 고치지 않았으면 시작으로 본다
  gunStartKey(e) { return (e.code === 'Digit1' || e.code === 'Numpad1') && !this.typed; },

  // reset: 범위·난이도가 바뀌었을 때만 목록을 비우고 '불러오는 중'. 30초 새로 고침은 옛 목록을 둔 채 바꾼다
  load(reset = false) {
    const ticket = ++this.request;
    if (reset) { this.rows = null; this.failed = false; }
    this.refreshT = 0;
    Ranking.top(this.scope, SOLO.rows, 0, rules().game)
      .then((list) => { if (ticket === this.request) { this.rows = list.slice(0, SOLO.rows); this.failed = false; } })
      .catch(() => { if (ticket === this.request && (reset || this.rows === null)) { this.rows = []; this.failed = true; } });
  },
  toggleScope() {
    this.scope = this.scope === 'today' ? 'all' : 'today';
    Sound.tick();
    this.load(true);
  },
  // 난이도를 바꾸면 (setDiffLevel) 랭킹도 그 난이도로
  onDiffChange() { this.load(true); },
  tick(dt) {
    this.refreshT += dt;
    if (this.refreshT >= SOLO.refresh) this.load();
  },

  reroll() {
    soloNameInput.value = randomNickname(soloNameInput.value);
    this.typed = false;
    Sound.tick();
  },
  // 다 지우고 시작하면 랜덤 이름으로
  start() {
    const name = cleanName(soloNameInput.value) || randomNickname();
    soloNameInput.blur();
    soloNameInput.hidden = true;
    startGame('solo', [name]);
  },
};

// ---------- 그리기 ----------
// 화면 높이에 맞춘 세로 자리 (16:9 에서 H ≈ 100U, 4:3 에서는 아래쪽이 넉넉해진다)
// 닉네임·버튼 줄은 판 바로 아래에 붙이되, 화면 아래를 넘지 않게
function soloLayout() {
  const cw = Math.min(W - U * 8, U * 150);
  const gap = U * 3;
  const guideW = cw * 0.58;
  const top = U * 27;
  const nameY = Math.min(H - U * 21, top + U * RULES_PANEL_H + U * 9);
  return {
    cw, gap, guideW, top, nameY,
    rankW: cw - guideW - gap,
    left: W / 2 - cw / 2,
    buttonY: nameY + U * 13.5,
  };
}

const speedWord = (v) => (v < 1 ? '느리게' : v > 1 ? '빠르게' : '보통 빠르기');
const sizeWord = (v) => (v > 1 ? '크게' : v < 1 ? '작게' : '보통 크기');

function drawSoloDifficulty(cx, y) {
  const w = U * 26, h = U * 8, step = w + U * 4;
  DIFF_KEYS.forEach((key, i) => {
    const d = DIFFICULTIES[key];
    const x = cx + (i - 1) * step;
    const on = settings.diffLevel === key;
    button(d.label, x, y, w, h, () => setDiffLevel(key), true, on);
    if (on) { // 고른 난이도는 그 색의 밑줄
      ctx.fillStyle = d.color;
      ctx.fillRect(x - w / 2, y + h / 2 + U * 0.8, w, U * 0.7);
    }
  });
  const d = DIFFICULTIES[settings.diffLevel];
  const pen = d.penalty.miss;
  const line = `${d.label}  ·  가스트 ${speedWord(d.speed)} · ${sizeWord(d.size)}  ·  감점 ${pen > 0 ? `-${pen}점` : '없음'}  ·  가스트의 눈물 ${rewardScoreNow()}점`;
  text(line, cx, y + h / 2 + U * 4.6, fitTextSize(line, U * 2.7, W - U * 10), d.color);
}

function drawSoloRanking(x, y, w, h) {
  const v = SoloReady;
  panel(x, y, w, h, 0.86);
  const d = DIFFICULTIES[settings.diffLevel];
  const head = `${v.scope === 'today' ? '오늘의' : '전체'} ${d.label} TOP ${SOLO.rows}`;
  const btnW = U * 17;
  text(head, x + U * 3, y + U * 5, fitTextSize(head, U * 3.6, w - btnW - U * 8), '#ffcf5a', 'left');
  button(v.scope === 'today' ? '전체 보기' : '오늘 보기', x + w - U * 2.5 - btnW / 2, y + U * 5, btnW, U * 6, () => v.toggleScope());
  const listTop = y + U * 10.5;
  const rowH = (h - U * 12) / SOLO.rows;
  const cx = x + w / 2;
  if (v.rows === null) { text('불러오는 중…', cx, listTop + rowH * 4, U * 3, '#c9a89a'); return; }
  if (v.failed) {
    const msg = '랭킹을 불러오지 못했어요 (인터넷 확인)';
    text(msg, cx, listTop + rowH * 4, fitTextSize(msg, U * 2.8, w - U * 6), '#ff9a8a');
    return;
  }
  if (!v.rows.length) {
    text('아직 기록이 없어요', cx, listTop + rowH * 3.5, U * 3.4, '#ffd9b0');
    text('첫 기록의 주인공이 되어 보세요!', cx, listTop + rowH * 5, U * 3, '#ffe14a');
    return;
  }
  const size = Math.min(rowH * 0.62, U * 3);
  v.rows.forEach((r, i) => {
    const ry = listTop + rowH * (i + 0.5);
    if (i % 2 === 0) { ctx.fillStyle = 'rgba(255, 220, 190, 0.05)'; ctx.fillRect(x + U * 2, ry - rowH / 2, w - U * 4, rowH); }
    const color = MEDAL[i] || '#ffffff';
    text(`${i + 1}`, x + U * 6, ry, size, color);
    text(r.name, x + U * 11, ry, fitTextSize(r.name, size, w - U * 30), color, 'left');
    text(`${r.score}점`, x + w - U * 4, ry, size, '#ffe14a', 'right');
  });
}

// 닉네임 칸(HTML 입력칸)을 캔버스의 그 자리에 맞춰 둔다
function placeSoloInput(x, y, w, h) {
  const s = soloNameInput.style;
  const px = (v) => `${Math.round(v)}px`;
  if (s.left !== px(x)) s.left = px(x);
  if (s.top !== px(y)) s.top = px(y);
  if (s.width !== px(w)) s.width = px(w);
  if (s.height !== px(h)) s.height = px(h);
  const fs = px(h * 0.5);
  if (s.fontSize !== fs) s.fontSize = fs;
}

function drawSoloName(cx, y) {
  const labelW = U * 11, inputW = U * 46, btnW = U * 20, gap = U * 2.5, h = U * 7.5;
  const total = labelW + inputW + btnW + gap * 2;
  const x0 = cx - total / 2;
  text('닉네임', x0 + labelW / 2, y, U * 3.4, '#ffd9b0');
  const ix = x0 + labelW + gap;
  placeSoloInput(ix, y - h / 2, inputW, h);
  button('다른 이름', ix + inputW + gap + btnW / 2, y, btnW, h, () => SoloReady.reroll());
  text('게임이 끝나면 랭킹에 남길 이름을 총으로 다시 고를 수 있어요', cx, y + h / 2 + U * 2.4, U * 2.2, '#c9a89a');
}

function drawSoloButtons(cx, y, time) {
  drawGlow(cx, y, U * 24, '159,232,112', 0.22 + 0.08 * Math.sin(time * 3));
  button('처음 화면', cx - U * 42, y, U * 24, U * 8.5, goTitle);
  button('▶ 게임 시작', cx, y, U * 46, U * 10, () => SoloReady.start(), true, true);
  button(aimLabel(), cx + U * 42, y, U * 24, U * 8.5, toggleAim, true, aimOn());
}

function drawSoloReady(time) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, W, H);
  const L = soloLayout();
  const cx = W / 2;
  // 제목: 가운데. 좁은 화면에서 오른쪽 위 운영 버튼과 겹치면 왼쪽으로
  const title = '1인 기록전', ts = U * 6;
  ctx.font = `bold ${Math.round(ts)}px ${FONT}`;
  const overlap = cx + ctx.measureText(title).width / 2 + U * 2 > cornerLeftPx && cornerBottomPx > 0;
  if (overlap) text(title, L.left, U * 7.5, ts, '#ffcf5a', 'left', { shadow: '#a3200c' });
  else text(title, cx, U * 7.5, ts, '#ffcf5a', 'center', { shadow: '#a3200c' });
  drawSoloDifficulty(cx, U * 15.5);
  drawRulesPanel(L.left + L.guideW / 2, L.top, L.guideW);
  drawSoloRanking(L.left + L.guideW + L.gap, L.top, L.rankW, U * RULES_PANEL_H);
  drawSoloName(cx, L.nameY);
  drawSoloButtons(cx, L.buttonY, time);
}

soloNameInput.addEventListener('input', () => { SoloReady.typed = true; });

// 이 화면이 아닐 때는 닉네임 칸을 숨긴다 (매 프레임, game.js 의 그리기에서)
function syncSoloInput() {
  const show = game.state === 'solo' && !settingsOpen();
  if (soloNameInput.hidden === show) soloNameInput.hidden = !show;
  if (!show && document.activeElement === soloNameInput) soloNameInput.blur();
}
