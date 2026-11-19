// 가스트 사격 — 글자·버튼 그리기·처음 화면 그리기
// game.js 에서 기능별로 나눈 조각. index.html 이 game.js 다음에 차례로 불러오며, 이름(함수·변수)을 모두 함께 쓴다.
'use strict';
// ---------- 글자·버튼 그리기 ----------
const FONT = '"Galmuri11", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
// 캔버스 글자는 글꼴이 다 받아진 뒤에 그려야 픽셀 글꼴로 나온다 → 시작하자마자 불러 두고, 받아지면 글자 그림을 새로 만든다
document.fonts?.load?.(`bold 16px "Galmuri11"`).then(() => clearTextCache()).catch(() => {});
// 글자가 maxW 보다 넓으면 들어가도록 글자 크기를 줄여서 돌려준다
function fitTextSize(str, size, maxW) {
  ctx.font = `bold ${Math.round(size)}px ${FONT}`;
  const w = ctx.measureText(str).width;
  return w > maxW ? size * (maxW / w) : size;
}
// 테두리·그림자 있는 글자는 그리기가 비싸서, 한 번 그린 글자는 작은 그림으로 저장해 두고 다시 쓴다.
// (점수·타이머처럼 바뀌는 글자도 같은 값이 반복되므로 대부분 저장된 그림으로 그려진다)
const textCache = new Map();
const TEXT_CACHE_MAX = 600;
// 저장한 글자 그림이 차지하는 메모리 한도 (약 24MB). 넘으면 오래 안 쓴 것부터 지운다
const TEXT_CACHE_MAX_PX = 6_000_000;
let textCachePx = 0;
function clearTextCache() {
  textCache.clear();
  textCachePx = 0;
}
function textSprite(str, size, color, shadow) {
  const key = `${size}|${color}|${shadow}|${str}`;
  let sp = textCache.get(key);
  if (sp) {
    textCache.delete(key); // 최근에 쓴 것을 뒤로 (오래 안 쓴 것부터 지운다)
    textCache.set(key, sp);
    return sp;
  }
  const g = document.createElement('canvas').getContext('2d');
  const font = `bold ${size}px ${FONT}`;
  g.font = font;
  const off = Math.max(2, size * 0.08), lw = size * 0.18;
  const pad = Math.ceil(lw / 2 + 2);
  const tw = g.measureText(str).width;
  const w = Math.ceil(tw + off + pad * 2);
  const h = Math.ceil(size * 1.5 + off + pad * 2);
  g.canvas.width = Math.max(1, Math.ceil(w * DPR));
  g.canvas.height = Math.max(1, Math.ceil(h * DPR));
  g.scale(DPR, DPR);
  g.font = font;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = lw;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  const cy = pad + size * 0.75;
  g.strokeText(str, pad + off, cy + off);
  g.fillStyle = shadow;
  g.fillText(str, pad + off, cy + off);
  g.strokeText(str, pad, cy);
  g.fillStyle = color;
  g.fillText(str, pad, cy);
  sp = { canvas: g.canvas, w, h, pad, cy, tw, px: g.canvas.width * g.canvas.height };
  textCache.set(key, sp);
  textCachePx += sp.px;
  // 개수 또는 메모리 한도를 넘으면 오래 안 쓴 것부터 지운다 (방금 만든 것은 남김)
  while ((textCache.size > TEXT_CACHE_MAX || textCachePx > TEXT_CACHE_MAX_PX) && textCache.size > 1) {
    const oldKey = textCache.keys().next().value;
    textCachePx -= textCache.get(oldKey).px;
    textCache.delete(oldKey);
  }
  return sp;
}
// 글꼴(갈무리)이 늦게 내려받아지면 그 전에 저장한 글자 그림은 버리고 다시 그린다
document.fonts?.addEventListener?.('loadingdone', () => clearTextCache());
document.fonts?.ready?.then(() => clearTextCache());

