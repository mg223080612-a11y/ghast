// 가스트 사격 — 화면별 그리기 (1등 왕관·총 연결·조준 테스트·랭킹·HUD·카운트다운·결과·알림)
// game.js 에서 기능별로 나눈 조각. index.html 이 game.js 다음에 차례로 불러오며, 이름(함수·변수)을 모두 함께 쓴다.
'use strict';
// ---------- 1등 꾸미기: 왕관 + 반짝이 ----------
// 픽셀 왕관 (X 금, R 빨간 보석, B 파란 보석)
const CROWN = [
  'X...X...X',
  'XX.XXX.XX',
  'XXXXXXXXX',
  'XRXXBXXRX',
  'XXXXXXXXX',
];
function drawCrown(cx, cy, w, time, alpha = 1) {
  const p = w / 9, h = p * CROWN.length;
  const x0 = cx - w / 2, y0 = cy - h / 2 + Math.sin(time * 3) * p * 0.6; // 살짝 들썩
  ctx.globalAlpha = alpha;
  // 검은 테두리
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  CROWN.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== '.') ctx.fillRect(x0 + c * p - p * 0.35, y0 + r * p - p * 0.35, p * 1.7, p * 1.7);
  }));
  CROWN.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    ctx.fillStyle = ch === 'R' ? '#ff3a4a' : ch === 'B' ? '#4ad8ff' : r === CROWN.length - 1 ? '#d98c1a' : '#ffd84a';
    ctx.fillRect(x0 + c * p, y0 + r * p, Math.ceil(p), Math.ceil(p));
  }));
  // 3초마다 왕관 위를 지나가는 빛줄기
  const shine = (time * 0.9) % 3;
  if (shine < 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x0 + shine * (w - p), y0 + p * 2, p, p * 3);
  }
  ctx.globalAlpha = 1;
}
// 영역 안에서 작은 별이 반짝였다 사라지고, 사라질 때마다 다른 자리에서 다시 반짝인다
function drawSparkles(x, y, w, h, time, count = 6, seed = 1, alpha = 1) {
  for (let i = 0; i < count; i++) {
    const phase = hash(seed * 53 + i * 29) * Math.PI * 2;
    const t = time * 3 + phase;
    const cycle = Math.floor(t / (Math.PI * 2));
    const s = Math.max(0, Math.sin(t));
    if (s < 0.05) continue;
    const px = x + hash(seed * 97 + i * 13 + cycle * 101) * w;
    const py = y + hash(seed * 31 + i * 7 + cycle * 211) * h;
    const r = U * (0.5 + 0.9 * s), th = Math.max(1.5, U * 0.28);
    ctx.globalAlpha = alpha * s;
    ctx.fillStyle = '#fff3a8';
    ctx.fillRect(px - r, py - th / 2, r * 2, th);
    ctx.fillRect(px - th / 2, py - r, th, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - th, py - th, th * 2, th * 2);
  }
  ctx.globalAlpha = 1;
}
const LEVEL_COLORS = ['#ffffff', '#ffe14a', '#ffb23a', '#ff7a3a', '#ff4a3a'];

// 총 상태 띠: 화면 맨 위 왼쪽에 작게 (오른쪽 위 운영 버튼과 제목에 겹치지 않게)
function drawGunStatus(players) {
  const msg = Guns.statusMessage(players);
  if (!msg) return;
  const maxW = Math.min(cornerLeftPx, W) - U * 5;
  const size = fitTextSize(msg, U * 2.4, maxW);
  ctx.font = `bold ${Math.round(size)}px ${FONT}`;
  const w = Math.min(maxW, ctx.measureText(msg).width) + U * 2;
  ctx.fillStyle = 'rgba(130, 22, 10, 0.88)';
  ctx.fillRect(U * 1, U * 0.3, w, U * 4);
  text(msg, U * 2, U * 2.3, size, '#ffe9d0', 'left');
}

