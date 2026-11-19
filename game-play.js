// 가스트 사격 — 총 조준 테스트·게임 흐름 (처음 화면·시작·끝·점수)·입력 (터치·마우스·펜)·연사 차단
// game.js 에서 기능별로 나눈 조각. index.html 이 game.js 다음에 차례로 불러오며, 이름(함수·변수)을 모두 함께 쓴다.
'use strict';
// ---------- 총 조준 테스트 ----------
// 화면 9곳의 표적을 쏴서, 총이 가리키는 곳과 실제로 맞은 곳이 얼마나 어긋나는지 본다.
// 많이 어긋나면 GUN4IR 프로그램에서 캘리브레이션을 다시 하면 된다.
const aimTest = { shots: [] };
function aimTargets() {
  const xs = [0.08, 0.5, 0.92], ys = [0.14, 0.5, 0.88];
  return ys.flatMap((y) => xs.map((x) => ({ x: x * W, y: y * H })));
}
function openAimTest() {
  aimTest.shots = [];
  game.state = 'aimtest';
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave(true));
  updateCornerButtons();
}
function recordAimShot(x, y) {
  let best = null;
  for (const t of aimTargets()) {
    const d = Math.hypot(t.x - x, t.y - y);
    if (!best || d < best.d) best = { t, d };
  }
  aimTest.shots.push({ x, y, tx: best.t.x, ty: best.t.y, d: best.d });
  if (aimTest.shots.length > 40) aimTest.shots.shift();
  Sound.hit();
}

function closeRanking() {
  if (game.rankFrom === 'result') { game.state = 'result'; updateCornerButtons(); } else goTitle();
}

function spawnGhast(demo) {
  const g = new Ghast(demo);
  // 다른 가스트와 너무 겹치지 않는 자리 찾기
  for (let i = 0; i < 10; i++) {
    g.pickTarget();
    g.x = g.tx; g.y = g.ty;
    if (ghasts.every((o) => o.dead || Math.hypot(o.x - g.x, o.y - g.y) > (o.w + g.w) * 0.55)) break;
  }
  g.pickTarget();
  ghasts.push(g);
  puff(g.x, g.y, g.w, g.h); // 나타날 때 연기 한 줌
  if (demo) return;
  Sound.spawn();
  // 특별한 가스트는 이름과 점수를 잠깐 띄워 알려 준다
  if (g.type !== 'normal') {
    const color = { small: '#bfe8ff', big: '#ffd9b0', angry: '#ff6a5a', gold: '#ffd84a' }[g.type];
    addPart({ kind: 'text', text: `${g.T.name} ${g.points}점`, x: g.x, y: g.y - g.h * 0.6, vy: -U * 2, size: U * 3.4, life: 1.4, color, shadow: '#1a1a1a' });
  }
  if (g.type === 'gold') Sound.goldAppear();
}

function goTitle() {
  if (confirmOpen()) closeConfirm(false);
  game.state = 'title';
  game.diff = settings.diffLevel; // 처음 화면의 설명·랭킹 띠는 고른 난이도로
  game.level = 1; // 처음 화면의 가스트는 천천히
  game.paused = false;
  game.pauseNote = null;
  game.confirmHome = false;
  fireballs = [];
  resetPlayFx();
  ghasts.forEach((g) => g.hittable() && g.leave(true));
  refreshTitleTop();
  updateCornerButtons();
}

