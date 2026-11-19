// 가스트 사격 — 매 프레임 (update·draw·조준점·FPS·자동 화질)·시작
// game.js 에서 기능별로 나눈 조각. index.html 이 game.js 다음에 차례로 불러오며, 이름(함수·변수)을 모두 함께 쓴다.
'use strict';
// ---------- 매 프레임 ----------
function update(dt) {
  Guns.poll(); // 화면 그리기 직전에도 한 번 더 (조준점 위치를 최신으로)
  updateEmbers(dt);

  if (game.state === 'title' || game.state === 'solo') {
    if (ghasts.filter((g) => g.demo && g.state !== 'leave').length < 3 && Math.random() < dt) spawnGhast(true);
  }

  if (game.state === 'countdown') {
    game.countdown -= dt;
    const n = Math.ceil(game.countdown);
    if (n < game.lastTick) {
      game.lastTick = n;
      if (n > 0) Sound.tick(); else Sound.go();
    }
    if (game.countdown <= -0.5) {
      game.state = 'play';
      spawnGhast(false);
      spawnGhast(false);
    }
  }

  const running = game.state === 'play' && !game.paused;
  if (game.state === 'play' && game.paused) return;

  if (running) {
    game.elapsed += dt;
    const before = Math.ceil(game.timeLeft);
    game.timeLeft -= dt;
    const after = Math.ceil(game.timeLeft);
    if (after < before && after <= 10 && after > 0) Sound.tick();
    if (after === 10 && before === 11) showBanner('10초 남았어요!', '', '#ff8a7a', 1.4);

    const D = difficulty();
    game.spawnTimer -= dt;
    const alive = ghasts.filter((g) => g.hittable() && g.state !== 'leave').length;
    if (game.spawnTimer <= 0 && alive < D.maxGhasts) {
      spawnGhast(false);
      game.spawnTimer = D.spawnEvery * rand(0.7, 1.3);
    }
    if (alive === 0) game.spawnTimer = Math.min(game.spawnTimer, 0.2); // 화면이 비지 않게
  }

  const D = difficulty();
  for (const g of ghasts) g.update(dt, D);
  ghasts = ghasts.filter((g) => !g.dead);
  if (running) {
    for (const f of fireballs) f.update(dt);
    fireballs = fireballs.filter((f) => !f.dead);
    if (game.timeLeft <= 0) endGame();
  }
  if (game.state === 'initials') updateInitials(dt);
  if (game.state === 'solo') SoloReady.tick(dt);
  // 결과 화면, 그리고 게임이 끝나 바로 뜬 랭킹 화면에서도 잠금 시간을 센다
  if (['result', 'bracket', 'champion'].includes(game.state) || (game.state === 'ranking' && game.rankFrom === 'result')) game.resultTime += dt;
  if (game.state === 'result' && game.mode === 'tournament') Tournament.tickResult(); // 리그전: 잠깐 뒤 순위표로
  if (game.state === 'ranking' && rankAfterGame()) rankView.cycleT += dt;
  updateIdle(dt);
  // 잠긴 동안에는 오른쪽 위 버튼을 흐리게 (총으로는 안 눌림)
  cornerEl.classList.toggle('locked', CORNER_GUN_STATES.includes(game.state) && cornerLocked());

  updateParts(dt);
  shake = Math.max(0, shake - dt * U * 8);
  flash.a = Math.max(0, flash.a - dt * 1.8);
  if (banner) { banner.t += dt; if (banner.t >= banner.dur) banner = null; }
}