function drawGunSetup() {
  if (Guns.calib) { drawGunCalib(); return; }
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const pw = Math.min(W - U * 8, U * 130), ph = Math.min(H - U * 4, U * 96);
  const px = cx - pw / 2, py = (H - ph) / 2;
  panel(px, py, pw, ph, 0.88);

  text('총 연결 (2인 대결)', cx, py + U * 7, U * 6.5, '#ffcf5a', 'center', { shadow: '#a3200c' });
  // 긴 안내 줄은 판 너비에 맞춰 글자를 줄인다 (1920×1080 에서 판 밖으로 넘쳤음)
  const howTo = '두 총을 조이스틱 모드로 바꾸세요: 총에서 Space + 5 + 조이스틱 왼쪽  ·  방아쇠를 한 번 당기면 게임이 총을 알아봐요';
  text(howTo, cx, py + U * 14, fitTextSize(howTo, U * 2.7, pw - U * 6), '#ffd9b0');

  const pads = Guns.list();
  let y = py + U * 22;
  // 총이 아직 마우스 모드인지: 게임패드는 없는데 마우스 커서가 방금 움직였다
  const mouseMode = pads.length < 2 && aim.movedAt && performance.now() - aim.movedAt < 3000;
  if (!pads.length) {
    text(`게임패드로 잡힌 총: 0대 / 2대 필요`, cx, y + U * 4, U * 4.2, '#ff8a7a');
    if (mouseMode) {
      text('총이 지금 마우스 모드예요 → 두 총 모두 Space + 5 + 조이스틱 왼쪽 을 누르세요', cx, y + U * 11, U * 3.2, '#ffe14a');
    }
    text('① 수신기 2개가 꽂혀 있고 총 전원이 켜졌는지  ② 조이스틱 모드인지  ③ 방아쇠를 한 번씩 당겼는지', cx, y + U * 17, U * 2.8, '#ffffff');
    text('④ 총이 1대만 잡히면 두 총·수신기 짝의 DIP 스위치가 서로 다른지 확인', cx, y + U * 22, U * 2.8, '#ffffff');
    text('1인 기록전은 마우스(라이트건) 모드로도 그대로 할 수 있어요', cx, y + U * 28, U * 2.8, '#c9a89a');
  } else {
    if (pads.length < 2) {
      text(`게임패드로 잡힌 총: ${pads.length}대 / 2대 필요 — 다른 총의 방아쇠도 당겨 보세요 (안 잡히면 DIP 스위치 확인)`, cx, py + ph - U * 39, U * 2.8, '#ff8a7a');
    }
    pads.forEach((s, i) => {
      const who = Guns.playerOf(s);
      const color = who >= 0 ? PLAYER_COLORS[who] : '#ffffff';
      const role = who >= 0 ? `${who + 1}P${Guns.receiverSlot(s.id) === who ? ' 자동' : ''}` : '미지정';
      const axes = (s.axes || []).slice(0, 4).map((v) => v.toFixed(2)).join('  ');
      const fresh = performance.now() - s.lastActive < 1500;
      text(`총 ${i + 1}  ·  ${role}`, px + U * 6, y, U * 3.8, color, 'left');
      // 축 숫자는 매 프레임 바뀌므로 글자 그림으로 저장하지 않고 바로 그린다 (저장 공간이 쓸데없이 차지 않게)
      text(`방아쇠 = 버튼 ${Guns.triggerOf(s)}  ·  축 [${axes}]${fresh ? '  ● 움직임' : ''}`, px + U * 34, y, U * 2.6, '#ffd9b0', 'left', { live: true });
      // 움직이는 중에 위치 갱신이 적으면 총이 화면(센서)을 잘 못 보는 것: 배터리·렌즈·총 보정 확인
      const rateColor = !fresh ? '#8a7a72' : s.rate >= 40 ? '#7dff7a' : s.rate >= 15 ? '#ffe14a' : '#ff8a7a';
      const capNote = AimCap.gapForHz(settings.versusAimHz) > 0 ? `  ·  대결 중 ${s.capRate ?? 0}/초` : '';
      const model = fresh && s.rate >= 80 ? '  ·  빠른 총(Pro)' : fresh && s.rate >= 20 ? '  ·  보통 총' : '';
      const rateLine = !s.moved ? '신호 없음 — 총 전원을 켜고 조이스틱 모드인지 확인한 뒤 한 번 흔들어 보세요'
        : `위치 갱신 ${s.rate ?? 0}/초${model}${capNote}${fresh && s.rate < 15 ? '  ← 느림: 배터리·렌즈·총 보정 확인' : ''}`;
      text(rateLine, px + U * 66, y + U * 4, fitTextSize(rateLine, U * 2.4, pw - U * 70), !s.moved ? '#ff8a7a' : rateColor, 'left', { live: true });
      text(s.id.slice(0, 48), px + U * 6, y + U * 4, U * 2.2, '#8a7a72', 'left');
      y += U * 9.5;
    });
    if (AimCap.gapForHz(settings.versusAimHz) > 0) {
      const trigger = Number(settings.versusFireDelayMs) > 0 ? ' · 1P 방아쇠도 2P 처럼 25~50ms 뒤에 처리' : '';
      const fair = `대결·대회 중에는 두 총 모두 1초에 약 ${settings.versusAimHz}번만 새 위치를 받아요 (Pro 약 130번은 줄이고 보통 총 약 40번은 그대로)${trigger}`;
      text(fair, cx, y + U * 1.5, fitTextSize(fair, U * 2.4, pw - U * 8), '#c9a89a');
    }
  }

  // 안내 문구: 지금 무엇을 해야 하는지. 두 총이 다 준비되면 바로 대결을 시작할 수 있는 버튼
  if (Guns.assigning === null && Guns.readyForVersus()) {
    if (game.gunSetupFrom === 'bracket') button(`${Tournament.isLeague() ? '순위표' : '대진표'}로 돌아가기 ▶`, cx, py + ph - U * 33, U * 50, U * 8, closeGunSetup, true, true);
    else button('2인 대결 시작 ▶', cx, py + ph - U * 33, U * 50, U * 8, () => { closeGunSetup(); openNameEntry('versus'); }, true, true);
  } else {
    const ask = Guns.assigning !== null ? `${Guns.assigning + 1}P 총의 방아쇠를 당기세요` : Guns.message;
    if (ask) text(ask, cx, py + ph - U * 33, fitTextSize(ask, U * 4, pw - U * 8), Guns.assigning !== null ? PLAYER_COLORS[Guns.assigning] : '#9ff6ff');
  }
  const p1 = Guns.saved.p1 ? '지정됨' : '없음', p2 = Guns.saved.p2 ? '지정됨' : '없음';
  text(`1P: ${p1}   ·   2P: ${p2}   ·   두 총 조준점이 화면에 따라다니면 준비 끝`, cx, py + ph - U * 27, U * 2.8, '#ffffff');

  // 조준 보정: 조준점이 거꾸로 움직이거나 안 움직이면 여기서 바로 고친다
  const axesLabel = { auto: '자동', '01': '0·1', '23': '2·3' }[settings.gunAxes] || '자동';
  const by1 = py + ph - U * 19;
  const calibLabel = (who) => {
    const key = who === 0 ? Guns.saved.p1 : Guns.saved.p2;
    return `${who + 1}P 조준 보정${key && Guns.saved.calib?.[key] ? ' (됨)' : ''}`;
  };
  button(`좌우 반전 ${settings.gunInvertX ? 'ON' : 'OFF'}`, cx - U * 50, by1, U * 23, U * 7, () => toggleGunSetting('gunInvertX'), true, settings.gunInvertX);
  button(`상하 반전 ${settings.gunInvertY ? 'ON' : 'OFF'}`, cx - U * 25, by1, U * 23, U * 7, () => toggleGunSetting('gunInvertY'), true, settings.gunInvertY);
  button(`조준 축: ${axesLabel}`, cx, by1, U * 23, U * 7, () => toggleGunSetting('gunAxes'));
  button(calibLabel(0), cx + U * 25, by1, U * 23, U * 7, () => startGunCalib(0), !!Guns.saved.p1);
  button(calibLabel(1), cx + U * 50, by1, U * 23, U * 7, () => startGunCalib(1), !!Guns.saved.p2);

  const by2 = py + ph - U * 8;
  button('1P 지정', cx - U * 45, by2, U * 20, U * 8, () => { Guns.assigning = 0; Guns.message = ''; }, true, Guns.assigning === 0);
  button('2P 지정', cx - U * 22, by2, U * 20, U * 8, () => { Guns.assigning = 1; Guns.message = ''; }, true, Guns.assigning === 1);
  button('초기화', cx + U * 1, by2, U * 20, U * 8, () => {
    Guns.saved = { p1: null, p2: null, trigger: {}, calib: Guns.saved.calib }; // 조준 보정값은 남겨 둔다
    Guns.save();
    Guns.assigning = 0;
    Guns.message = '';
  });
  button('끝내기', cx + U * 28, by2, U * 26, U * 8, closeGunSetup, true, true);
}