function text(str, x, y, size, color = '#fff', align = 'center', opts = {}) {
  str = String(str);
  if (!str) return;
  // live: 매번 바뀌는 글자(측정값 등)는 저장하지 않고 바로 그린다
  if (opts.live) {
    ctx.font = `bold ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    return;
  }
  const sp = textSprite(str, Math.round(size), color, opts.shadow || '#2a0d06');
  // 글자 그림의 기준점(왼쪽 위)을 정렬에 맞춰 옮긴다
  const left = align === 'left' ? x - sp.pad : align === 'right' ? x - sp.tw - sp.pad : x - sp.tw / 2 - sp.pad;
  ctx.drawImage(sp.canvas, left, y - sp.cy, sp.w, sp.h);
}
function panel(x, y, w, h, alpha = 0.6) {
  ctx.fillStyle = `rgba(10, 2, 2, ${alpha})`;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255, 170, 120, 0.35)';
  ctx.lineWidth = Math.max(2, U * 0.3);
  ctx.strokeRect(x, y, w, h);
}
// 마인크래프트 스타일 버튼
function button(label, cx, cy, w, h, action, enabled = true, primary = false) {
  const x = cx - w / 2, y = cy - h / 2, b = Math.max(3, U * 0.5);
  ctx.globalAlpha = enabled ? 1 : 0.45;
  ctx.fillStyle = '#111';
  ctx.fillRect(x - b, y - b, w + b * 2, h + b * 2);
  ctx.fillStyle = primary ? '#3f7a2a' : '#6b6b6b';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = primary ? '#6fae4f' : '#9a9a9a';
  ctx.fillRect(x, y, w, b);
  ctx.fillRect(x, y, b, h);
  ctx.fillStyle = primary ? '#24461a' : '#3e3e3e';
  ctx.fillRect(x, y + h - b, w, b);
  ctx.fillRect(x + w - b, y, b, h);
  text(label, cx, cy, fitTextSize(label, h * 0.42, w - U * 2), '#ffffff'); // 긴 글자는 버튼 안에 들어가게 줄임
  ctx.globalAlpha = 1;
  buttons.push({ x: x - b, y: y - b, w: w + b * 2, h: h + b * 2, action, enabled });
}
// 처음 화면 안내용: "30 · 50 · 70 …"
function bonusSteps() {
  const g = bonusGaps();
  return g.map((n, i) => (i ? `+${n}` : `${n}`)).join(' → ');
}
// 설정의 "30, 50, 70" → [30, 50, 70] (0 이하·숫자 아닌 값은 버림)
function bonusGaps() {
  return String(settings.bonusGaps).split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
}
// 40 → "40초", 90 → "1분 30초"
function timeLabel(s) {
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m ? (r ? `${m}분 ${r}초` : `${m}분`) : `${r}초`;
}
function formatTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- 화면별 그리기 ----------
// ---------- 처음 화면 배치 (U 단위) ----------
// 버튼 줄: [랭킹] [1인 기록전] [2인 대결] [토너먼트] [조준점] — 가운데를 기준으로 좌우 대칭
const TITLE_BTN = { bigW: 29, smallW: 22, h: 11, gap: 3 };
const titleButtonRowY = () => H * 0.84;
const titleButtonX = (slot) => {          // slot: -2(왼쪽 작은) -1 0 1(가운데 큰 셋) 2(오른쪽 작은)
  const { bigW, smallW, gap } = TITLE_BTN;
  const offset = Math.abs(slot) === 2 ? bigW * 1.5 + gap * 2 + smallW / 2 : Math.abs(slot) * (bigW + gap);
  return W / 2 + U * Math.sign(slot) * offset;
};
const titleAimButtonPos = () => ({ x: titleButtonX(2), y: titleButtonRowY() });

// 설명 카드에 보여 줄 것: 가스트 5종(크기 차이도 그대로) + 화염구
// 처음 화면 카드: 가스트는 점수가 낮은 것부터 높은 것 순서 (점수는 설정을 따르므로 그릴 때 정렬), 화염구 반사는 맨 끝
const TITLE_GHASTS = ['normal', 'small', 'big', 'angry', 'gold'];
const titleCards = () => [
  ...[...TITLE_GHASTS].sort((a, b) => GHAST_TYPES[a].points() - GHAST_TYPES[b].points()).map((type) => ({ type })),
  { fireball: true },
];
const CARD_IMG_H = 9;                     // 기본 가스트 그림 높이 (U)
// 종류별 크기 차이는 보이되, 아기 가스트도 알아볼 만큼만 줄인다
const cardScale = (size) => 0.55 + 0.45 * size;

function drawTitleCards(cx, top, width) {
  const cards = titleCards();
  const n = cards.length;
  const cw = width / n;
  const base = top + U * 12.5;            // 그림 바닥선 (크기가 달라도 바닥을 맞춘다)
  ctx.imageSmoothingEnabled = false;
  cards.forEach((c, i) => {
    const x = cx - width / 2 + cw * (i + 0.5);
    // 카드 칸
    ctx.fillStyle = 'rgba(255, 220, 190, 0.05)';
    ctx.fillRect(x - cw / 2 + U * 0.8, top, cw - U * 1.6, U * 20);
    ctx.strokeStyle = 'rgba(255, 170, 120, 0.22)';
    ctx.lineWidth = Math.max(1, U * 0.2);
    ctx.strokeRect(x - cw / 2 + U * 0.8, top, cw - U * 1.6, U * 20);
    let name, pts, color;
    if (c.fireball) {
      const s = U * 7.5;
      ctx.drawImage(IMG.fireball, x - s / 2, base - s, s, s);
      name = '화염구 반사'; pts = `+${settings.deflectPoints}`; color = '#ffb347';
    } else {
      const T = GHAST_TYPES[c.type];
      const h = U * CARD_IMG_H * cardScale(T.size), w = h * GHAST_W / GHAST_H;
      ctx.drawImage(GV[T.img].normal, x - w / 2, base - h, w, h);
      name = T.name; pts = `+${T.points()}`; color = c.type === 'gold' ? '#ffd84a' : '#9fe870';
    }
    text(name, x, base + U * 2.8, fitTextSize(name, U * 2.5, cw - U * 2.2), '#ffd9b0');
    text(`${pts}점`, x, base + U * 6.2, U * 3.4, color);
  });
}

function drawTitle(time) {
  const cx = W / 2;
  const bobY = Math.sin(time * 2) * U * 0.8;
  text('가스트 사격', cx, H * 0.14 + bobY, U * 13, '#ffffff', 'center', { shadow: '#a3200c' });
  drawTitleSubtitle(cx, H * 0.14 + U * 9.8);

  drawRulesPanel(cx, H * 0.275, Math.min(W - U * 8, U * 118));

  // 버튼 줄 (좌우 대칭, 높이 같음): 랭킹 · 1인 기록전 · 2인 대결 · 토너먼트 · 조준점
  const by = titleButtonRowY(), { bigW, smallW, h } = TITLE_BTN;
  button('랭킹', titleButtonX(-2), by, U * smallW, U * h, openRanking);
  button('1인 기록전', titleButtonX(-1), by, U * bigW, U * h, () => SoloReady.open(), true, true);
  button('2인 대결', titleButtonX(0), by, U * bigW, U * h, () => openNameEntry('versus'), true, true);
  button(Tournament.titleLabel(), titleButtonX(1), by, U * bigW, U * h, () => Tournament.open(), true, true);
  button(aimLabel(), titleButtonX(2), by, U * smallW, U * h, toggleAim, true, aimOn());
  text(`난이도 ${rules().label} (1인 기록전 화면에서 변경)  ·  Space 1인 · 2 대결 · 3 대회 · R 랭킹 · V 조준점 · G 총 연결 · S 설정`, cx, by + U * 9, U * 2.5, '#c9a89a');

  drawTitleBottomBar(time);
}

// 제목 아래 줄: 'GHAST SHOOTING  |  만든 사람 정다희' 를 한 덩어리로 가운데 정렬
function drawTitleSubtitle(cx, y) {
  const parts = [
    { str: 'GHAST SHOOTING', size: U * 4, color: '#ffcf5a' },
    { str: '|', size: U * 3.4, color: 'rgba(255, 170, 120, 0.6)', gap: U * 2.4 },
    { str: '만든 사람', size: U * 2.6, color: '#ffd9b0', gap: U * 2.4 },
    { str: CREATOR, size: U * 4, color: '#ffffff', gap: U * 1.2, shadow: '#a3200c' },
  ];
  const widthOf = (p) => { ctx.font = `bold ${Math.round(p.size)}px ${FONT}`; return ctx.measureText(p.str).width; };
  const total = parts.reduce((sum, p) => sum + (p.gap || 0) + widthOf(p), 0);
  parts.reduce((x, p) => {
    const left = x + (p.gap || 0);
    text(p.str, left, y, p.size, p.color, 'left', p.shadow ? { shadow: p.shadow } : undefined);
    return left + widthOf(p);
  }, cx - total / 2);
}

// 가스트 설명판 (처음 화면, 게임 직후 랭킹에서 번갈아): 목표 → 가스트·화염구 카드(점수 순) → 감점 → 시간·보너스 → 상품
const RULES_PANEL_H = 46.5; // U
function drawRulesPanel(cx, py, pw) {
  const ph = U * RULES_PANEL_H;
  panel(cx - pw / 2, py, pw, ph, 0.86);
  const goal = '네더의 가스트가 화염구를 쏘기 전에 맞혀라!';
  text(goal, cx, py + U * 5, fitTextSize(goal, U * 4.4, pw - U * 6), '#ffffff');
  drawTitleCards(cx, py + U * 8.5, pw - U * 6);
  ctx.fillStyle = 'rgba(255, 170, 120, 0.25)';
  ctx.fillRect(cx - pw / 2 + U * 4, py + U * 30.5, pw - U * 8, Math.max(1, U * 0.25));
  const pen = (kind) => (penaltyOf(kind) > 0 ? `-${penaltyOf(kind)}점` : '감점 없음');
  const fit = (str, size) => fitTextSize(str, size, pw - U * 6);
  const penLine = `배경을 맞히면 ${pen('miss')}  ·  가스트를 놓치면 ${pen('escape')}  ·  화염구에 맞으면 ${pen('hit')}`;
  text(penLine, cx, py + U * 33.6, fit(penLine, U * 3.1), '#ff9a8a');
  const timeLine = `제한 시간 ${timeLabel(settings.gameSeconds)}  ·  ${bonusSteps()}점마다 +${settings.bonusSeconds}초 & 레벨 UP!`;
  text(timeLine, cx, py + U * 38.2, fit(timeLine, U * 3.2), '#ffe14a');
  // 상품 줄: 글자 바로 양옆에 가스트의 눈물
  const reward = `${rewardScoreNow()}점 이상이면 '가스트의 눈물'을 드려요`;
  const rs = fitTextSize(reward, U * 3.6, pw - U * 20), ry = py + U * 42.9;
  text(reward, cx, ry, rs, '#9ff6ff');
  ctx.font = `bold ${Math.round(rs)}px ${FONT}`;
  const rw = ctx.measureText(reward).width, ts = U * 4.2;
  ctx.drawImage(IMG.tear, cx - rw / 2 - U * 2 - ts, ry - ts / 2, ts, ts);
  ctx.drawImage(IMG.tear, cx + rw / 2 + U * 2, ry - ts / 2, ts, ts);
}

// 1·2·3위 색 (금·은·동). 처음 화면 랭킹 띠·랭킹 화면에서 쓴다
const MEDAL = ['#ffd84a', '#d8d8e0', '#e09a5a'];

// 맨 아래 띠: 왼쪽 '오늘의 TOP 10' 이 옆으로 흐르고, 오른쪽에 버전·저작권
function drawTitleBottomBar(time) {
  const bh = U * 4.6, y = H - bh, mid = y + bh / 2;
  ctx.fillStyle = 'rgba(10, 2, 2, 0.6)';
  ctx.fillRect(0, y, W, bh);
  const right = `${APP_VERSION ? `v${APP_VERSION}  ·  ` : ''}만든 사람 ${CREATOR}  ·  © 2026 SYNC`;
  text(right, W - U * 2, mid, U * 2.4, 'rgba(255,217,176,0.75)', 'right');
  const list = game.titleTop;
  if (!list.length) return;
  ctx.font = `bold ${Math.round(U * 2.4)}px ${FONT}`;
  const rightW = ctx.measureText(right).width;
  const label = `오늘의 ${rules().label} TOP ${list.length}`;
  text(label, U * 2, mid, U * 2.8, '#ffe14a', 'left');
  ctx.font = `bold ${Math.round(U * 2.8)}px ${FONT}`;
  const x0 = U * 2 + ctx.measureText(label).width + U * 3;
  const x1 = W - U * 2 - rightW - U * 4;
  const items = list.map((r, i) => ({ str: `${i + 1}위 ${r.name} ${r.score}점`, color: MEDAL[i] || '#ffffff' }));
  const gapW = U * 6;
  const widths = items.map((it) => ctx.measureText(it.str).width);
  const loopW = widths.reduce((a, b) => a + b + gapW, 0);
  const offset = (time * U * 8) % loopW;  // 1초에 8U 만큼 왼쪽으로 흐름
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y, x1 - x0, bh); ctx.clip();
  for (let c = 0; c < 3; c++) {
    let x = x0 - offset + c * loopW;
    items.forEach((it, i) => {
      if (x < x1 && x + widths[i] > x0) text(it.str, x, mid, U * 2.8, it.color, 'left');
      x += widths[i] + gapW;
    });
  }
  ctx.restore();
}

