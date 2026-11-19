// 가스트 사격 — 설정 창·닉네임 입력·확인 창·조준점 켜기/끄기·게임 직후 이름 쏘기
// game.js 에서 기능별로 나눈 조각. index.html 이 game.js 다음에 차례로 불러오며, 이름(함수·변수)을 모두 함께 쓴다.
'use strict';
// ---------- 설정 창 ----------
const settingsEl = document.getElementById('settings');
const form = document.getElementById('settings-form');
const settingsOpen = () => !settingsEl.hidden;
function fillForm(values) {
  for (const [k, v] of Object.entries(values)) {
    const input = form.elements[k];
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = !!v; else input.value = v;
  }
}
function openSettings() {
  if (game.state === 'play') game.paused = true;
  fillForm(settings);
  settingsEl.hidden = false;
  loadRankAdmin();
}

// 설정 창의 랭킹 관리: 장난스러운 닉네임 등을 운영자가 지울 수 있게
async function loadRankAdmin() {
  const box = document.getElementById('rank-admin');
  const where = document.getElementById('rank-where');
  box.textContent = '불러오는 중…';
  let list = [];
  try {
    // 난이도별 랭킹을 모두 모아 [Easy] [Normal] [Hard] 순서로 보여 준다
    const lists = await Promise.all(DIFF_KEYS.map((key) => Ranking.top('all', 100, 0, DIFFICULTIES[key].game)
      .then((rows) => rows.map((r, i) => ({ ...r, rank: i + 1, diffLabel: DIFFICULTIES[key].label })))));
    list = lists.flat();
  } catch { box.textContent = '랭킹을 불러오지 못했습니다'; return; }
  const waiting = Ranking.pending().length;
  where.textContent = `저장 위치: Cloudflare 온라인 DB — ${Ranking.online ? '연결됨' : '연결 안 됨 (인터넷 확인)'}`
    + (waiting ? ` · 올리지 못한 기록 ${waiting}개 (연결되면 자동 업로드)` : '')
    + ' · 삭제하려면 아래 관리자 키가 필요합니다';
  box.textContent = '';
  if (!list.length) { box.textContent = '아직 기록이 없습니다'; return; }
  list.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'rank-row';
    const label = document.createElement('span');
    label.textContent = `[${r.diffLabel}] ${r.rank}. ${r.name} · ${r.score}점 · ${new Date(r.created_at).toLocaleString('ko-KR')}${r.pending ? ' · 업로드 대기' : ''}`;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '삭제';
    del.addEventListener('click', async () => {
      if (!(await askConfirm(`'${r.name}' (${r.score}점) 기록을 지울까요?`, { ok: '지우기', danger: true }))) return;
      await Ranking.remove(r.id).catch((err) => showNotice(`삭제 실패: ${err.message}`));
      loadRankAdmin();
      refreshTitleTop();
    });
    row.append(label, del);
    box.append(row);
  });
}
document.getElementById('rank-clear').addEventListener('click', async () => {
  if (!(await askConfirm('랭킹 기록을 모두(Easy·Normal·Hard) 지울까요?\n되돌릴 수 없습니다.', { ok: '모두 지우기', danger: true }))) return;
  for (const key of DIFF_KEYS) {
    await Ranking.clear(DIFFICULTIES[key].game).catch((err) => showNotice(`${DIFFICULTIES[key].label} 삭제 실패: ${err.message}`));
  }
  loadRankAdmin();
  refreshTitleTop();
});

// ---------- 닉네임 입력 ----------
const nameEl = document.getElementById('name-entry');
const nameForm = document.getElementById('name-form');
const nameInput = nameForm.elements.nickname;
const nameInput2 = nameForm.elements.nickname2;
const nameHint = document.getElementById('name-hint');
const nameTitle = document.getElementById('name-title');
const nameOpen = () => !nameEl.hidden;
// 화면 위에 떠 있는 입력 창(닉네임·토너먼트 참가자)의 form. 떠 있는 동안 총알은 창 안 버튼을 누른다
// 떠 있는 입력 창의 form. 게임 모양 확인 창이 떠 있으면 그것이 먼저 (총알·조준점이 그 창으로)
const overlayForm = () => document.querySelector('#confirm-overlay:not([hidden]) form') || document.querySelector('.overlay:not([hidden]) form');