function drawAimTest() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  text('총 조준 테스트', cx, H * 0.3, U * 7, '#ffcf5a', 'center', { shadow: '#a3200c' });
  text('9개 표적의 한가운데를 차례로 쏴 보세요', cx, H * 0.3 + U * 8, U * 3.6, '#ffffff');
  text('맞은 자리(점)가 표적에서 많이 벗어나면 GUN4IR 프로그램에서 캘리브레이션을 다시 하세요', cx, H * 0.3 + U * 13, U * 2.8, '#ffd9b0');

  // 표적
  for (const t of aimTargets()) {
    const r = U * 4;
    for (const [rr, color] of [[r, '#ffffff'], [r * 0.66, '#ff3a2a'], [r * 0.33, '#ffffff']]) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(t.x, t.y, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ff3a2a';
    ctx.fillRect(t.x - 2, t.y - 2, 4, 4);
  }

  // 맞은 자리: 가까우면 초록, 조금 어긋나면 노랑, 많이 어긋나면 빨강
  const ok = W * 0.015, warn = W * 0.04;
  for (const s of aimTest.shots) {
    const color = s.d <= ok ? '#5aff6a' : s.d <= warn ? '#ffd84a' : '#ff5a4a';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s.tx, s.ty); ctx.lineTo(s.x, s.y); ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(s.x - U * 0.8, s.y - U * 0.8, U * 1.6, U * 1.6);
  }

  if (aimTest.shots.length) {
    const last = aimTest.shots[aimTest.shots.length - 1];
    const avg = aimTest.shots.reduce((a, s) => a + s.d, 0) / aimTest.shots.length;
    const pct = (d) => `${((d / W) * 100).toFixed(1)}%`;
    const verdict = avg <= ok ? '정확해요! 바로 게임해도 돼요' : avg <= warn ? '조금 어긋나요. 판정 여유로 대부분 맞지만 캘리브레이션을 권장해요' : '많이 어긋나요. 캘리브레이션을 다시 하세요';
    text(`마지막 ${pct(last.d)} 어긋남  ·  평균 ${pct(avg)} (${aimTest.shots.length}발)`, cx, H * 0.62, U * 3.6, '#ffffff');
    text(verdict, cx, H * 0.62 + U * 6, U * 3.6, avg <= ok ? '#5aff6a' : avg <= warn ? '#ffd84a' : '#ff5a4a');
  }

  button('다시 측정', cx - U * 16, H * 0.74, U * 26, U * 7, () => { aimTest.shots = []; });
  button('끝내기', cx + U * 16, H * 0.74, U * 26, U * 7, goTitle, true, true);
  text('키보드: T / Esc 로 끝내기', cx, H * 0.74 + U * 7, U * 2.6, '#c9a89a');

  if (aim.seen) drawAim(aim.x, aim.y);
}

