// 가스트 사격 — 보이고 들리는 효과 (v3.1.0): 화염구 떨어질 자리·화면 금·충전 꺾쇠(픽셀 격자), 첫 화염구 안내, 연속 명중, TIME UP!, 결과 점수 올라가기
// 모두 점수·판정과 상관없다 (보여 주기·소리만). 계산은 fx-core.js(FxCore), 여기는 그리기와 상태.
// index.html 이 game.js 다음에 차례로 불러오며, 이름(함수·변수)을 모두 함께 쓴다.
'use strict';

// ---------- 픽셀 격자 ----------
// 효과는 모두 격자(한 칸 = FxCore.pixelCell(U) px) 단위의 사각형으로 그린다 (부드러운 선·원 대신 픽셀 그림처럼)
const cellPx = () => FxCore.pixelCell(U);
const circleCache = new Map(); // 반지름(칸) → 둘레 칸 목록
function circleCells(r) {
  let cells = circleCache.get(r);
  if (!cells) {
    cells = FxCore.gridCircle(r);
    if (circleCache.size > 200) circleCache.clear();
    circleCache.set(r, cells);
  }
  return cells;
}
function fillCells(cells, gx, gy, P, color) {
  ctx.fillStyle = color;
  for (const [x, y] of cells) ctx.fillRect((gx + x) * P, (gy + y) * P, P, P);
}

// ---------- 화염구가 떨어질 자리 · 화면 금 ----------
// 날아오는 화염구마다 화면에 닿을 자리(tx, ty)에 격자 고리를 그린다. 가까워질수록 커지고, 굵어지고, 밝아진다
const IMPACT_RING_RADIUS = 0.55; // 화면에 닿을 때 화염구 크기에 대한 고리 반지름 비율 (화염구 판정 반지름과 같은 비율)
const SCORCH_LIFE = 1.1;         // 화면 금이 사라지는 시간(초)
const SCORCH_MAX = 8;
let scorches = [];

function drawImpactRings(time) {
  const P = cellPx();
  for (const f of fireballs) {
    if (f.dead) continue;
    const { alpha, scale } = FxCore.impactRing(f.p);
    if (alpha <= 0.01) continue;
    const rc = Math.max(2, Math.round((f.size0 * 5.5 * IMPACT_RING_RADIUS * scale) / P)); // 5.5 = 화면에 닿을 때 크기 (Fireball.size, p = 1)
    const gx = Math.round(f.tx / P), gy = Math.round(f.ty / P);
    const near = scale > 0.8;
    ctx.globalAlpha = alpha * (0.85 + 0.15 * Math.sin(time * 18));
    fillCells(circleCells(rc + 1), gx, gy, P, 'rgba(0,0,0,0.55)');          // 바깥 어두운 테두리
    fillCells(circleCells(rc), gx, gy, P, near ? '#ffd23a' : '#ff6a2a');
    if (scale > 0.6) fillCells(circleCells(rc - 1), gx, gy, P, near ? '#ffb23a' : '#e04a1a'); // 가까우면 두 칸 굵기
    // 고리 안쪽 네 방향 눈금 (2칸)
    const ticks = [[-rc + 1, 0], [-rc + 2, 0], [rc - 1, 0], [rc - 2, 0], [0, -rc + 1], [0, -rc + 2], [0, rc - 1], [0, rc - 2]];
    fillCells(ticks, gx, gy, P, '#fff0c0');
  }
  ctx.globalAlpha = 1;
}