let bgShaken = false;
function draw(time) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height); // 위 캔버스만 지운다 (배경은 아래 캔버스에 그대로)
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
  buttons = [];

  // 흔들림은 게임 세계에만 적용 (아래 배경 캔버스는 CSS 로 같이 흔든다)
  ctx.save();
  if (shake > 0) {
    const dx = rand(-1, 1) * shake, dy = rand(-1, 1) * shake;
    ctx.translate(dx, dy);
    bgCanvas.style.transform = `translate(${dx}px, ${dy}px)`;
    bgShaken = true;
  } else if (bgShaken) {
    bgCanvas.style.transform = '';
    bgShaken = false;
  }
  drawBackground(time);
  [...ghasts].sort((a, b) => a.z - b.z).forEach((g) => g.draw(time));
  [...fireballs].sort((a, b) => a.p - b.p).forEach((f) => f.draw());
  drawParts();
  ctx.restore();

  if (flash.a > 0) {
    ctx.globalAlpha = flash.a;
    ctx.fillStyle = flash.color;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  if (game.state === 'title') drawTitle(time);
  if (game.state === 'solo') drawSoloReady(time);
  syncSoloInput();
  if (game.state === 'countdown') { drawHUD(time); drawCountdown(); }
  if (game.state === 'play') drawHUD(time);
  if (game.state === 'result') drawResult(time);
  if (game.state === 'ranking') drawRanking(time);
  if (game.state === 'initials') drawInitials(time);
  if (game.state === 'bracket') Tournament.drawBracketScreen(time);
  if (game.state === 'champion') Tournament.drawChampion(time);
  if (game.state === 'aimtest') drawAimTest();
  if (game.state === 'gunsetup') drawGunSetup();
  if (['title', 'solo', 'bracket'].includes(game.state)) drawGunStatus(game.state === 'solo' ? [0] : [0, 1]);
  drawBanner();
  drawIdleNotice();

  if (game.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    // 처음 화면 버튼으로 멈췄으면 한 번 더 묻는다 (이번 판 점수는 저장되지 않음)
    const asking = game.confirmHome;
    // 총이 빠져서 저절로 멈췄으면 그 까닭을 보여 준다 (Guns.onUnplug)
    const note = !asking && game.pauseNote;
    text(asking ? '처음 화면으로 갈까요?' : note ? note.title : '일시정지', W / 2, H * 0.38, U * (asking || note ? 9 : 12), note ? '#ff8a7a' : '#ffffff');
    text(asking ? '이번 판은 끝나고 점수는 저장되지 않아요' : note ? note.sub : 'P 또는 Space 를 누르면 계속합니다', W / 2, H * 0.38 + U * 10, U * 4, '#ffd9b0');
    button('계속하기', W / 2 - U * 22, H * 0.62, U * 38, U * 11, resumeGame, true, true);
    button('처음 화면', W / 2 + U * 22, H * 0.62, U * 38, U * 11, goTitle);
  }

  // 조준점은 게임 중(+총 조준 테스트)에만 그린다.
  // 처음 화면·랭킹·결과 화면에서는 버튼을 누르기 쉽게 보통 마우스 커서를 보여 준다.
  const inGame = (game.state === 'play' || game.state === 'countdown') && !game.paused;
  const showBig = (inGame && settings.aimMode === 'big') || game.state === 'aimtest';
  const hideCursor = showBig || (inGame && settings.aimMode === 'hidden');
  const cursor = hideCursor ? 'none' : inGame ? 'crosshair' : 'default';
  if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  // 2인 대결에서는 마우스 조준점 대신 총마다 색이 다른 조준점을 그린다
  // 게임 중 총(게임패드)이 한 번이라도 움직였으면 마우스 조준점은 그리지 않는다 (총 조준점 + 마우스 조준점이 겹쳐 3개로 보이던 문제)
  const mouseAim = showBig && aim.seen && game.state !== 'aimtest' && !(inGame && Guns.list().some((s) => s.moved));
  if (mouseAim) drawAim(aim.x, aim.y);
  // 게임패드로 연결된 총의 조준점 (메뉴에서도 보여야 총으로 버튼을 고를 수 있다)
  Guns.draw(time);
  // 다른 창(메신저·탐색기 등)이 앞에 오면 브라우저가 총(게임패드) 입력을 멈춘다 → 바로 알 수 있게 크게 알린다
  if (Guns.list().length && !document.hasFocus()) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, H / 2 - U * 9, W, U * 18);
    text('게임 창을 한 번 클릭하세요', W / 2, H / 2 - U * 2.5, U * 6, '#ffe14a');
    text('다른 창이 앞에 있어서 총이 멈춰 있어요', W / 2, H / 2 + U * 4.5, U * 3, '#ffffff');
  }
}

// 큰 조준점 (프로젝터 화면에서도 잘 보이게). 크기는 설정의 '조준점 크기'
// glow: 테두리 빛 색 (2인 대결의 1P/2P 색), label: 조준점 아래 이름표
function drawAim(x, y, glow = null, label = '') {
  const s = clamp(settings.aimSize, 50, 300) / 100;
  const r = U * 3.8 * s, gap = U * 1.1 * s, len = U * 2.4 * s, t = Math.max(3, U * 0.6 * s);
  // 검은 테두리 → 노란(또는 플레이어 색) 빛 → 흰 선 순서로 겹쳐 어두운 네더 배경에서도 또렷하게
  for (const [color, w] of [['rgba(0,0,0,0.85)', t + U * 0.7 * s], [glow || 'rgba(255,225,74,0.9)', t + U * 0.28 * s], ['#ffffff', t]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r - len, y); ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y); ctx.lineTo(x + r + len, y);
    ctx.moveTo(x, y - r - len); ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap); ctx.lineTo(x, y + r + len);
    ctx.stroke();
  }
  // 한가운데 빨간 점 (실제로 맞는 자리)
  const dot = t * 1.4;
  ctx.fillStyle = '#000';
  ctx.fillRect(x - dot / 2 - 2, y - dot / 2 - 2, dot + 4, dot + 4);
  ctx.fillStyle = '#ff3a2a';
  ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
  if (label) text(label, x, y + r + len + U * 2.4, U * 3, glow || '#ffffff');
}