// 표에 그릴 줄: { r, rank, mine } 또는 { gap: true } (⋮)
// 내 기록이 목록(서버가 준 200명) 밖이면 저장 때 받은 순위로 내 줄만 따로 붙인다
function rankFocusEntries(list) {
  const { top, around } = RANK_FOCUS;
  const row = (r, i) => ({ r, rank: i + 1, mine: r.id === game.lastEntryId });
  const mine = list.findIndex((r) => r.id === game.lastEntryId);
  if (mine >= 0 && mine < RANK_FOCUS_ROWS - around) return list.slice(0, RANK_FOCUS_ROWS).map(row);
  if (mine >= 0) {
    const from = mine - around;
    return [...list.slice(0, top).map(row), { gap: true }, ...list.slice(from, mine + around + 1).map((r, i) => row(r, from + i))];
  }
  const ri = game.rankInfo, me = game.players[0];
  const rank = rankView.scope === 'today' ? ri?.rankToday : ri?.rankAll;
  if (ri?.status !== 'saved' || ri.pending || !rank || rankView.day !== 0) return null;
  const self = { r: { name: me.name || '이름없음', score: me.score, kills: me.stats.kills }, rank, mine: true };
  return [...list.slice(0, top).map(row), { gap: true }, self];
}

// 랭킹 표에서 방금 한 내 기록 줄: 금색 띠, 천천히 깜빡이는 테두리, 왼쪽 화살표
function drawMyRankRow(x, y, w, h, time) {
  const pulse = 0.55 + 0.45 * Math.sin(time * 5);
  ctx.fillStyle = 'rgba(255, 210, 60, 0.28)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = `rgba(255, 225, 74, ${pulse})`;
  ctx.lineWidth = Math.max(2, U * 0.45);
  ctx.strokeRect(x, y, w, h);
  text('▶', x - U * 2.2, y + h / 2, h * 0.55, '#ffe14a');
}
// 이름 바로 뒤의 '나' 배지 (금색 바탕에 검은 글자)
function drawMeBadge(x, cy, size) {
  const bw = size * 1.9, bh = size * 1.25;
  ctx.fillStyle = '#ffd84a';
  ctx.fillRect(x, cy - bh / 2, bw, bh);
  text('나', x + bw / 2, cy, size * 0.85, '#2a1600');
}