// ---------- 게임 모양 확인 창 (브라우저 기본 confirm·alert 대신) ----------
// askConfirm(글) → Promise<boolean>. 마우스·총·Enter(확인)·Esc(취소)로 닫는다. notice: 확인 버튼만
const confirmEl = document.getElementById('confirm-overlay');
const confirmMsg = document.getElementById('confirm-msg');
const confirmOk = document.getElementById('confirm-ok');
const confirmCancel = document.getElementById('confirm-cancel');
let confirmResolve = null;
let confirmDanger = false; // 지금 뜬 창이 되돌릴 수 없는 일인지 (총으로는 '확인'을 못 누른다)
const confirmOpen = () => !confirmEl.hidden;
function askConfirm(message, { ok = '확인', cancel = '취소', danger = false, notice = false } = {}) {
  if (confirmResolve) closeConfirm(false); // 앞의 창은 취소로 닫는다
  confirmDanger = danger && !notice;
  confirmMsg.textContent = message;
  confirmOk.textContent = ok;
  confirmCancel.textContent = cancel;
  confirmCancel.hidden = notice;
  confirmOk.classList.toggle('danger', danger);
  confirmEl.hidden = false;
  Sound.tick();
  // 되돌릴 수 없는 일(danger)은 '취소'가 먼저 선택돼 있다 (Enter 로 실수하지 않게)
  setTimeout(() => (danger && !notice ? confirmCancel : confirmOk).focus(), 0);
  return new Promise((resolve) => { confirmResolve = resolve; });
}
const showNotice = (message) => askConfirm(message, { notice: true });
function closeConfirm(result) {
  const done = confirmResolve;
  confirmResolve = null;
  confirmEl.hidden = true;
  if (done) done(result);
}
confirmOk.addEventListener('click', () => closeConfirm(true));
confirmCancel.addEventListener('click', () => closeConfirm(false));
const gunCursor = document.getElementById('gun-cursor');
let nameMode = 'solo';

// ---------- 조준점 켜기/끄기 ----------
// 처음 화면 [조준점] 버튼 · V 키 · 이름 입력 창 🎯 버튼이 모두 이 값 하나(settings.aimMode)를 바꾸고, 고른 값은 저장된다.
// 게임 중에는 바꿀 수 없다 (처음 화면·이름 입력 창·설정에서만). '작은 십자'는 설정 창에서만 고른다
const AIM_LABELS = { big: '조준점 켬', small: '조준점 작게', hidden: '조준점 끔' };
const aimOn = () => settings.aimMode !== 'hidden';
const aimLabel = () => AIM_LABELS[settings.aimMode] || AIM_LABELS.big;
// 처음 화면 조준점 버튼의 가운데 ('랭킹' 오른쪽. 화면 폭은 늘 160U 이상이라 안 넘친다)
const nameAimButton = document.getElementById('name-aim');
function updateNameAimButton() {
  nameAimButton.textContent = `🎯 ${aimLabel()}`;
  nameAimButton.classList.toggle('on', aimOn());
}
// 바뀐 상태는 버튼 글자·색(초록 켬 / 회색 끔)으로 바로 보인다. 큰 안내 글자는 처음 화면 제목·이름 입력 창 뒤에 겹쳐
// 지저분해서 띄우지 않고, 처음 화면에서는 버튼 바로 위에 작은 글자만 잠깐 띄운다 (빗나간 총알에 바뀌어도 알아채게)
function toggleAim() {
  settings = { ...settings, aimMode: aimOn() ? 'hidden' : 'big' };
  saveSettings();
  updateNameAimButton();
  Sound.tick();
  if (game.state === 'title' && !nameOpen()) {
    const p = titleAimButtonPos();
    // 버튼 바로 위에 잠깐 띄운다 (위로 천천히 떠오르며 사라짐)
    addPart({ kind: 'text', text: aimOn() ? '조준점 켜짐' : '조준점 꺼짐', x: p.x, y: p.y - U * (TITLE_BTN.h / 2 + 2.2), vy: -U * 0.8, size: U * 3.2, life: 1.4, color: aimOn() ? '#9fe870' : '#d8d8d8', shadow: '#1a1a1a' });
  }
}
// 이름 입력 창: 시작 직전에 확인하고 바꾼다 (총으로 쏴도 눌린다). 누른 뒤에도 Enter 로 바로 시작하도록 이름 칸으로 돌아간다
nameAimButton.addEventListener('click', () => { toggleAim(); nameInput.focus(); });