let last = performance.now();
// FPS(1초에 화면을 몇 번 그리는지) — 설정에서 켜면 왼쪽 아래에 표시. 60 근처면 부드럽고, 30 아래면 버벅임
const fpsMeter = { frames: 0, since: performance.now(), value: 0, worst: 0 };
// 오류가 나도 게임이 멈추지 않게: 콘솔에만 남기고 (같은 오류가 계속 나도 처음 몇 번만) 다음 프레임은 계속 그린다
const errorLog = { count: 0 };
function reportError(err) {
  errorLog.count++;
  if (errorLog.count <= 5) console.error('[가스트 사격] 오류가 났지만 게임은 계속합니다', err);
}

// 렉 자동 방지: 화면이 3초 넘게 40fps 아래로 버벅이면 한 단계씩 가볍게 바꾼다 (설정에서 끌 수 있음)
//   선명하게 → 보통 → 가볍게 → 가볍게 + 효과 줄이기
const autoPerf = { lowSeconds: 0, lastChange: 0 };
function lightenOneStep() {
  if (settings.quality === 'sharp') settings.quality = 'normal';
  else if (settings.quality === 'normal') settings.quality = 'light';
  else if (!settings.fewEffects) settings.fewEffects = true;
  else return false; // 더 줄일 게 없음
  // 저장하지 않는다: 잠깐 버벅이거나 30Hz 프로젝터라서 낮춘 화질이 운영자가 고른 설정을 영영 바꾸지 않게 (이번에 켠 동안만)
  resize();
  clearTextCache();
  return true;
}
function checkAutoPerf(now) {
  // 게임 중이고 이 창을 보고 있을 때만 잰다 (다른 프로그램을 쓰느라 느려진 건 게임 렉이 아니라서 화질을 낮추지 않는다)
  const playing = (game.state === 'play' || game.state === 'countdown') && !game.paused;
  if (!settings.autoQuality || document.hidden || !playing || !document.hasFocus()) { autoPerf.lowSeconds = 0; return; }
  // 창을 바꿨다 돌아오는 등 1초 넘게 멈췄던 구간은 '렉'이 아니므로 세지 않는다
  if (fpsMeter.lastWorst > 1000) { autoPerf.lowSeconds = 0; return; }
  autoPerf.lowSeconds = fpsMeter.value < 40 ? autoPerf.lowSeconds + 1 : 0;
  if (autoPerf.lowSeconds >= 3 && now - autoPerf.lastChange > 10000) {
    autoPerf.lowSeconds = 0;
    autoPerf.lastChange = now;
    if (lightenOneStep()) showBanner('렉 방지: 화면을 가볍게 바꿨어요', '설정 → 화질에서 되돌릴 수 있어요', '#9ff6ff', 2.2);
  }
}

function frame(now) {
  // 다음 프레임을 먼저 예약 → 아래에서 오류가 나도 게임이 멈춰 버리지 않는다
  requestAnimationFrame(frame);
  const gap = now - last;
  const dt = Math.min(0.05, gap / 1000);
  last = now;
  try {
    update(dt);
    draw(now / 1000);
  } catch (err) {
    reportError(err);
  }
  fpsMeter.frames++;
  fpsMeter.worst = Math.max(fpsMeter.worst, gap);
  if (now - fpsMeter.since >= 1000) {
    fpsMeter.value = Math.round((fpsMeter.frames * 1000) / (now - fpsMeter.since));
    fpsMeter.lastWorst = Math.round(fpsMeter.worst);
    fpsMeter.frames = 0;
    fpsMeter.worst = 0;
    fpsMeter.since = now;
    checkAutoPerf(now); // 1초마다 렉 여부 확인
  }
  if (settings.showFps) {
    const color = fpsMeter.value >= 50 ? '#7dff6a' : fpsMeter.value >= 30 ? '#ffe14a' : '#ff5a4a';
    const q = { sharp: '선명', normal: '보통', light: '가볍게' }[settings.quality] || '보통';
    text(`${fpsMeter.value} fps · 최장 ${fpsMeter.lastWorst ?? 0}ms · 화질 ${q}${settings.fewEffects ? ' · 효과 적게' : ''}`, U * 2, H - U * 2, U * 2.4, color, 'left', { live: true });
  }
}

// ---------- 시작 ----------
window.addEventListener('resize', resize);
resize();
// 그림과 함께 '뒤에 불러오는 스크립트(tournament.js · contest-manage.js 등)'까지 다 읽은 뒤 시작한다.
// 그림이 먼저 끝나면 처음 화면을 그리다 아직 없는 Tournament·ContestManage 를 찾아 시작이 멈춘다 (2026-11-19 확인)
const scriptsReady = document.readyState === 'loading'
  ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
  : Promise.resolve();
Promise.all([loadImages(), scriptsReady])
  .then(() => {
    buildGhastVariants();
    goTitle();
    requestAnimationFrame(frame);
    loadLocalAdminKey();
    // 효과음 준비. 보통 브라우저에서는 첫 클릭·키 입력 때 소리가 켜진다 (Sound.init 이 다시 불리며 재개).
    Sound.init();
  })
  .catch((err) => {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`오류: ${err.message} (assets 폴더를 확인하세요)`, 20, 40);
  });