// mode·names 를 비우면 방금 한 판과 같은 모드·이름으로 다시 시작 ('다시 하기')
// opts: { seconds 경기 시간, diff 난이도 } — 토너먼트는 대진표에 정한 값, 그 밖에는 설정의 값
function startGame(mode = game.mode, names = game.players.map((p) => p.name), opts = {}) {
  Sound.init();
  game.mode = mode;
  game.diff = diffKeyOf(opts.diff ?? settings.diffLevel);
  const count = isTwoPlayer(mode) ? 2 : 1;
  game.players = Array.from({ length: count }, (_, i) => ({
    name: names[i] || (count === 2 ? `${i + 1}P` : '이름없음'),
    score: 0,
    rewardShown: false,
    stats: { shots: 0, kills: 0, deflects: 0, hitsTaken: 0, misses: 0, escapes: 0 },
  }));
  game.state = 'countdown';
  game.countdown = 3;
  game.lastTick = 4;
  game.paused = false;
  game.pauseNote = null;
  game.baseSeconds = opts.seconds ?? settings.gameSeconds;
  game.timeLeft = game.baseSeconds;
  game.overtime = 0;
  game.elapsed = 0;
  game.spawnTimer = 0;
  game.nextBonus = bonusGaps()[0] ?? Infinity;
  game.bonusCount = 0;
  game.level = 1;
  game.rankInfo = null;
  // 1인 기록전: 시작하자마자 게임 시작 표를 받아 둔다 (기록을 올릴 때 필요)
  game.playToken = mode === 'solo' ? Ranking.takeToken(rules().game).catch(() => null) : null;
  banner = null;
  resetPlayFx();
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave(true));
  updateCornerButtons();
}

function endGame() {
  // 토너먼트는 비기면 끝내지 않고 연장전으로 이어 간다
  if (game.mode === 'tournament' && Tournament.tied()) { Tournament.startOvertime(); return; }
  game.state = 'result';
  game.resultTime = 0;
  game.timeLeft = 0;
  banner = null; // 끝나기 직전에 뜬 '레벨 UP!' 같은 안내가 결과 화면(1인·2인 모두) 위에 남지 않게
  // 남은 화염구는 공중에서 터뜨림
  fireballs.forEach((f) => burstFire(f.x, f.y, 0.6));
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave(true));
  const win = game.players.some(gotReward);
  Sound.end(win || isTwoPlayer());
  updateCornerButtons();
  if (game.mode === 'tournament') Tournament.finishMatch();

  // 랭킹은 1인 기록전만 저장한다 (2인 대결은 승패만). 먼저 랭킹에 남길 이름을 총으로 쏴서 받는다
  if (game.mode !== 'solo') return;
  openInitials();
}

// 이름 입력을 마치면 기록을 저장하고 오늘 랭킹을 보여 준다
function saveSoloRecord() {
  const me = game.players[0];
  game.state = 'result';   // 랭킹을 닫으면 결과 화면으로 (openRanking 이 이 값을 본다)
  game.resultTime = 0;     // 이름을 쏘던 총알이 랭킹 화면 버튼을 누르지 않게 잠금을 다시 센다
  game.rankInfo = { status: 'saving' };
  // 1인 기록전은 끝나자마자 오늘 랭킹을 보여 준다 (저장이 끝나면 내 기록이 들어간 순위로 다시 불러온다)
  rankView.scope = 'today';
  openRanking();
  // 공개 웹판에서 점수에 영향을 주는 설정(제한 시간·보너스·감점 등)을 바꾼 판은 랭킹에 올리지 않는다
  const changed = isPublicWeb() ? RankRules.changedRules(settings, DEFAULTS) : [];
  if (changed.length) {
    game.rankInfo = { status: 'rejected', reason: '설정(규칙)을 바꾼 판은 올리지 않아요 — 설정 창 [기본값]으로 되돌리면 올라가요' };
    return;
  }
  const gameId = rules().game; // 난이도마다 랭킹이 따로
  Promise.resolve(game.playToken)
    .then((token) => Ranking.add({ name: me.name || '이름없음', score: me.score, kills: me.stats.kills, token, game: gameId, stats: soloStats(me) }))
    .then((r) => {
      if (r.rejected) { game.rankInfo = { status: 'rejected', reason: r.rejected }; return; }
      game.rankInfo = { status: 'saved', ...r };
      game.lastEntryId = r.id;
    })
    .catch((err) => { console.error(err); game.rankInfo = { status: 'error' }; })
    .finally(() => { if (game.state === 'ranking' && game.rankFrom === 'result') setRankScope(rankView.scope); });
}