// 화염구가 화면에 닿은 자리에 그을린 자국(2톤 블록 얼룩) + 계단식 금. 한 번 작은 그림으로 그려 두고 사라질 때까지 다시 쓴다
function addScorch(x, y, size) {
  const P = cellPx();
  const r = seeded(Math.floor(Math.random() * 1e6));
  const blobR = clamp(Math.round((size * 0.2) / P), 3, 12);
  const crackCells = new Set();
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + r() * 0.7;
    const len = clamp((size * (0.3 + r() * 0.3)) / P, 6, 40);
    let cx = 0, cy = 0;
    for (let k = 1; k <= 3; k++) {
      const a = ang + (r() - 0.5) * 0.9;
      const nx = cx + Math.cos(a) * len / 3, ny = cy + Math.sin(a) * len / 3;
      for (const [px, py] of FxCore.gridLine(cx, cy, nx, ny)) crackCells.add(`${px},${py}`);
      cx = Math.round(nx); cy = Math.round(ny);
    }
  }
  const cracks = [...crackCells].map((k) => k.split(',').map(Number));
  const lumps = Array.from({ length: 8 }, () => 0.75 + r() * 0.4); // 얼룩 가장자리 울퉁불퉁
  const blob = [];
  for (let gy = -blobR - 2; gy <= blobR + 2; gy++) {
    for (let gx = -blobR - 2; gx <= blobR + 2; gx++) {
      const d = Math.hypot(gx, gy);
      const sector = Math.floor(((Math.atan2(gy, gx) + Math.PI) / (Math.PI * 2)) * 8) % 8;
      const R = blobR * lumps[sector];
      if (d <= R) blob.push([gx, gy, d < R * 0.55 ? 0 : 1]);
    }
  }
  const ext = Math.max(blobR + 3, ...cracks.map(([a, b]) => Math.max(Math.abs(a), Math.abs(b)) + 2));
  const img = document.createElement('canvas');
  img.width = img.height = (ext * 2 + 1) * P;
  const g = img.getContext('2d');
  const put = (cells, color, dx = 0, dy = 0) => {
    g.fillStyle = color;
    for (const [a, b] of cells) g.fillRect((a + ext + dx) * P, (b + ext + dy) * P, P, P);
  };
  put(blob.filter((c) => c[2] === 1), 'rgba(58, 16, 6, 0.6)');
  put(blob.filter((c) => c[2] === 0), 'rgba(18, 4, 2, 0.75)');
  put(cracks, 'rgba(0, 0, 0, 0.9)', 1, 1); // 금 그림자
  put(cracks, '#ffe9c8');
  const gx0 = Math.round(x / P) - ext, gy0 = Math.round(y / P) - ext;
  scorches = [...scorches.slice(-(SCORCH_MAX - 1)), { img, x: gx0 * P, y: gy0 * P, t: 0 }];
}
function updateScorches(dt) {
  if (!scorches.length) return;
  scorches = scorches.map((s) => ({ ...s, t: s.t + dt })).filter((s) => s.t < SCORCH_LIFE);
}
function drawScorches() {
  for (const s of scorches) {
    const a = s.t < 0.3 ? 1 : 1 - (s.t - 0.3) / (SCORCH_LIFE - 0.3);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.drawImage(s.img, s.x, s.y);
  }
  ctx.globalAlpha = 1;
}

// ---------- 충전 경고 꺾쇠 ----------
// 가스트 네 귀퉁이의 꺾쇠가 점점 조여 오고 빨리 깜빡인다. 처음부터 밝은 빨강 → 노랑 → 끝에 거의 흰색 (FxCore.chargeCueColor).
// 격자 칸 사각형 몇 개라 가볍고, 효과 줄이기·자동 가볍게에서도 늘 보인다 (붉은 빛 번짐은 그때 꺼진다)
function drawChargeCue(x, y, w, h, p, time, alpha = 1) {
  const P = cellPx();
  const snap = (v) => Math.round(v / P) * P;
  const blink = 0.75 + 0.25 * Math.abs(Math.sin(time * (6 + 14 * p)));
  const hw = snap(w * lerp(0.62, 0.5, p)), hh = snap(h * lerp(0.56, 0.46, p));
  const len = P * Math.max(3, Math.round((w * 0.16) / P)), th = P * (p > 0.5 ? 2 : 1);
  const cx0 = snap(x), cy0 = snap(y);
  ctx.globalAlpha = clamp(alpha * (0.85 + 0.15 * p) * blink, 0, 1);
  const color = FxCore.chargeCueColor(p);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = cx0 + sx * hw, cy = cy0 + sy * hh;
    const bars = [
      [cx - (sx > 0 ? len : 0), cy - (sy > 0 ? th : 0), len, th],
      [cx - (sx > 0 ? th : 0), cy - (sy > 0 ? len : 0), th, len],
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    for (const [bx, by, bw, bh] of bars) ctx.fillRect(bx - P / 2, by - P / 2, bw + P, bh + P);
    ctx.fillStyle = color;
    for (const [bx, by, bw, bh] of bars) ctx.fillRect(bx, by, bw, bh);
  }
  ctx.globalAlpha = 1;
}

// ---------- 첫 화염구 안내 ----------
// 앱을 켠 뒤 첫 1인 기록전·2인 대결에서 첫 화염구가 나올 때 한 번만 알려 준다 (이번 실행에서 다시 안 띄움)
let fireballHintShown = false;
function noteFireballLaunched() {
  if (fireballHintShown || game.state !== 'play') return;
  if (game.mode !== 'solo' && game.mode !== 'versus') return;
  fireballHintShown = true;
  const deflect = settings.deflectPoints > 0 ? `맞히면 +${settings.deflectPoints}점` : '맞히면 터져요';
  const hit = penaltyOf('hit') > 0 ? `  ·  화면에 닿으면 -${penaltyOf('hit')}점` : '';
  showBanner('화염구를 쏴서 튕겨 내세요!', `${deflect}${hit}`, '#ffb347', 2.6);
}