// 난이도 버튼 (닉네임 창·토너먼트 창에 있음). 고른 값은 저장되어 다음 사람에게도 그대로
function updateDiffButtons() {
  document.querySelectorAll('.diff-btn').forEach((b) => b.classList.toggle('on', b.dataset.diff === settings.diffLevel));
}
function setDiffLevel(key) {
  settings = { ...settings, diffLevel: diffKeyOf(key) };
  saveSettings();
  // 처음 화면 위에 창이 떠 있으면 뒤의 설명(감점·상품 점수)과 랭킹 띠도 바로 바꾼다
  if (game.state === 'title' || game.state === 'solo') { game.diff = settings.diffLevel; refreshTitleTop(); }
  if (game.state === 'solo') SoloReady.onDiffChange();
  updateDiffButtons();
  Sound.tick();
}
document.querySelectorAll('.diff-btn').forEach((b) => b.addEventListener('click', () => {
  setDiffLevel(b.dataset.diff);
  if (b.closest('#name-form')) nameInput.focus(); // Enter 로 바로 시작할 수 있게
}));
// 랜덤 닉네임: 형용사 + 동물 (예: 용감한 판다). 이름 칸을 열 때마다, 🎲 버튼을 누를 때마다 새로 뽑는다
const NAME_ADJECTIVES = [
  '용감한', '날쌘', '졸린', '배고픈', '수줍은', '씩씩한', '엉뚱한', '느긋한', '화난', '신난',
  '귀여운', '똑똑한', '부지런한', '까칠한', '명랑한', '조용한', '튼튼한', '반짝이는', '수상한', '행복한',
  '빠른', '느린', '용맹한', '당당한', '든든한', '말랑한', '쿨한', '깜찍한', '날렵한', '무서운',
];
const NAME_ANIMALS = [
  '판다', '호랑이', '토끼', '고양이', '강아지', '여우', '펭귄', '다람쥐', '부엉이', '수달',
  '코알라', '하마', '기린', '사자', '늑대', '곰', '오리', '거북이', '고슴도치', '햄스터',
  '돌고래', '치타', '알파카', '너구리', '참새', '두더지', '사슴', '물개', '악어', '고래',
];
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
// avoid: 이미 쓴 이름과 겹치지 않게 (2인 대결 두 칸, 🎲 다시 뽑기)
function randomNickname(...avoid) {
  for (let i = 0; i < 20; i++) {
    const name = cleanName(`${pickOne(NAME_ADJECTIVES)} ${pickOne(NAME_ANIMALS)}`);
    if (!avoid.includes(name)) return name;
  }
  return cleanName(`${pickOne(NAME_ADJECTIVES)} ${pickOne(NAME_ANIMALS)}`);
}
function fillRandomNames() {
  const first = randomNickname(nameInput.value);
  nameInput.value = first;
  if (nameMode === 'versus') nameInput2.value = randomNickname(first, nameInput2.value);
}
// mode: 'solo' 1인 기록전(닉네임 필수, 랭킹 저장) / 'versus' 2인 대결(이름 두 개, 비우면 1P·2P)
function openNameEntry(mode = 'solo') {
  Sound.init();
  if (mode === 'versus' && !ensureVersusGuns()) return;
  if (game.state !== 'title') goTitle();
  nameMode = mode;
  const versus = mode === 'versus';
  nameForm.classList.toggle('versus', versus);
  nameTitle.textContent = versus ? '2인 대결 — 이름을 입력하세요' : '1인 기록전 — 닉네임을 입력하세요';
  nameInput.placeholder = versus ? '1P 이름' : '예: 용감한 판다';
  nameInput.value = '';
  nameInput2.value = '';
  nameInput2.hidden = !versus;
  fillRandomNames();
  nameHint.textContent = versus
    ? '랜덤 이름이에요 · 직접 고쳐도 돼요 (대결은 랭킹에 저장되지 않아요)'
    : '랜덤 이름이에요 · 직접 고쳐도 돼요 (최대 12자, 랭킹에 기록)';
  nameHint.classList.remove('error');
  updateNameAimButton();
  updateDiffButtons();
  nameEl.hidden = false;
  // 글자를 치면 랜덤 이름이 바로 지워지고 새로 써지도록 전체 선택
  setTimeout(() => { nameInput.focus(); nameInput.select(); }, 0);
}
function closeNameEntry() { nameEl.hidden = true; }
// (토너먼트 참가자 창은 tournament.js)
// 2인 대결: 1P 칸에서 Enter 를 누르면 바로 시작하지 않고 2P 칸으로 넘어간다
nameInput.addEventListener('keydown', (e) => {
  if (nameMode === 'versus' && e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    nameInput2.focus();
  }
});
nameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = cleanName(nameInput.value);
  if (nameMode === 'versus') {
    closeNameEntry();
    startGame('versus', [name || '1P', cleanName(nameInput2.value) || '2P']);
    return;
  }
  closeNameEntry();
  // 다 지우고 시작하면 랜덤 이름으로
  startGame('solo', [name || randomNickname()]);
});
document.getElementById('name-cancel').addEventListener('click', closeNameEntry);
document.getElementById('name-random').addEventListener('click', () => {
  fillRandomNames();
  nameHint.classList.remove('error');
});
// 결과 화면 → 다음 사람/새 대결 (이름 새로 입력). 토너먼트는 대진표(또는 우승 발표)로
function nextPlayer() {
  if (game.mode === 'tournament') { Tournament.afterResult(); return; }
  if (game.mode === 'solo') { SoloReady.open(); return; } // 1인 기록전은 준비 화면(solo.js)으로
  openNameEntry(game.mode);
}
// 1인 기록전 '다시 하기': 새 랜덤 닉네임(방금 이름과 다르게)을 배정해 바로 다시 시작
function retrySolo() { startGame('solo', [randomNickname(game.players[0]?.name)]); }
function closeSettings() { settingsEl.hidden = true; }
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const next = { ...settings };
  for (const k of Object.keys(DEFAULTS)) {
    const input = form.elements[k];
    if (!input) continue;
    if (input.type === 'checkbox') next[k] = input.checked;
    else if (input.tagName === 'SELECT' || input.type === 'text' || input.type === 'password') next[k] = input.value;
    else {
      const n = parseFloat(input.value);
      if (Number.isFinite(n)) next[k] = n;
    }
  }
  settings = next;
  saveSettings();
  Sound.applyVolume();
  closeSettings();
  // 화질을 바꿨으면 그리는 해상도를 다시 맞추고, 그 해상도로 글자 그림을 새로 만든다
  resize();
  clearTextCache();
});
document.getElementById('settings-reset').addEventListener('click', () => fillForm(DEFAULTS));
document.getElementById('settings-close').addEventListener('click', closeSettings);
document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
document.getElementById('btn-aimtest').addEventListener('click', () => { Sound.init(); openAimTest(); });
document.getElementById('btn-gunsetup').addEventListener('click', () => { Sound.init(); openGunSetup(); });
const cornerEl = document.getElementById('corner-buttons');
function updateCornerButtons() {
  const menu = ['title', 'solo', 'result', 'bracket', 'champion'].includes(game.state);
  for (const id of ['btn-gunsetup', 'btn-aimtest', 'btn-fullscreen', 'btn-settings']) {
    document.getElementById(id).hidden = !menu;
  }
  // 처음 화면 버튼: 처음 화면이 아닌 곳 어디서나
  document.getElementById('btn-home').hidden = game.state === 'title';
  document.getElementById('btn-manage').hidden = !ContestManage.canOpen();
  if (!ContestManage.canOpen()) ContestManage.close();
  const corner = document.getElementById('corner-buttons');
  corner.classList.remove('hidden');
  corner.classList.toggle('in-game', game.state === 'play' || game.state === 'countdown');
  measureCorner();
}
// 오른쪽 위 운영 버튼의 아래 끝(px). 버튼 글자는 px 단위라 작은 화면(1280×720 등)에서는 상대적으로 커서,
// 결과·우승 판을 그 아래부터 그려 겹치지 않게 한다. 버튼 줄이 바뀔 때와 창 크기가 바뀔 때만 잰다
let cornerBottomPx = 0;
let cornerLeftPx = Infinity; // 운영 버튼 줄의 왼쪽 끝 (화면 제목이 겹치지 않게)
function measureCorner() {
  const r = cornerEl.getBoundingClientRect();
  cornerBottomPx = r.height ? r.bottom : 0;
  cornerLeftPx = r.width ? r.left : Infinity;
}
window.addEventListener('resize', () => measureCorner());
// 높이 ph 인 판의 위쪽 y: 운영 버튼 아래, 화면 가운데 쪽, 그러면서 화면 안
function panelTopBelowCorner(ph) {
  const top = Math.max(U * 7, cornerBottomPx + U, (H - ph) / 2);
  return Math.min(top, Math.max(0, H - ph));
}