// 공개 웹판(사이트에서 연 게임). 앱·이 PC 의 로컬 서버(serve.cjs)·파일로 연 게임은 행사용이라 아니다
const isPublicWeb = () => !APP_VERSION && location.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(location.hostname);
// 랭킹과 함께 보내는 익명 경기 기록 (밸런스 조정용, 이름 없음 — 서버 rank-rules.js cleanStats 가 정리)
function soloStats(me) {
  return {
    seconds: game.elapsed,
    shots: me.stats.shots,
    kills: me.stats.kills,
    deflects: me.stats.deflects,
    hitsTaken: me.stats.hitsTaken,
    misses: me.stats.misses,
    escapes: me.stats.escapes,
    level: game.level,
    input: settings.inputMode === 'touch' ? 'touch' : 'gun',
    client: APP_VERSION ? `app ${APP_VERSION}` : 'web',
  };
}

// 2인 대결에서 각 플레이어를 구분하는 색 (조준점·점수판·점수 팝업)
const PLAYER_COLORS = ['#5ae8ff', '#ff7ad9'];
// 두 사람이 겨루는 모드 (2인 대결·토너먼트 경기): 점수판·총 1P/2P 구분·결과 화면이 같다
const isTwoPlayer = (mode = game.mode) => mode === 'versus' || mode === 'tournament';
const topScore = () => Math.max(0, ...game.players.map((p) => p.score));
// '1P 다희' 처럼 자리와 이름을 함께. 이름을 비워 '1P' 그대로면 한 번만
const playerLabel = (p, i) => (p.name === `${i + 1}P` ? p.name : `${i + 1}P  ${p.name}`);

// who: 점수를 받는 플레이어 (0 = 1P, 1 = 2P)
function addScore(n, who = 0) {
  const p = game.players[who];
  if (!p) return;
  p.score = Math.max(0, p.score + n);
  let rewardNow = false;
  if (!p.rewardShown && p.score >= rewardScoreNow()) {
    p.rewardShown = true;
    rewardNow = true;
    Sound.reward();
    const title = isTwoPlayer() ? `${p.name} 가스트의 눈물 확보!` : '가스트의 눈물 확보!';
    showBanner(title, `${rewardScoreNow()}점 달성`, '#9ff6ff');
  }
  // 마지막 보너스 이후 점수를 새로 30 → 50 → 70 … 모을 때마다 시간 추가
  // (감점으로 내려갔다 다시 넘어도 같은 구간은 한 번만). 2인 대결은 앞선 사람 점수 기준
  const top = topScore();
  if (settings.bonusSeconds > 0 && top >= game.nextBonus) {
    const reached = game.nextBonus;
    const gaps = bonusGaps();
    while (top >= game.nextBonus) {
      game.timeLeft += bonusSecondsNow();
      game.bonusCount++;
      game.level++;
      // 다음 보너스까지 새로 모아야 하는 점수 (목록이 끝나면 마지막 값을 계속 사용)
      game.nextBonus += gaps[Math.min(game.bonusCount, gaps.length - 1)];
    }
    Sound.bonus();
    // 가스트의 눈물과 같은 점수에서 터지면 알림을 하나로 합친다
    // 레벨마다 무엇이 바뀌는지 알려 준다
    const what = game.level >= 4 ? '악랄 모드! 화염구를 여러 발 쏴요'
      : game.level === 3 ? '가스트들이 화났다! 갑자기 돌진해요'
      : '가스트가 빨라지고 점수도 올라가요';
    const sub = bonusSecondsNow() > 0 ? `+${bonusSecondsNow()}초 보너스  ·  ${what}` : what;
    const color = game.level >= 3 ? '#ff6a5a' : '#ffe14a';
    if (rewardNow) showBanner(`가스트의 눈물 확보!  Lv.${game.level}`, sub, '#9ff6ff', 2.8);
    else showBanner(`레벨 UP!  Lv.${game.level}`, sub, color, 2.6);
    doFlash(game.level >= 3 ? '#ff3a2a' : '#ffe14a', 0.25);
  }
}