// ---------- 연속 명중 (점수 없음, 글자·소리만) ----------
let combos = [0, 0]; // [1P, 2P]
function resetCombos() { combos = [0, 0]; }
// event: 'hit' | 'miss' | 'hurt'. 맞힌 소리 높이 배수를 돌려준다
function bumpCombo(who, event, x, y) {
  combos = combos.map((n, i) => (i === who || event === 'hurt' ? FxCore.comboAfter(n, event) : n));
  const n = combos[who] || 0;
  const label = event === 'hit' ? FxCore.comboLabel(n) : '';
  if (label) {
    const tag = isTwoPlayer() ? `${who + 1}P ` : '';
    const color = isTwoPlayer() ? PLAYER_COLORS[who] : n >= 10 ? '#ff7ad9' : n >= 6 ? '#ffb23a' : '#ffe14a';
    addPart({ kind: 'text', text: `${tag}${label}`, x, y, vy: -U * 3, size: U * Math.min(6, 3.8 + n * 0.12), life: 0.9, rot: rand(-0.12, 0.12), color, shadow: '#1a1a1a' });
  }
  return FxCore.comboPitch(n);
}

// ---------- TIME UP! ----------
// 시간이 0 이 되면 판을 멈추고(가스트·화염구 그대로 멈춤, 쏴도 점수 없음) 'TIME UP!' 을 잠깐 보여 준 뒤 endGame.
// 토너먼트 동점이면 예전처럼 바로 연장전 (endGame 이 Tournament.startOvertime 을 부른다)
function onTimeOver() {
  if (FxCore.timeUpPlan(game.mode, game.mode === 'tournament' && Tournament.tied()) === 'overtime') { endGame(); return; }
  game.timeUp = { t: 0 };
  game.timeLeft = 0;
  banner = null;
  Sound.timeUp();
}
// TIME UP 동안: 막 맞힌 가스트가 터지는 모습만 마저 (점수는 이미 들어감). 시간이 다 되면 endGame
function updateTimeUp(dt) {
  game.timeUp = { t: game.timeUp.t + dt };
  for (const g of ghasts) if (g.state === 'dying') g.update(dt, difficulty());
  ghasts = ghasts.filter((g) => !g.dead);
  if (game.timeUp.t >= FxCore.TIME_UP_SEC) { game.timeUp = null; endGame(); }
}
function drawTimeUp() {
  const t = game.timeUp.t;
  const s = t < 0.18 ? lerp(2.2, 1, t / 0.18) : 1 + 0.03 * Math.sin(t * 20);
  const a = t > FxCore.TIME_UP_SEC - 0.2 ? (FxCore.TIME_UP_SEC - t) / 0.2 : 1;
  ctx.save();
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, H * 0.45 - U * 13, W, U * 26);
  ctx.translate(W / 2, H * 0.45);
  ctx.scale(s, s);
  text('TIME UP!', 0, 0, U * 20, '#ffe14a', 'center', { shadow: '#a3200c' });
  ctx.restore();
}

// ---------- 결과 점수 올라가기 ----------
// 결과 화면(1인·2인)이 뜰 때마다 0 에서 실제 점수까지 1초 동안 올라간다 (보이는 숫자만, 저장 점수는 그대로)
const resultCount = { state: '', t: 0, shown: '', tickAt: 0 };
function updateResultCount(dt) {
  if (game.state !== resultCount.state) {
    resultCount.state = game.state;
    resultCount.t = 0;
    resultCount.shown = '';
  }
  if (game.state !== 'result') return;
  resultCount.t += dt;
  if (resultCount.t > FxCore.COUNT_UP_SEC + 0.1) return;
  const shown = game.players.map((p) => shownScore(p.score)).join(',');
  const now = performance.now();
  if (shown !== resultCount.shown && now - resultCount.tickAt >= COUNT_TICK_MS) {
    resultCount.tickAt = now;
    Sound.countTick(Math.min(1, resultCount.t / FxCore.COUNT_UP_SEC));
  }
  resultCount.shown = shown;
}
const COUNT_TICK_MS = 55; // '틱' 소리 최소 간격
const shownScore = (score) => FxCore.countUpValue(score, resultCount.t, FxCore.COUNT_UP_SEC);
// 결과 점수 글자: 올라가는 동안에는 글자 그림을 저장하지 않고 바로 그린다 (숫자마다 큰 글자 그림이 쌓이지 않게)
function drawCountScore(score, x, y, size, color, shadow) {
  const shown = shownScore(score);
  if (shown === score) { text(`${score}점`, x, y, size, color, 'center', { shadow }); return; }
  const off = Math.max(2, size * 0.08);
  text(`${shown}점`, x + off, y + off, size, shadow, 'center', { live: true });
  text(`${shown}점`, x, y, size, color, 'center', { live: true });
}

// 판을 새로 시작하거나 처음 화면으로 갈 때 효과 상태를 비운다
function resetPlayFx() {
  scorches = [];
  resetCombos();
  game.timeUp = null;
}