function resumeGame() {
  game.paused = false;
  game.confirmHome = false;
  game.pauseNote = null;
}
// 처음 화면으로. 게임 중이면 잘못 눌러도 판이 날아가지 않게 일시정지하고 한 번 더 묻는다
// ---------- 게임 직후 이름 쏘기 (A-Z·0-9) ----------
const INITIALS = {
  max: 6,        // 최대 글자 수
  first: 20,     // 판이 뜬 뒤(잠금이 풀린 뒤) 첫 글자를 쏠 때까지 기다리는 시간(초). 안 쏘면 원래 닉네임으로 등록
  idle: 10,      // 글자를 쏜 뒤 이 시간(초) 동안 더 안 쏘면 자동 등록 (키보드 배치에서 글자를 찾을 여유)
  lock: 2,       // 판이 뜬 뒤 잠깐 잠금 (게임 끝까지 쏘던 총알이 글자로 들어가지 않게)
  // 실제 키보드와 같은 배치. offset: 줄이 오른쪽으로 밀리는 정도 (글자 칸 단위)
  rows: [
    { keys: '1234567890', offset: 0 },
    { keys: 'QWERTYUIOP', offset: 0.5 },
    { keys: 'ASDFGHJKL', offset: 0.75 },
    { keys: 'ZXCVBNM', offset: 1.25 },
  ],
  eraseWidth: 2.25, // Z 줄 끝에 붙는 '← 지우기' 칸 넓이 (글자 칸 단위)
};
function openInitials() {
  game.state = 'initials';
  // full: 지금 세고 있는 대기 시간의 길이 (처음엔 first, 글자를 쏘면 idle) — 남은 시간 막대의 기준
  game.initials = { text: '', t: 0, idle: INITIALS.first, full: INITIALS.first, lastTick: INITIALS.first };
  banner = null; // 끝나기 직전에 뜬 '레벨 UP!' 같은 안내가 판 위에 겹치지 않게
  updateCornerButtons();
}
const initialsReady = () => game.initials.t >= INITIALS.lock;
function typeInitial(ch) {
  const ini = { ...game.initials, idle: INITIALS.idle, full: INITIALS.idle, lastTick: INITIALS.idle };
  if (ini.text.length >= INITIALS.max) { game.initials = ini; return; }
  game.initials = { ...ini, text: ini.text + ch };
  Sound.hit();
}
function eraseInitial() {
  const ini = game.initials;
  game.initials = { ...ini, text: ini.text.slice(0, -1), idle: INITIALS.idle, full: INITIALS.idle, lastTick: INITIALS.idle };
  Sound.tick();
}
// skip: 입력한 글자를 버리고 원래(게임할 때) 닉네임으로
function finishInitials(skip = false) {
  if (game.state !== 'initials') return;
  const typed = cleanName(game.initials.text);
  if (!skip && typed) game.players[0] = { ...game.players[0], name: typed };
  saveSoloRecord();
}
function updateInitials(dt) {
  const ini = game.initials;
  ini.t += dt;
  if (!initialsReady()) return;
  ini.idle -= dt;
  // 마지막 3초는 똑딱 소리로 알려 준다
  if (ini.idle <= 3 && Math.ceil(ini.idle) < ini.lastTick) { ini.lastTick = Math.ceil(ini.idle); Sound.tick(); }
  if (ini.idle <= 0) finishInitials();
}
function drawInitials(time) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);
  const ini = game.initials, me = game.players[0], ready = initialsReady();
  const cx = W / 2, pw = Math.min(W - U * 6, U * 132), ph = Math.min(H - U * 4, U * 96);
  const py = (H - ph) / 2;
  panel(cx - pw / 2, py, pw, ph, 0.9);
  text('랭킹에 남길 이름을 쏘세요!', cx, py + U * 7, U * 6.5, '#ffcf5a', 'center', { shadow: '#a3200c' });
  text(`${me.score}점  ·  알파벳·숫자 최대 ${INITIALS.max}글자`, cx, py + U * 14, U * 3.2, '#ffd9b0');

  // 입력 칸: 다음에 들어갈 칸은 밑줄이 깜빡인다
  const sw = U * 9.5, sg = U * 1.6, sy = py + U * 23;
  const sx0 = cx - (INITIALS.max * sw + (INITIALS.max - 1) * sg) / 2;
  for (let i = 0; i < INITIALS.max; i++) {
    const x = sx0 + i * (sw + sg);
    ctx.fillStyle = 'rgba(255, 220, 190, 0.08)';
    ctx.fillRect(x, sy - U * 5, sw, U * 10);
    const ch = ini.text[i];
    if (ch) text(ch, x + sw / 2, sy, U * 7, '#ffffff');
    const next = i === ini.text.length && Math.sin(time * 8) > 0;
    ctx.fillStyle = next ? '#ffe14a' : 'rgba(255, 170, 120, 0.5)';
    ctx.fillRect(x, sy + U * 5, sw, U * 0.6);
  }

  // 남은 시간 막대
  const by = py + U * 33, bw = U * 70;
  if (ready) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(cx - bw / 2, by - U * 0.8, bw, U * 1.6);
    ctx.fillStyle = ini.idle <= 2 ? '#ff8a7a' : '#ffe14a';
    ctx.fillRect(cx - bw / 2, by - U * 0.8, bw * clamp(ini.idle / (ini.full || INITIALS.idle), 0, 1), U * 1.6);
    const left = Math.ceil(Math.max(0, ini.idle));
    text(ini.text ? `${left}초 동안 안 쏘면 자동 등록` : `${left}초 안에 첫 글자를 쏘세요`, cx, by + U * 3.6, U * 2.6, '#c9a89a');
  } else {
    text('잠깐! 곧 쏠 수 있어요', cx, by + U * 1.5, U * 3.2, '#c9a89a');
  }

  // 글자판: 실제 키보드처럼 1~0 / QWERTYUIOP / ASDFGHJKL / ZXCVBNM ← 지우기 (줄마다 오른쪽으로 조금씩 밀림)
  const kw = U * 10, kh = U * 8, kg = U * 1.5, pitch = kw + kg;
  const lastRow = INITIALS.rows.length - 1;
  const span = Math.max(...INITIALS.rows.map((row, r) => row.offset + row.keys.length + (r === lastRow ? INITIALS.eraseWidth : 0)));
  const gx0 = cx - (span * pitch - kg) / 2, gy0 = py + U * 45;
  INITIALS.rows.forEach((row, r) => {
    const y = gy0 + r * (kh + kg);
    const x0 = gx0 + row.offset * pitch;
    [...row.keys].forEach((ch, c) => button(ch, x0 + c * pitch + kw / 2, y, kw, kh, () => typeInitial(ch), ready));
    if (r === lastRow) {
      const x = x0 + row.keys.length * pitch, w = INITIALS.eraseWidth * pitch - kg;
      button('← 지우기', x + w / 2, y, w, kh, eraseInitial, ready && ini.text.length > 0);
    }
  });

  // 아래: 건너뛰기(원래 닉네임) · 등록
  const fy = py + ph - U * 9;
  button('건너뛰기', cx - U * 30, fy, U * 40, U * 9.5, () => finishInitials(true), ready);
  button('등록', cx + U * 30, fy, U * 40, U * 9.5, () => finishInitials(), ready, true);
  text(`건너뛰면 '${me.name || '이름없음'}' 이름으로 남아요`, cx - U * 30, fy + U * 7.2, U * 2.6, '#c9a89a');
}

function goHome() {
  if (nameOpen()) closeNameEntry();
  if (Tournament.formOpen()) Tournament.closeForm();
  // 이름 쏘는 중에 처음 화면으로 가면 원래 닉네임으로 기록은 남긴다
  if (game.state === 'initials') finishInitials(true);
  if (game.state === 'play') {
    // 이미 '처음 화면으로 갈까요?' 를 묻는 중에 한 번 더 누르면 그대로 처음 화면 (C 두 번)
    if (game.paused && game.confirmHome) { goTitle(); return; }
    game.paused = true;
    game.confirmHome = true;
    return;
  }
  if (game.state === 'gunsetup') { closeGunSetup(); return; }
  goTitle();
}
document.getElementById('btn-home').addEventListener('click', (e) => {
  e.currentTarget.blur(); // Space·Enter 가 이 버튼을 다시 누르지 않게
  Sound.init();
  goHome();
});