// 가스트를 맞히지 못하고 화면 밖으로 흘려보냄
function ghastEscaped(gh) {
  if (game.state !== 'play' || gh.T.noEscapePenalty) return; // 황금 가스트는 놓쳐도 감점 없음
  Sound.escape();
  // 놓친 가스트는 모두의 책임: 2인 대결이면 두 사람 모두 감점
  const pen = penaltyOf('escape');
  game.players.forEach((p, i) => {
    p.stats.escapes++;
    if (pen > 0) addScore(-pen, i);
  });
  if (pen > 0) {
    // 가스트가 사라진 쪽 화면 가장자리에 표시
    const x = clamp(gh.x, U * 14, W - U * 14); // '-1 놓침!' 글자가 화면 끝에 잘리지 않게
    popupScore(x, clamp(gh.y, U * 22, H - U * 10), `-${pen} 놓침!`, '#ff6a5a');
  }
}

// 화염구가 화면에 닿음 = 플레이어 피격
// 방금 처치된 가스트 자리 (0.4초 동안). 같은 가스트를 한발 늦게 쏜 탄은 감점하지 않는다
const LATE_SHOT_MS = 400;
let recentKills = [];
function rememberKill(g) {
  const now = performance.now();
  const { x, y } = g.center();
  recentKills = [...recentKills.filter((k) => now - k.at < LATE_SHOT_MS), { x, y, hw: g.w * 0.6, hh: g.h * 0.6, at: now }];
}
function justKilledAt(px, py) {
  const now = performance.now();
  return recentKills.some((k) => now - k.at < LATE_SHOT_MS && Math.abs(px - k.x) <= k.hw && Math.abs(py - k.y) <= k.hh);
}
// 피격 번쩍임: 큰 화면 전체가 빨갛게 연달아 깜빡이지 않게 0.4초 안에는 다시 번쩍이지 않고, 세기도 낮춘다
let lastHitFlashAt = -1e9;
function hitFlashReady() {
  const now = performance.now();
  if (now - lastHitFlashAt < 400) return false;
  lastHitFlashAt = now;
  return true;
}

function playerHit(fb) {
  if (game.state !== 'play') return;
  Sound.explode();
  burstFire(fb.x, fb.y, 1.4);
  addScorch(fb.x, fb.y, fb.size);
  resetCombos(); // 화염구에 맞으면 모두 연속 명중이 끊긴다
  shake = Math.max(shake, settings.fewEffects ? 0 : U * 1.6);
  if (hitFlashReady()) doFlash('#ff2a10', settings.fewEffects ? 0.15 : 0.3);
  // 화면에 닿은 화염구는 모두가 맞은 것: 2인 대결이면 두 사람 모두 감점
  const pen = penaltyOf('hit');
  game.players.forEach((p, i) => {
    p.stats.hitsTaken++;
    if (pen > 0) addScore(-pen, i);
  });
  if (pen > 0) popupScore(fb.x, fb.y - U * 6, `-${pen}`, '#ff6a5a');
}

// ---------- 입력 (센서 터치 / 마우스 / 펜) ----------
const recentTaps = [];
function isDuplicateTap(x, y, now) {
  // 라이트건은 방아쇠 한 번 = 클릭 한 번이라 걸러낼 필요가 없다 (빠른 연사도 모두 인정)
  if (settings.inputMode === 'gun') return false;
  // 프로젝터 센서는 한 번 맞은 것을 여러 번 보낼 수 있어 짧은 시간·가까운 위치는 무시
  while (recentTaps.length && now - recentTaps[0].t > 500) recentTaps.shift();
  const dup = recentTaps.some((p) => now - p.t < settings.debounceMs && Math.hypot(p.x - x, p.y - y) < U * 4);
  recentTaps.push({ x, y, t: now });
  return dup;
}