function drawRanking(time) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  // '오늘' 은 TOP 10 한 줄, '전체' 는 넓은 화면(프로젝터)에서 두 줄로 한 번에 20명
  const today = rankView.scope === 'today';
  const focus = rankAfterGame() && rankView.list ? rankFocusEntries(rankView.list) : null;
  const cols = !focus && !today && W - U * 8 >= U * 140 ? 2 : 1;
  // 게임이 끝나 바로 뜬 랭킹: 탭 없이 내 난이도·오늘만, 가스트 설명판과 번갈아 (설명판이 들어가게 조금 넓게)
  const afterGame = rankAfterGame();
  const phase = afterGame ? afterGamePhase() : { rules: false, alpha: 1 };
  const pw = Math.min(W - U * 8, afterGame ? U * 124 : cols === 2 ? U * 150 : U * 100);
  const ph = Math.min(H - U * 4, U * 100);
  const px = cx - pw / 2, py = (H - ph) / 2;
  panel(px, py, pw, ph, 0.88);

  const list = rankView.list;
  const per = cols * 10;
  if (rankView.perPage !== per) { rankView.perPage = per; rankView.page = 0; }
  const pages = today ? 1 : rankPages();
  rankView.page = today ? 0 : clamp(rankView.page, 0, pages - 1);
  const start = rankView.page * per;

  const dayTitle = focus ? `오늘의 랭킹 · ${dayLabel(0)}`
    : rankView.day === 0 ? `오늘의 TOP 10 · ${dayLabel(0)}` : `${dayLabel(rankView.day)} TOP 10`;
  if (afterGame) {
    // 탭은 숨긴다: 끝까지 쏘던 총알이 다른 표로 바꾸지 않게. 아래 점은 지금 보이는 쪽
    const label = DIFFICULTIES[rankView.diff].label;
    text(phase.rules ? `게임 방법 · ${label}` : `오늘의 ${label} 랭킹 · ${dayLabel(0)}`, cx, py + U * 7, U * 7, '#ffcf5a', 'center', { shadow: '#a3200c' });
    text(phase.rules ? '○ 랭킹     ● 게임 방법' : '● 랭킹     ○ 게임 방법', cx, py + U * 13, U * 2.4, '#c9a89a');
  } else {
    text(today ? dayTitle : '전체 랭킹', cx, py + U * 7, U * 7, '#ffcf5a', 'center', { shadow: '#a3200c' });
    // 왼쪽: 날짜별 · 전체 / 오른쪽: 난이도별 랭킹 (Easy · Normal · Hard)
    button('날짜별', cx - U * 37, py + U * 17, U * 19, U * 7, () => setRankTab('today'), true, rankView.scope === 'today');
    button('전체', cx - U * 16.5, py + U * 17, U * 19, U * 7, () => setRankTab('all'), true, rankView.scope === 'all');
    DIFF_KEYS.forEach((key, i) => {
      button(DIFFICULTIES[key].label, cx + U * (8 + i * 16), py + U * 17, U * 14, U * 7, () => setRankDiff(key), true, rankView.diff === key);
    });
  }

  // 게임이 끝나 바로 뜬 랭킹은 탭이 없어 표를 위로 올리고, 아래에 내 기록 두 줄이 더 들어간다
  const top = py + U * (afterGame ? 21 : 31), bottom = py + ph - U * (afterGame ? 21 : 17);
  const rowH = Math.min(U * 6.4, (bottom - top) / (focus ? Math.max(10, focus.length) : 10));
  const colW = (pw - U * 6) / cols;
  const size = Math.min(U * 3.8, rowH * 0.62);
  // 긴 닉네임은 옆 칸을 침범하지 않게 글자를 줄인다
  const fit = (str, s, maxW) => {
    ctx.font = `bold ${Math.round(s)}px ${FONT}`;
    const w = ctx.measureText(str).width;
    return w > maxW ? s * (maxW / w) : s;
  };

  // 칸 하나를 그린다. entries: { r, rank, mine } 또는 { gap: true }
  const drawColumn = (c, entries) => {
    const left = px + U * 3 + c * colW;
    const colRank = left + U * 5, colName = left + U * 12, colKills = left + colW - U * 21, colScore = left + colW - U * 3;
    const headY = py + U * (afterGame ? 17 : 26);
    text('순위', colRank, headY, U * 2.8, '#c9a89a');
    text('닉네임', colName, headY, U * 2.8, '#c9a89a', 'left');
    text('처치', colKills, headY, U * 2.8, '#c9a89a');
    text('점수', colScore, headY, U * 2.8, '#c9a89a', 'right');
    entries.forEach((e, i) => {
      const y = top + rowH * (i + 0.5);
      if (e.gap) { text('⋮', colRank, y, size, '#c9a89a'); return; }
      const { r, rank, mine } = e;
      if (mine) drawMyRankRow(left, y - rowH / 2, colW - U * 1, rowH, time);
      const color = mine && rank > MEDAL.length ? '#ffe14a' : MEDAL[rank - 1] || '#ffffff';
      // 1등: 금빛 줄 + 반짝이 (글자보다 먼저 그려 뒤에 깔리게)
      if (rank === 1) {
        ctx.fillStyle = 'rgba(255, 216, 74, 0.12)';
        ctx.fillRect(left, y - rowH / 2, colW - U * 1, rowH);
        drawSparkles(left, y - rowH * 0.8, colW - U * 1, rowH * 1.3, time, 10, 3);
      }
      text(`${rank}`, colRank, y, size, color);
      // 순위 '1' 위에 왕관을 씌운다 (게임 직후 랭킹에서는 빼서 내 줄에 눈이 가게)
      if (rank === 1 && !rankAfterGame()) drawCrown(colRank, y - size * 0.95, U * 4.6, time);
      const nameSize = fit(r.name, size, colKills - colName - U * (mine ? 11 : 5));
      text(r.name, colName, y, nameSize, color, 'left');
      if (mine) {
        ctx.font = `bold ${Math.round(nameSize)}px ${FONT}`;
        drawMeBadge(colName + ctx.measureText(r.name).width + U * 1.5, y, size);
      }
      text(String(r.kills ?? 0), colKills, y, size * 0.85, '#ffd9b0');
      text(`${r.score}점${r.pending ? ' *' : ''}`, colScore, y, size, color, 'right');
    });
  };

  ctx.globalAlpha = phase.alpha; // 랭킹 ↔ 설명판이 바뀔 때 살짝 나타나게
  if (phase.rules) {
    // 표 자리(제목 아래 ~ 내 점수 줄 위)의 가운데에
    drawRulesPanel(cx, (py + U * 16 + py + ph - U * 22 - U * RULES_PANEL_H) / 2, pw - U * 6);
  } else if (!list) {
    text('불러오는 중…', cx, top + rowH * 3, U * 4, '#ffffff');
  } else if (!list.length) {
    const empty = !today ? '아직 기록이 없어요' : rankView.day === 0 ? '오늘은 아직 기록이 없어요' : '이날은 기록이 없어요';
    text(empty, cx, top + rowH * 3, U * 4, '#ffffff');
  } else if (focus) {
    drawColumn(0, focus);
  } else {
    for (let c = 0; c < cols; c++) {
      const from = start + c * 10;
      const rows = list.slice(from, from + 10).map((r, i) => ({ r, rank: from + i + 1, mine: r.id === game.lastEntryId }));
      if (rows.length) drawColumn(c, rows);
    }
  }

  ctx.globalAlpha = 1;

  // 아래: 날짜별은 전날 · 다음 날, 전체는 이전 · 다음 쪽과 지금 보고 있는 순위 범위
  const by = py + ph - U * 7;
  if (afterGame) {
    // 방금 끝난 판: 내 점수·순위·보상을 보여 주고, 다음 사람이 바로 시작할 수 있게
    const me = game.players[0];
    const ri = game.rankInfo;
    const win = gotReward(me);
    let mine = `${me.name || '이름없음'} 님 ${me.score}점 (${rules().label})`;
    if (ri?.status === 'saving') mine += '  ·  랭킹 저장 중…';
    else if (ri?.status === 'saved' && !ri.pending) mine += `  ·  오늘 ${ri.rankToday}위 · 전체 ${ri.rankAll}위`;
    else if (ri?.status === 'saved') mine += '  ·  이 PC에 보관 (연결되면 올라가요)';
    else if (ri?.status === 'rejected' || ri?.status === 'error') mine += '  ·  랭킹 저장 실패';
    text(mine, cx, by - U * 11, U * 4, '#ffe14a');
    text(win ? '가스트의 눈물 획득! 진행요원에게 받아가세요' : `${rewardScoreNow()}점 이상이면 가스트의 눈물을 받을 수 있어요`,
      cx, by - U * 6.2, U * 3, win ? '#9ff6ff' : '#c9a89a');
    const ready = game.resultTime > RESULT_LOCK; // 계속 쏘던 총알이 실수로 버튼을 누르지 않게 잠깐 잠금
    button('다음 사람', cx - U * 30, by, U * 27, U * 8, nextPlayer, ready, true);
    button('다시 하기', cx, by, U * 27, U * 8, retrySolo, ready);
    button('결과 보기', cx + U * 30, by, U * 27, U * 8, closeRanking, ready);
    return;
  }
  if (today) {
    button('◀ 전날', cx - U * 34, by, U * 24, U * 8, () => turnRankDay(-1), rankView.day > -RANK_DAYS_BACK);
    button('돌아가기', cx, by, U * 30, U * 8, closeRanking);
    button('다음 날 ▶', cx + U * 34, by, U * 24, U * 8, () => turnRankDay(1), rankView.day < 0);
  } else {
    button('◀ 이전', cx - U * 34, by, U * 24, U * 8, () => turnRankPage(-1), rankView.page > 0);
    button('돌아가기', cx, by, U * 30, U * 8, closeRanking);
    button('다음 ▶', cx + U * 34, by, U * 24, U * 8, () => turnRankPage(1), rankView.page < pages - 1);
  }
  if (list?.length) {
    const end = Math.min(list.length, start + per);
    const info = today
      ? `${rankView.day === 0 ? '오늘' : '이날'} 올라온 기록 중 상위 10명  ·  지난 날짜는 [◀ 전날] 로`
      : `${start + 1}~${end}위  ·  ${rankView.page + 1}/${pages}쪽  ·  총 ${list.length}명${list.length >= RANK_ALL_LIMIT ? ` (상위 ${RANK_ALL_LIMIT}명까지 표시)` : ''}`;
    text(info, cx, by - U * 7, U * 2.8, '#c9a89a');
  }
}

// 게임 중 점수판·진행 막대 판의 진하기. 바로 뒤로 밝은 용암 폭포가 지나가도 글자가 읽히게 (예전 0.6)
const HUD_PANEL_ALPHA = 0.75;

// 2인 대결: 왼쪽 1P, 오른쪽 2P 점수판. 앞선 사람 점수 옆에 작은 왕관
function drawVersusScores(time) {
  const [a, b] = game.players;
  const lead = a.score === b.score ? -1 : a.score > b.score ? 0 : 1;
  const pw = U * 46, ph = U * 13;
  [a, b].forEach((p, i) => {
    const left = i === 0 ? U * 2.5 : W - pw - U * 2.5;
    const align = i === 0 ? 'left' : 'right';
    const tx = i === 0 ? left + U * 3 : left + pw - U * 3;
    panel(left, U * 2.5, pw, ph, HUD_PANEL_ALPHA);
    ctx.fillStyle = PLAYER_COLORS[i];
    ctx.fillRect(i === 0 ? left : left + pw - U * 0.8, U * 2.5, U * 0.8, ph); // 플레이어 색 띠
    const label = playerLabel(p, i);
    text(label, tx, U * 6, fitTextSize(label, U * 3, pw - U * 6), PLAYER_COLORS[i], align);
    text(String(p.score), tx, U * 11.4, U * 7, '#ffffff', align);
    if (lead === i) {
      ctx.font = `bold ${Math.round(U * 7)}px ${FONT}`;
      const sw = ctx.measureText(String(p.score)).width;
      const crownX = i === 0 ? tx + sw + U * 4 : tx - sw - U * 4;
      drawCrown(crownX, U * 11, U * 4.4, time);
    }
  });
}

function drawHUD(time) {
  // 점수
  if (isTwoPlayer()) {
    drawVersusScores(time);
  } else {
    panel(U * 2.5, U * 2.5, U * 40, U * 13, HUD_PANEL_ALPHA);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(IMG.tear, U * 4.5, U * 4.5, U * 9, U * 9);
    text('점수', U * 16, U * 6, U * 3, '#ffd9b0', 'left');
    text(String(game.players[0].score), U * 16, U * 11.2, U * 7, '#ffffff', 'left');
  }

  // 남은 시간
  const danger = game.timeLeft <= 10;
  const pulse = danger ? 1 + 0.1 * Math.max(0, Math.sin(time * 12)) : 1;
  ctx.save();
  ctx.translate(W / 2, U * 9);
  ctx.scale(pulse, pulse);
  text(formatTime(game.timeLeft), 0, 0, U * 10, danger ? '#ff5a4a' : '#ffffff');
  ctx.restore();
  text(`${rules().label}  ·  Lv.${game.level}`, W / 2, U * 17, U * 3.6, LEVEL_COLORS[Math.min(game.level, LEVEL_COLORS.length) - 1]);

  const bonusOn = settings.bonusSeconds > 0 && Number.isFinite(game.nextBonus);
  // 2인 대결·토너먼트는 양쪽에 점수판이 있으니, 다음 보너스만 타이머 아래 글자로
  if (isTwoPlayer()) {
    if (game.overtime) text(`연장전${game.overtime > 1 ? ` ${game.overtime}` : ''}  ·  끝날 때 앞선 사람이 승리!`, W / 2, U * 21.5, U * 2.8, '#ff8a7a');
    else if (bonusOn && bonusSecondsNow() > 0) text(`다음 +${bonusSecondsNow()}초: 먼저 ${game.nextBonus}점`, W / 2, U * 21.5, U * 2.6, '#ffe14a');
    else if (bonusOn) text(`다음 레벨: 먼저 ${game.nextBonus}점`, W / 2, U * 21.5, U * 2.6, '#ffe14a');
    return;
  }

  // 목표 진행 막대: 가스트의 눈물 점수 / 다음 보너스 점수 표시
  const myScore = game.players[0].score;
  const bw = U * 52, bh = U * 3.4, bx = W - bw - U * 5, by = U * 9;
  const max = Math.max(rewardScoreNow(), bonusOn ? game.nextBonus : 0, myScore, 1) * 1.15;
  panel(bx - U * 2.5, U * 2.5, bw + U * 5, U * 13, HUD_PANEL_ALPHA);
  ctx.fillStyle = '#2a1010';
  ctx.fillRect(bx, by, bw, bh);
  const fill = clamp(myScore / max, 0, 1);
  ctx.fillStyle = myScore >= rewardScoreNow() ? '#7de3ff' : '#ff7a3a';
  ctx.fillRect(bx, by, bw * fill, bh);
  const mark = (score, label, color, img) => {
    const mx = bx + bw * clamp(score / max, 0, 1);
    ctx.fillStyle = color;
    ctx.fillRect(mx - U * 0.3, by - U * 1.2, U * 0.6, bh + U * 2.4);
    if (img) ctx.drawImage(img, mx - U * 2.4, by - U * 6, U * 4.8, U * 4.8);
    else text(label, mx, by - U * 3.4, U * 2.8, color);
    text(`${score}`, mx, by + bh + U * 2.6, U * 2.6, color);
  };
  mark(rewardScoreNow(), '', '#9ff6ff', IMG.tear);
  if (bonusOn) mark(game.nextBonus, `+${settings.bonusSeconds}초`, '#ffe14a');
}