// ---------- 연사 차단 ----------
// 규칙은 fire-gate.js (총·마우스마다 따로). 막힌 발은 점수·감점·소리 없이 버리고,
// 잠금이 새로 시작될 때만 그 자리에 '연사 금지' 를 띄우고 잠깐 알린다 (연사 스위치를 끄도록)
const fireGate = new Map(); // 입력 장치(마우스·총마다) → FireGate 상태
function allowShot(source, now) {
  const r = FireGate.next(fireGate.get(source) || FireGate.initial(), now);
  fireGate.set(source, r.state);
  return r;
}
function noticeRapidFire(x, y, who) {
  const tag = isTwoPlayer() ? `${who + 1}P ` : '';
  const color = isTwoPlayer() ? PLAYER_COLORS[who] : '#ff6a5a';
  popupScore(x, y - U * 4, `${tag}연사 금지!`, color);
  showBanner(`${tag}연사(Rapid Fire)가 감지됐어요`, `${(FireGate.LOCK_MS / 1000).toFixed(1)}초 동안 쏠 수 없어요 — 총의 연사 스위치를 끄고 한 발씩 쏘세요`, color, 2.2);
}

// 총으로 오른쪽 위 버튼을 누를 수 있는 화면. 게임 중(오른쪽 아래 '처음 화면')과 이름 쏘기 판은 빗나간 총알이
// 판을 멈추지 않게 빼 둔다
const CORNER_GUN_STATES = ['title', 'solo', 'result', 'ranking', 'bracket', 'champion', 'gunsetup', 'aimtest'];
function cornerButtonAt(x, y) {
  if (!CORNER_GUN_STATES.includes(game.state)) return null;
  const btn = document.elementFromPoint(x, y)?.closest('#corner-buttons button') || null;
  // [대회 관리]는 진행요원용 (마우스·K 키). 총으로 열리면 창이 총알을 막아 총만으로는 닫을 수 없다
  return btn?.id === 'btn-manage' ? null : btn;
}
// 게임이 끝난 직후에는 다른 버튼처럼 잠깐 잠근다 (계속 쏘던 총알이 설정·전체화면을 누르지 않게). 마우스는 바로 된다
function cornerLocked() {
  if (game.state === 'bracket') return game.resultTime <= TOURNAMENT.lock;
  const afterGame = game.state === 'result' || game.state === 'champion' || (game.state === 'ranking' && game.rankFrom === 'result');
  return afterGame && game.resultTime <= RESULT_LOCK;
}
// 총(조이스틱 모드)으로 설정 창 조작: 버튼은 누르고, 체크 칸은 켜고 끄고, 고르는 칸은 다음 값으로 (저장을 눌러야 적용).
// 숫자·글자 칸은 키보드로 (총으로 쏘면 그 칸에 커서만 둔다). 랭킹 기록 삭제는 실수로 지우지 않게 총으로 누르지 않는다
function clickSettingsByGun(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || !settingsEl.contains(el) || el.closest('#rank-admin, #rank-clear')) return;
  const btn = el.closest('button');
  if (btn) { btn.click(); return; }
  const field = el.closest('input, select') || el.closest('label')?.querySelector('input, select');
  if (!field) return;
  if (field.type === 'checkbox') field.checked = !field.checked;
  else if (field.tagName === 'SELECT') field.selectedIndex = (field.selectedIndex + 1) % field.options.length;
  else field.focus();
  Sound.tick();
}