function drawCountdown() {
  const n = Math.ceil(game.countdown);
  const f = n - game.countdown; // 0 → 1
  const s = lerp(1.6, 1, Math.min(1, f * 4));
  ctx.save();
  ctx.translate(W / 2, H * 0.45);
  ctx.scale(s, s);
  text(n > 0 ? String(n) : '시작!', 0, 0, U * 22, '#ffffff', 'center', { shadow: '#a3200c' });
  ctx.restore();
  text('가스트가 화염구를 쏘기 전에 맞혀라!', W / 2, H * 0.62, U * 4.5, '#ffd9b0');
}

// 2인 대결 결과: 두 사람을 나란히, 이긴 사람에게 왕관과 반짝이
function drawVersusResult(time) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, pw = Math.min(W - U * 8, U * 130), ph = U * 90;
  const px = cx - pw / 2, py = panelTopBelowCorner(ph);
  panel(px, py, pw, ph, 0.85);
  const [a, b] = game.players;
  const winner = a.score === b.score ? -1 : a.score > b.score ? 0 : 1;

  const tournament = game.mode === 'tournament';
  text(tournament ? Tournament.resultHeading() : '대결 종료!', cx, py + U * 7, U * 6, '#ffcf5a');
  if (tournament) text(Tournament.resultNote(), cx, py + U * 22.5, U * 3.2, '#ffe14a');
  if (winner < 0) text('무승부!', cx, py + U * 16, U * 9, '#ffffff', 'center', { shadow: '#a3200c' });
  else {
    const w = game.players[winner];
    const title = w.name === `${winner + 1}P` ? `${w.name} 승리!` : `${winner + 1}P ${w.name} 승리!`;
    text(title, cx, py + U * 16, fitTextSize(title, U * 9, pw - U * 10), PLAYER_COLORS[winner], 'center', { shadow: '#1a1a1a' });
  }

  const colW = pw / 2;
  [a, b].forEach((p, i) => {
    const ccx = px + colW * (i + 0.5);
    const top = py + U * 27;
    const st = p.stats;
    if (winner === i) {
      ctx.fillStyle = 'rgba(255, 216, 74, 0.10)';
      ctx.fillRect(px + colW * i + U * 2, top - U * 3, colW - U * 4, U * 44);
      drawSparkles(px + colW * i + U * 2, top - U * 3, colW - U * 4, U * 44, time, 14, 11 + i);
      drawCrown(ccx, top + U * 1, U * 8, time);
    }
    const label = playerLabel(p, i);
    text(label, ccx, top + U * 8, fitTextSize(label, U * 4.4, colW - U * 8), PLAYER_COLORS[i]);
    text(`${p.score}점`, ccx, top + U * 19, U * 12, '#ffffff', 'center', { shadow: '#a3200c' });
    const acc = st.shots ? Math.round(((st.kills + st.deflects) / st.shots) * 100) : 0;
    const statLine = `처치 ${st.kills} · 반사 ${st.deflects} · 빗나감 ${st.misses} · 명중률 ${acc}%`;
    text(statLine, ccx, top + U * 29, fitTextSize(statLine, U * 2.8, colW - U * 6), '#ffd9b0');
    if (gotReward(p)) {
      // 눈물 아이콘 + 글자를 한 덩어리로 가운데 정렬
      const msg = '가스트의 눈물 획득!';
      const ts = U * 6, gap = U * 1.5;
      ctx.font = `bold ${Math.round(U * 3.6)}px ${FONT}`;
      const tw = ctx.measureText(msg).width;
      const left = ccx - (ts + gap + tw) / 2;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(IMG.tear, left, top + U * 36 - ts / 2, ts, ts);
      text(msg, left + ts + gap, top + U * 36, U * 3.6, '#9ff6ff', 'left');
    }
  });
  // 가운데 VS
  text('VS', cx, py + U * 46, U * 7, '#ff8a3a', 'center', { shadow: '#1a1a1a' });

  const ready = game.resultTime > RESULT_LOCK;
  const by = py + ph - U * 8;
  if (tournament) { Tournament.drawResultButtons(cx, by, ready); return; }
  button('새 대결', cx - U * 17, by, U * 30, U * 9, () => openNameEntry('versus'), ready, true);
  button('다시 대결', cx + U * 17, by, U * 30, U * 9, () => startGame(), ready);
}