let buttons = [];
// who: 쏜 사람 (0 = 1P, 1 = 2P). 마우스·1인 기록전은 항상 1P
// source: 어느 입력 장치에서 왔는지 (연사 차단을 장치마다 따로 하려고)
function onTap(x, y, who = 0, source = 'mouse') {
  // 설정 창이 열려 있으면 총알이 창 뒤의 화면(처음 화면 버튼 등)을 누르지 않게 한다.
  // 마우스는 창이 막아 주지만, 조이스틱 모드 총은 창과 상관없이 여기로 들어온다
  noteInput();
  const now = performance.now();
  if (isDuplicateTap(x, y, now)) return;
  const gate = allowShot(source, now);
  if (!gate.allowed) { // 연사: 점수·감점·소리 없이 버린다. 잠금이 막 시작됐을 때만 알림
    if (gate.lockStarted) noticeRapidFire(x, y, who);
    return;
  }
  Sound.init();
  // 설정 창이 열려 있으면 총알은 창 안만 누른다 (창 뒤의 처음 화면 버튼 등은 누르지 않는다).
  // 마우스는 창이 직접 받고, 조이스틱 모드 총만 여기로 온다. 확인 창이 떠 있으면 그 창의 버튼만
  if (confirmOpen()) {
    const btn = document.elementFromPoint(x, y)?.closest('button');
    // 되돌릴 수 없는 일(새 대회·지우기)은 총으로 '확인'을 못 누른다 (빗나간 한 발 방지). '취소'는 된다
    if (btn === confirmOk && confirmDanger && String(source).startsWith('pad:')) return;
    if (btn && confirmEl.contains(btn)) btn.click();
    return;
  }
  if (settingsOpen()) { clickSettingsByGun(x, y); return; }
  // 대회 관리 창(이름 고치기·기권)은 진행요원이 마우스·키보드로만 — 총알은 창도, 창 뒤 화면도 누르지 않는다
  if (ContestManage.isOpen()) return;

  // 입력 창(닉네임·토너먼트)이 떠 있으면 게임 화면 대신 창 안의 버튼(시작! · 🎲 · 취소 …)을 누른다.
  // 조이스틱 모드 총은 마우스 클릭이 아니라서 직접 그 자리의 버튼을 찾아 누른다. 창 밖을 쏘면 아무 일도 없다
  const form = overlayForm();
  if (form) {
    const el = document.elementFromPoint(x, y);
    const btn = el?.closest('button');
    const input = el?.closest('input');
    const select = el?.closest('select') || el?.closest('label')?.querySelector('select');
    if (btn && form.contains(btn)) btn.click();
    else if (select && form.contains(select)) {
      // 고르기 상자(리그전 판 수 등)는 쏠 때마다 다음 값으로
      select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      Sound.tick();
    } else if (input && form.contains(input)) input.focus();
    return;
  }

  // 오른쪽 위 운영 버튼(처음 화면·총 연결·총 테스트·전체화면·설정): 메뉴 화면에서는 총으로도 누른다
  const corner = cornerButtonAt(x, y);
  if (corner) {
    if (!cornerLocked()) corner.click();
    return;
  }

  if (settings.showTouches) {
    addPart({ kind: 'ring', x, y, size: U * 1.5, grow: U * 18, life: 0.3, color: 'rgba(255,255,255,0.9)' });
    addPart({ kind: 'cross', x, y, size: U * 1.6, life: 0.35, color: '#ffffff' });
  }

  if (game.state === 'aimtest') {
    for (const b of buttons) {
      if (b.enabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.action(); return; }
    }
    recordAimShot(x, y);
    return;
  }
  if (['title', 'solo', 'result', 'ranking', 'gunsetup', 'initials', 'bracket', 'champion'].includes(game.state)) {
    for (const b of buttons) {
      if (b.enabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.action(); return; }
    }
    if (game.state !== 'title' && game.state !== 'result') return;
    // 처음 화면의 가스트는 연습용으로 맞힐 수 있다 (점수 없음)
    const g = [...ghasts].sort((a, b) => b.z - a.z).find((o) => o.hittable() && o.hitTest(x, y));
    if (g) { g.kill(); Sound.hit(); }
    return;
  }
  // 일시정지 화면: '계속하기 / 처음 화면' 버튼만 받는다
  if (game.state === 'play' && game.paused) {
    for (const b of buttons) {
      if (b.enabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.action(); return; }
    }
    return;
  }
  if (game.state !== 'play') return;
  if (game.timeUp) return; // TIME UP! 동안에는 쏴도 점수·감점·기록 없음 (예전에 시간이 끝나면 바로 결과 화면이던 것과 같게)
  const shooter = game.players[who];
  if (!shooter) return;
  const versus = isTwoPlayer();
  // 2인 대결에서는 점수 팝업에 누가 얻었는지(1P/2P)와 그 사람 색을 붙인다
  const tag = (s) => (versus ? `${who + 1}P ${s}` : s);
  const tint = (c) => (versus ? PLAYER_COLORS[who] : c);

  shooter.stats.shots++;

  // 1) 가장 가까이 날아온 화염구부터
  const fb = [...fireballs].sort((a, b) => b.p - a.p).find((f) => !f.dead && f.hitTest(x, y));
  if (fb) {
    fb.dead = true;
    shooter.stats.deflects++;
    bumpCombo(who, 'hit', fb.x, fb.y + U * 8);
    Sound.deflect();
    burstFire(fb.x, fb.y, 0.7);
    shake = Math.max(shake, U * 0.6);
    if (settings.deflectPoints > 0) popupScore(fb.x, fb.y - U * 4, tag(`+${settings.deflectPoints} 반사!`), tint('#ffd25a'));
    addScore(settings.deflectPoints, who);
    return;
  }

  // 2) 가까운(큰) 가스트부터
  const g = [...ghasts].sort((a, b) => b.z - a.z).find((o) => o.hittable() && o.hitTest(x, y));
  if (g) {
    const c = g.center();
    g.kill(); // 한 번 맞히면 처치
    shooter.stats.kills++;
    Sound.hit(bumpCombo(who, 'hit', c.x, c.y + g.h * 0.62));
    if (g.type === 'gold') Sound.goldKill();
    shake = Math.max(shake, U * 0.8);
    doFlash('#ffffff', 0.12);
    const color = g.type === 'gold' ? '#ffd84a' : g.points > settings.killPoints ? '#ffb23a' : '#7dff6a';
    popupScore(c.x + g.w * 0.3, c.y - g.h * 0.5, tag(`+${g.points}`), tint(color));
    rememberKill(g);
    addScore(g.points, who);
    return;
  }

  // 2.5) 방금 터진 가스트 자리를 쏨 (상대가 한발 먼저 맞힘) → 늦었을 뿐이라 감점 없음
  if (isTwoPlayer() && justKilledAt(x, y)) { popupScore(x, y - U * 4, '늦었어요', '#c9a89a'); return; }

  // 3) 빗나감 (배경을 맞힘) → 쏜 사람만 감점
  shooter.stats.misses++;
  bumpCombo(who, 'miss');
  Sound.miss();
  for (let i = 0; i < 6; i++) {
    addPart({ x, y, vx: rand(-1, 1) * U * 8, vy: rand(-1, 0.3) * U * 8, g: U * 40, size: U * 0.6, life: 0.4, color: '#bbbbbb' });
  }
  const missPen = penaltyOf('miss');
  if (missPen > 0) {
    popupScore(x, y - U * 4, tag(`-${missPen}`), versus ? PLAYER_COLORS[who] : '#ff6a5a');
    addScore(-missPen, who);
  }
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  // 마우스(라이트건)는 왼쪽 버튼 = 방아쇠만 한 발로 친다.
  // 총의 재장전·보조 버튼이 오른쪽/가운데 클릭으로 들어와도 빗나감 감점이 되지 않게.
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  // 총이 게임패드로 연결돼 있으면 게임 중 마우스 클릭은 무시한다
  // (조이스틱 모드에서도 방아쇠가 클릭을 같이 보내면 한 발이 두 번 들어가지 않게)
  if ((game.state === 'play' || game.state === 'countdown') && Guns.active()) return;
  aim.x = e.clientX; aim.y = e.clientY; aim.seen = true;
  onTap(e.clientX, e.clientY, 0, e.pointerType === 'mouse' ? 'mouse' : `${e.pointerType}:${e.pointerId}`);
});
// 조준점 위치 (라이트건을 움직이면 마우스 커서가 따라 움직인다)
const aim = { x: 0, y: 0, seen: false };
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  aim.x = e.clientX; aim.y = e.clientY; aim.seen = true;
  aim.movedAt = performance.now(); // 총 연결 화면에서 '총이 마우스 모드' 를 알아채는 데 쓴다
});