function drawResult(time) {
  if (isTwoPlayer()) { drawVersusResult(time); return; }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, H);
  // 위쪽은 오른쪽 위 운영 버튼과 제목이 붙지 않게 조금 비운다
  const cx = W / 2, pw = Math.min(W - U * 8, U * 110), ph = U * 90;
  const py = panelTopBelowCorner(ph);
  panel(cx - pw / 2, py, pw, ph, 0.82);
  const me = game.players[0];
  const win = gotReward(me);
  const st = me.stats;
  const title = `${me.name || '이름없음'} 님 · 미션 종료!`;
  text(title, cx, py + U * 7, fitTextSize(title, U * 6.5, pw - U * 8), '#ffcf5a');
  text(`${me.score}점`, cx, py + U * 19, U * 14, '#ffffff', 'center', { shadow: '#a3200c' });
  text(`${rules().label}  ·  레벨 ${game.level}`, cx, py + U * 28.5, U * 3, rules().color);
  drawResultStats(cx, py + U * 37, pw - U * 10, st);

  // 순위
  const ri = game.rankInfo;
  let rankLine = '';
  if (ri?.status === 'saving') rankLine = '랭킹 저장 중…';
  else if (ri?.status === 'error') rankLine = '랭킹 저장에 실패했어요';
  else if (ri?.status === 'rejected') rankLine = `랭킹에 올리지 못했어요: ${ri.reason}`;
  else if (ri?.status === 'saved' && ri.pending) rankLine = '인터넷 연결이 안 돼 이 PC에 보관했어요 (연결되면 자동으로 올라가요)';
  else if (ri?.status === 'saved') rankLine = `오늘 ${ri.rankToday}위  ·  전체 ${ri.rankAll}위`;
  text(rankLine, cx, py + U * 49, fitTextSize(rankLine, U * 4.4, pw - U * 8), ri?.status === 'error' || ri?.status === 'rejected' ? '#ff8a7a' : '#ffe14a');

  if (win) {
    const ts = U * 14, ty = py + U * 59 + Math.sin(time * 3) * U * 0.6;
    drawGlow(cx, ty, ts * 1.4, '160,246,255', 0.55);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(IMG.tear, cx - ts / 2, ty - ts / 2, ts, ts);
    text('가스트의 눈물 획득!', cx, py + U * 69.5, U * 5.5, '#9ff6ff');
    text('진행요원에게 가스트의 눈물을 받아가세요', cx, py + U * 75.2, U * 3.2, '#ffffff');
  } else {
    text('아쉬워요!', cx, py + U * 61, U * 7, '#ff8a7a');
    text(`${rewardScoreNow()}점 이상이면 가스트의 눈물을 받을 수 있어요`, cx, py + U * 70, U * 3.4, '#ffffff');
  }

  // 처음 화면은 오른쪽 위 운영 버튼으로 (같은 버튼을 두 번 두지 않는다)
  const ready = game.resultTime > RESULT_LOCK; // 계속 쏘던 총알이 실수로 버튼을 누르지 않게 잠깐 잠금
  const by = py + ph - U * 8;
  button('다음 사람', cx - U * 31, by, U * 28, U * 9, nextPlayer, ready, true);
  button('다시 하기', cx, by, U * 28, U * 9, retrySolo, ready);
  button('랭킹', cx + U * 31, by, U * 28, U * 9, openRanking, ready);
}

// 결과 화면 기록 칸 6개: 위에 이름(작게), 아래에 숫자(크게)
function drawResultStats(cx, y, width, st) {
  const acc = st.shots ? Math.round(((st.kills + st.deflects) / st.shots) * 100) : 0;
  const items = [
    ['처치', st.kills, '#9fe870'], ['반사', st.deflects, '#ffb347'], ['빗나감', st.misses, '#ff9a8a'],
    ['놓침', st.escapes, '#ff9a8a'], ['피격', st.hitsTaken, '#ff9a8a'], ['명중률', `${acc}%`, '#ffe14a'],
  ];
  const cw = width / items.length, h = U * 10.5;
  items.forEach(([label, value, color], i) => {
    const x = cx - width / 2 + cw * i;
    ctx.fillStyle = 'rgba(255, 220, 190, 0.06)';
    ctx.fillRect(x + U * 0.6, y - h / 2, cw - U * 1.2, h);
    ctx.strokeStyle = 'rgba(255, 170, 120, 0.25)';
    ctx.lineWidth = Math.max(1, U * 0.2);
    ctx.strokeRect(x + U * 0.6, y - h / 2, cw - U * 1.2, h);
    text(label, x + cw / 2, y - U * 2.4, U * 2.3, '#c9a89a');
    text(String(value), x + cw / 2, y + U * 2, U * 4.2, color);
  });
}

function drawBanner() {
  if (!banner) return;
  const a = banner.t < 0.2 ? banner.t / 0.2 : banner.t > banner.dur - 0.4 ? (banner.dur - banner.t) / 0.4 : 1;
  const s = banner.t < 0.2 ? lerp(1.4, 1, banner.t / 0.2) : 1;
  ctx.save();
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.translate(W / 2, H * 0.3);
  ctx.scale(s, s);
  text(banner.text, 0, 0, U * 9, banner.color);
  if (banner.sub) text(banner.sub, 0, U * 8, U * 4, '#ffffff');
  ctx.restore();
}

