'use strict';
/* =============================================================
 * 가스트 사격 (Ghast Shooting)
 *
 * 네더에 나타난 가스트가 화염구를 쏘기 전에 맞히는 게임입니다.
 * 엡손 인터랙티브 프로젝터의 손가락 터치·전자펜, 마우스, 터치스크린은
 * 모두 브라우저에서 'pointerdown' 으로 들어오므로 이것 하나로 처리합니다.
 * ============================================================= */

// 컴퓨터용 프로그램(exe·맥 앱)의 버전. package.json 의 version 을 앱(desktop/main.js → preload.js)이 넘겨준다.
// 웹(브라우저)에는 없어서 빈 글자 → 처음 화면에 버전을 그리지 않는다
const APP_VERSION = (window.ghastApp && typeof window.ghastApp.version === 'string') ? window.ghastApp.version : '';
// 이 게임을 만든 학생 (본인 공개 동의, 처음 화면 제목 아래·아래 띠에 표시)
const CREATOR = '정다희';

// ---------- 설정 (설정 창에서 바꿀 수 있음, 브라우저에 저장됨) ----------
const DEFAULTS = {
  gameSeconds: 40,     // 제한 시간 40초
  // 보너스를 받으려면 '새로' 모아야 하는 점수. 처음 30점 → 그다음 50점 더 → 그다음 70점 더,
  // 이후로는 마지막 값(70점)을 모을 때마다. 점수로 치면 30 → 80 → 150 → 220 …
  bonusGaps: '30, 50, 70',
  bonusSeconds: 7,     // 이만큼 시간 추가
  rewardScore: 100,    // 이 점수 이상이면 가스트의 눈물(밀키스) — Normal
  rewardScoreEasy: 150, // Easy 의 가스트의 눈물 기준
  rewardScoreHard: 70,  // Hard 의 가스트의 눈물 기준
  killPoints: 2,       // 가스트 처치
  deflectPoints: 1,    // 날아오는 화염구 맞히기
  hitPenalty: 1,       // 화염구에 맞으면 감점
  missPenalty: 1,      // 배경(빈 곳)을 맞히면 감점
  escapePenalty: 1,    // 가스트를 못 맞히고 화면 밖으로 놓치면 감점
  levelSpeedUp: 25,    // 레벨이 하나 오를 때마다 가스트가 몇 % 빨라지는지
  adminKey: '',        // 랭킹 기록 삭제용 관리자 키 (Cloudflare 시크릿 ADMIN_KEY 와 같은 값)
  // 2인 대결 (총을 조이스틱 모드로 연결할 때)
  gunAxes: 'auto',     // 조준에 쓸 조이스틱 축: 'auto' 자동 / '01' 왼쪽 스틱 / '23' 오른쪽 스틱
  gunInvertX: false,   // 조준이 좌우 반대로 움직이면 켜기
  gunInvertY: false,   // 조준이 위아래 반대로 움직이면 켜기
  versusAimHz: 40,     // 2인 대결·토너먼트 중 총마다 조준 위치를 1초에 약 몇 번까지 새로 받는지 (빠른 총이 유리하지 않게, 0 = 제한 없음)
  versusFireDelayMs: 25, // 2인 대결·대회 중 1P(Pro) 총 방아쇠를 '다음 25ms 칸 + 이 값' 에 처리 (2P 보통 총이 25~50ms 늦어서, 0 = 끔)
  difficulty: 1,       // 기본 빠르기 (Normal 기준). 0.5 느리게 ~ 2 빠르게. Easy·Hard 는 여기에 배율을 곱한다
  diffLevel: 'normal', // 난이도 'easy' | 'normal' | 'hard' (닉네임 창에서 고르고, 다음 사람에게도 그대로)
  tournamentSeconds: 40, // 토너먼트 한 경기 시간 (보너스 시간 없이 고정)
  tournamentThird: true, // 토너먼트 3·4위전
  contestKind: 'tournament', // 대회 모드에서 마지막으로 고른 방식 'tournament' | 'league'
  leagueGames: 4,        // 리그전 한 사람당 판 수
  hitPadding: 15,      // 가스트 판정 범위를 몇 % 넓힐지
  ghastScale: 100,     // 가스트 크기 (%)
  quality: 'normal',   // 화질: 'normal' 보통(빠름) / 'light' 가볍게(저사양) / 'sharp' 선명하게(느릴 수 있음)
  showFps: false,      // 왼쪽 아래에 FPS(화면 갱신 속도) 표시
  autoQuality: true,   // 버벅이면 자동으로 화질·효과를 한 단계씩 낮춤
  gunAutoMode: true,   // 총 모드 자동 전환 (앱만): 마우스 모드로 켜진 엑스거너 총을 게임패드 모드로 (desktop/gun-mode.js)
  fewEffects: false,   // 효과 줄이기: 터지는 조각 적게, 빛 번짐·불티 끄기
  volume: 0.8,         // 효과음 크기
  inputMode: 'gun',    // 'gun' = 라이트건(마우스로 인식) / 'touch' = 프로젝터 터치 센서
  aimMode: 'big',      // 조준점(과녁): 'big' 큰 조준점(기본, 2인 대결은 1P/2P 색) / 'hidden' 게임 중 숨김 / 'small' 작은 마우스 십자
  aimSize: 100,        // 큰 조준점 크기 (%)
  debounceMs: 80,      // (터치 모드에서만) 센서가 한 번의 충격을 여러 번 보내는 것을 무시
  showTouches: true,   // 터치(탄착) 위치를 화면에 표시
};
// 기본 규칙이 바뀌면 이름 뒤 숫자를 올려 예전에 저장된 설정을 무시한다
const SETTINGS_KEY = 'ghast-shooting-settings-v10';
let settings = loadSettings();
setTimeout(tellGunAutoMode, 0);
// 앱이 총에 게임패드 모드 전환을 보냈을 때: 게임 중이 아니면 잠깐 알린다
// 앱이 알려 주는 수신기·총 상태 (시리얼로 확인 — 꺼진 총은 게임패드로 보이지 않아 게임만으로는 알 수 없다)
window.ghastApp?.onGunStatus?.((list) => {
  Guns.serial = { at: performance.now(), list };
  // 게임패드 신호가 실제로 들어오는 엑스거너 자리(최근 60초 안에 값이 들어옴)를 앱에 알린다 → 앱은 그 총에 모드 전환을 다시 보내지 않는다
  // (가만히 든 총은 값이 잠깐 안 바뀔 수 있어 넉넉히. 총을 껐다 켜면 앱이 '켜짐'을 보고 바로 다시 바꾼다)
  const now = performance.now();
  const ok = Guns.list().filter((s) => s.moved && now - s.lastReport < 60000).map((s) => Guns.receiverSlot(s.id) + 1).filter((n) => n > 0);
  window.ghastApp?.reportGunsConfirmed?.(ok);
});
window.ghastApp?.onGunModeSwitched?.((player) => {
  if (game.state === 'play' || game.state === 'countdown') return;
  showBanner(`${player}P 총을 게임패드 모드로 바꾸는 중`, '총이 켜져 있으면 곧 조준점이 나타나요 (안 나타나면 총 전원 확인)', '#9ff6ff', 2.2);
});

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    // 잠시 '게임 중 숨김'이 기본이던 때 저장된 설정도 한 번은 다시 '큰 조준점'으로 (게임 중 과녁이 보이게)
    if (!saved.aimShownAgain) { saved.aimMode = 'big'; saved.aimShownAgain = true; delete saved.aimHiddenAgain; delete saved.aimShownOnce; delete saved.aimHiddenOnce; }
    // 조준점은 처음 화면·이름 입력 창·설정에서 고르고, 고른 값이 저장된다 (toggleAim)
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 저장 불가 환경 */ }
  tellGunAutoMode();
}
// 앱에 '총 모드 자동 전환' 켬/끔을 알린다 (웹 버전에는 없는 기능이라 그냥 지나감)
function tellGunAutoMode() { window.ghastApp?.setGunAutoMode?.(settings.gunAutoMode !== false); }

// ---------- 작은 도구들 ----------
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 같은 숫자를 넣으면 항상 같은 난수가 나오는 생성기 (배경을 매번 똑같이 그리기 위해)
function seeded(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 정수 → 0~1 (용암 무늬 애니메이션용)
function hash(n) {
  n = (n << 13) ^ n;
  return ((Math.imul(n, Math.imul(Math.imul(n, n), 15731) + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff;
}
// 부드럽게 오르내리는 1차원 노이즈 (지형 높이용)
function makeNoise(r) {
  const pts = Array.from({ length: 512 }, () => r());
  return (x) => {
    const i = Math.floor(x), f = x - i;
    const a = pts[((i % 512) + 512) % 512], b = pts[(((i + 1) % 512) + 512) % 512];
    const s = (1 - Math.cos(f * Math.PI)) / 2;
    return a + (b - a) * s;
  };
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

// ---------- 캔버스 ----------
// 화면은 두 겹: 아래 #bg 에는 움직이지 않는 네더 배경을 한 번만 그리고,
// 위 #game 에는 매 프레임 가스트·효과·글자만 그린다 (매번 화면 전체 배경을 다시 칠하지 않아 가볍다)
const bgCanvas = document.getElementById('bg');
const canvas = document.getElementById('game');
// desynchronized: 브라우저가 그림을 기다렸다 한꺼번에 내보내지 않고 바로 화면에 올리도록 (반응 지연 줄이기)
const ctx = canvas.getContext('2d', { desynchronized: true });
let W = 0, H = 0, DPR = 1;
let U = 10; // 화면 크기에 비례하는 기본 단위. 글자·가스트 크기가 모두 이 값을 따른다.

function resize() {
  // 그리는 해상도. 노트북 화면 배율(125%·150%)을 그대로 따르면 픽셀 수가 1.5~2배가 되어
  // 프로젝터 전체 화면에서 크게 버벅인다. 픽셀 그림이라 1배로도 충분하다.
  //   normal: 1배 (기본) / light: 0.75배 (저사양 노트북) / sharp: 화면 배율 그대로 (최대 2배)
  DPR = settings.quality === 'sharp' ? Math.min(window.devicePixelRatio || 1, 2)
    : settings.quality === 'light' ? 0.75 : 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  U = Math.min(W, H * 1.6) / 160;
  buildBackground();
}

// ---------- 그림 ----------
// 가스트·화염구·가스트의 눈물·화약은 이 게임만의 픽셀 그림이다. 파일 없이 ghast-art.js 의 글자 줄 그림을
// 시작할 때 작은 캔버스로 한 번 찍어 두고, 그릴 때 크게 늘린다 (imageSmoothingEnabled = false 라 픽셀이 또렷)
const IMG = {};
function loadImages() {
  return new Promise((resolve, reject) => {
    try {
      for (const name of ['fireball', 'tear', 'gunpowder']) {
        const { rows, palette } = GhastArt.itemGrid(name);
        IMG[name] = GhastArt.toCanvas(rows, palette);
      }
      // 화염구는 3장 (불꽃이 돌아가며 깜빡임). IMG.fireball 은 첫 장 (처음 화면 카드 등)
      IMG.fireballFrames = [0, 1, 2].map((frame) => {
        const { rows, palette } = GhastArt.itemGrid('fireball', { frame });
        return GhastArt.toCanvas(rows, palette);
      });
      resolve();
    } catch (err) {
      reject(new Error(`그림을 만들지 못했습니다: ${err.message}`));
    }
  });
}

// 픽셀 그림을 정수 px 자리·크기로 그린다 (반 픽셀에 걸리면 칸이 고르지 않게 늘어나 보인다)
function drawPixelImage(img, x, y, w, h) {
  ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// 가스트 그림의 비율·입 위치 (예전 그림 440×554 기준 값 그대로 — 판정 상자 비율과 화염구가 나가는 자리가 같게)
const GHAST_W = 440, GHAST_H = 554;
const MOUTH = { x: 96, y: 338 };
// GV[종류] = { frames: 평소 3장(촉수 흔들림), charge: 충전 3장(빨간 눈 + 벌린 입), hurt: 맞았을 때(빨갛게), normal: 처음 화면 카드용 }
const GV = {};
function buildGhastVariants() {
  for (const type of GhastArt.TYPES) {
    const pal = GhastArt.palette(type);
    const frames = [], charge = [];
    for (let f = 0; f < GhastArt.FRAMES; f++) {
      frames.push(GhastArt.toCanvas(GhastArt.ghastGrid(type, { frame: f }), pal));
      charge.push(GhastArt.toCanvas(GhastArt.ghastGrid(type, { frame: f, charge: true }), pal));
    }
    const hurt = GhastArt.toCanvas(GhastArt.ghastGrid(type, { frame: 0 }), GhastArt.palette(type, { hurt: true }));
    GV[type] = { frames, charge, hurt, normal: frames[0] };
  }
}

// ---------- 효과음 (파일 없이 WebAudio 로 직접 합성) ----------
const Sound = {
  ctx: null, master: null, noiseBuf: null, muted: false,

  // 브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로, 첫 터치/키 입력 때 켠다
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  applyVolume() {
    if (this.master) this.master.gain.value = this.muted ? 0 : settings.volume;
  },
  toggleMute() { this.muted = !this.muted; this.applyVolume(); return this.muted; },

  noise(dur, { type = 'lowpass', freq = 1200, freqEnd, q = 1, gain = 0.5, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },
  tone(freq, dur, { type = 'square', freqEnd, gain = 0.2, delay = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  // pitch: 연속 명중일수록 조금씩 높게 (FxCore.comboPitch, 기본 1)
  hit(pitch = 1) { this.tone(900 * pitch, 0.08, { freqEnd: 400 * pitch, gain: 0.25 }); this.noise(0.08, { type: 'highpass', freq: 2000, gain: 0.4 }); },
  pop()     { // 팡! (가스트가 연기로 터짐)
    this.noise(0.35, { freq: 4000, freqEnd: 200, gain: 0.9 });
    this.tone(160, 0.3, { type: 'sine', freqEnd: 45, gain: 0.7 });
    this.tone(620, 0.12, { freqEnd: 120, gain: 0.18, delay: 0.02 });
  },
  explode() { // 화염구가 화면에 꽝
    this.noise(0.9, { freq: 2500, freqEnd: 80, gain: 1 });
    this.tone(90, 0.7, { type: 'sine', freqEnd: 30, gain: 0.9 });
  },
  deflect() { this.tone(1400, 0.15, { type: 'triangle', freqEnd: 2200, gain: 0.3 }); this.noise(0.25, { freq: 3000, freqEnd: 300, gain: 0.5 }); },
  // 화염구 충전: 올라가는 톱니 소리에 부드러운 삼각파와 '쉬익' 바람 소리를 겹쳐 더 잘 들리게 (날카롭지 않게 고음은 자름)
  charge()  {
    this.tone(500, 0.55, { type: 'sawtooth', freqEnd: 1300, gain: 0.2, attack: 0.1 });
    this.tone(250, 0.6, { type: 'triangle', freqEnd: 650, gain: 0.22, attack: 0.12 });
    this.noise(0.55, { type: 'bandpass', freq: 500, freqEnd: 1800, q: 3, gain: 0.25 });
  },
  shoot()   { this.noise(0.5, { type: 'bandpass', freq: 400, freqEnd: 2500, q: 2, gain: 0.7 }); },
  spawn()   { this.tone(rand(260, 340), 0.6, { type: 'sine', freqEnd: 180, gain: 0.08, attack: 0.15 }); },
  escape()  { this.tone(420, 0.35, { type: 'triangle', freqEnd: 160, gain: 0.18 }); this.tone(300, 0.4, { type: 'sine', freqEnd: 120, gain: 0.12, delay: 0.08 }); },
  miss()    { this.noise(0.06, { type: 'highpass', freq: 1500, gain: 0.15 }); this.tone(180, 0.18, { type: 'square', freqEnd: 110, gain: 0.12 }); },
  tick()    { this.tone(1000, 0.05, { gain: 0.12 }); },
  go()      { this.tone(660, 0.12, { gain: 0.2 }); this.tone(990, 0.3, { gain: 0.2, delay: 0.1 }); },
  bonus()   { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, { gain: 0.2, delay: i * 0.09 })); },
  reward()  { [784, 988, 1175].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', gain: 0.25, delay: i * 0.1 })); },
  // 황금 가스트가 나타남: 반짝반짝 내려오는 종소리
  goldAppear() {
    [2093, 1760, 2349, 1976].forEach((f, i) => this.tone(f, 0.18, { type: 'sine', gain: 0.16, delay: i * 0.06 }));
    this.noise(0.3, { type: 'highpass', freq: 6000, gain: 0.12 });
  },
  // 황금 가스트 처치: 동전 소리 + 짧은 팡파르
  goldKill() {
    this.tone(988, 0.07, { type: 'square', gain: 0.14 });
    this.tone(1319, 0.3, { type: 'square', gain: 0.14, delay: 0.07 });
    [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', gain: 0.2, delay: 0.16 + i * 0.07 }));
  },
  // TIME UP!: 낮게 두 번 울리는 경기 종료 버저
  timeUp()  {
    this.tone(440, 0.28, { type: 'square', freqEnd: 330, gain: 0.18 });
    this.tone(330, 0.5, { type: 'square', freqEnd: 196, gain: 0.18, delay: 0.3 });
    this.noise(0.5, { freq: 900, freqEnd: 120, gain: 0.25, delay: 0.3 });
  },
  // 결과 점수가 올라갈 때 '틱' (progress 0~1 에 따라 조금씩 높게)
  countTick(progress = 0) { this.tone(1200 + 900 * progress, 0.03, { gain: 0.07 }); },
  end(win)  {
    const notes = win ? [523, 659, 784, 1047, 784, 1047] : [392, 349, 311, 262];
    notes.forEach((f, i) => this.tone(f, 0.28, { gain: 0.2, delay: i * 0.14 }));
  },
};

// 소리 장치에서 오류가 나도(스피커 연결 끊김 등) 총 판정·게임은 계속되게, 효과음 함수마다 오류를 막아 둔다
for (const key of Object.keys(Sound)) {
  const fn = Sound[key];
  if (typeof fn !== 'function') continue;
  Sound[key] = function (...args) {
    try { return fn.apply(this, args); } catch (err) { reportError(err); return undefined; }
  };
}

// ---------- 배경 (네더) ----------
const NETHERRACK = ['#6f2a2a', '#7d3232', '#5e2222', '#8a3a3a', '#532020', '#6a2626', '#773030'];
const GLOWSTONE = ['#f6d77e', '#e8b94e', '#fff1a8', '#c9963c'];
let bg = null;
let BLK = 8;
let groundY = 0;
let lavaFalls = [];
let fires = [];
const embers = [];

function buildBackground() {
  const r = seeded(20261016);
  const n1 = makeNoise(r), n2 = makeNoise(r), n3 = makeNoise(r), n4 = makeNoise(r);
  BLK = Math.max(6, Math.round(H / 64));
  const cols = Math.ceil(W / BLK) + 1;

  bg = bgCanvas;
  bg.width = Math.round(W * DPR);
  bg.height = Math.round(H * DPR);
  const g = bg.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);

  // 붉은 동굴 공기
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#120202');
  sky.addColorStop(0.5, '#3d0d08');
  sky.addColorStop(1, '#1a0403');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  const column = (c, top, bottom, f) => {
    for (let y = Math.floor(top / BLK) * BLK; y < bottom; y += BLK) {
      g.fillStyle = shade(NETHERRACK[Math.floor(r() * NETHERRACK.length)], f * (0.85 + r() * 0.3));
      g.fillRect(c * BLK, y, BLK, BLK);
    }
  };
  const haze = (a) => { g.fillStyle = `rgba(70, 10, 6, ${a})`; g.fillRect(0, 0, W, H); };

  // 먼 언덕 두 겹 (멀수록 어둡고 흐리게)
  for (let c = 0; c < cols; c++) column(c, H * 0.5 - n1(c * 0.05) * H * 0.18, H, 0.35);
  haze(0.35);
  // 먼 기둥
  for (let k = 0; k < 3; k++) {
    const c0 = Math.floor(lerp(0.1, 0.9, (k + r()) / 3) * cols);
    const w = 3 + Math.floor(r() * 3);
    for (let c = c0; c < c0 + w; c++) column(c, 0, H * 0.7, 0.4);
  }
  for (let c = 0; c < cols; c++) column(c, H * 0.66 - n2(c * 0.07) * H * 0.12, H, 0.5);
  haze(0.25);

  // 천장과 매달린 바위, 발광석
  const ceil = [];
  for (let c = 0; c < cols; c++) {
    const depth = Math.floor(2 + Math.pow(n3(c * 0.12), 2) * 12) * BLK;
    ceil.push(depth);
    column(c, 0, depth, 0.55);
  }
  for (let c = 2; c < cols - 4; c++) {
    if (n4(c * 0.3) > 0.78 && r() < 0.5) {
      const w = 2 + Math.floor(r() * 3);
      for (let i = 0; i < w; i++) {
        const cc = c + i, h = 1 + Math.floor(r() * 3);
        for (let j = 0; j < h; j++) {
          g.fillStyle = pick(GLOWSTONE);
          g.fillRect(cc * BLK, ceil[cc] + j * BLK, BLK, BLK);
        }
      }
      const gx = (c + w / 2) * BLK, gy = ceil[c] + BLK * 2;
      const glow = g.createRadialGradient(gx, gy, 0, gx, gy, BLK * 14);
      glow.addColorStop(0, 'rgba(255, 210, 120, 0.25)');
      glow.addColorStop(1, 'rgba(255, 210, 120, 0)');
      g.fillStyle = glow;
      g.fillRect(gx - BLK * 14, gy - BLK * 14, BLK * 28, BLK * 28);
      c += w + 4;
    }
  }

  // 바닥 (가까우니 밝게) + 용암 웅덩이 + 불
  groundY = H * 0.82;
  fires = [];
  const poolStart = Math.floor(cols * lerp(0.55, 0.7, r()));
  const poolEnd = poolStart + Math.floor(cols * 0.12);
  for (let c = 0; c < cols; c++) {
    const top = groundY + Math.floor(n2(c * 0.1 + 30) * 3) * BLK;
    column(c, top, H, 0.8);
    g.fillStyle = 'rgba(255, 120, 90, 0.12)';
    g.fillRect(c * BLK, top, BLK, BLK);
    if (c >= poolStart && c < poolEnd) {
      for (let j = 0; j < 2; j++) {
        g.fillStyle = pick(['#ff8a1c', '#ffb23a', '#e0601a', '#ffcf5a']);
        g.fillRect(c * BLK, top + j * BLK, BLK, BLK);
      }
    } else if (r() < 0.035) {
      fires.push({ x: c * BLK, y: top, phase: r() * 10 });
    }
  }
  const pg = g.createRadialGradient((poolStart + poolEnd) / 2 * BLK, groundY, 0, (poolStart + poolEnd) / 2 * BLK, groundY, W * 0.2);
  pg.addColorStop(0, 'rgba(255, 120, 30, 0.3)');
  pg.addColorStop(1, 'rgba(255, 120, 30, 0)');
  g.fillStyle = pg;
  g.fillRect(0, 0, W, H);

  // 용암 폭포 위치 (그림은 매 프레임 움직이며 그림)
  lavaFalls = [0.18, 0.83].map((p) => {
    const c = Math.floor(cols * (p + (r() - 0.5) * 0.08));
    return { x: c * BLK, top: ceil[c] || BLK * 4, bottom: groundY + BLK * 2, col: c };
  });
  for (const f of lavaFalls) {
    const glow = g.createLinearGradient(f.x - BLK * 10, 0, f.x + BLK * 12, 0);
    glow.addColorStop(0, 'rgba(255, 110, 20, 0)');
    glow.addColorStop(0.5, 'rgba(255, 110, 20, 0.22)');
    glow.addColorStop(1, 'rgba(255, 110, 20, 0)');
    g.fillStyle = glow;
    g.fillRect(f.x - BLK * 10, f.top, BLK * 22, f.bottom - f.top);
  }

  // 가장자리 어둡게
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}

const LAVA = ['#ff8a1c', '#ffb23a', '#e0601a', '#ffd25a', '#c94812', '#ff9e2c'];
// 움직이는 배경만 (흐르는 용암·불꽃·불티). 나머지 배경은 아래 #bg 캔버스에 한 번 그려져 있다
function drawBackground(time) {
  if (!bg || bg.width === 0 || bg.height === 0) return; // 창이 숨겨져 크기가 0일 때
  drawHeat(time);

  // 흘러내리는 용암
  for (const f of lavaFalls) {
    const shift = Math.floor(time * 7);
    for (let y = f.top, row = 0; y < f.bottom; y += BLK, row++) {
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = LAVA[Math.floor(hash((f.col + i) * 7919 + (row - shift) * 31) * LAVA.length)];
        ctx.fillRect(f.x + i * BLK, y, BLK, BLK);
      }
    }
  }

  // 바닥의 불꽃
  for (const fire of fires) {
    for (let i = 0; i < 3; i++) {
      const h = BLK * (1.2 + Math.abs(Math.sin(time * 9 + fire.phase + i * 1.7)) * 1.6);
      const x = fire.x - BLK * 0.5 + i * BLK * 0.66;
      ctx.fillStyle = '#ff5a1a'; ctx.fillRect(x, fire.y - h, BLK * 0.66, h);
      ctx.fillStyle = '#ffb02e'; ctx.fillRect(x, fire.y - h * 0.66, BLK * 0.66, h * 0.66);
      ctx.fillStyle = '#fff3b0'; ctx.fillRect(x, fire.y - h * 0.3, BLK * 0.66, h * 0.3);
    }
  }

  // 떠오르는 불티
  for (const e of embers) {
    ctx.globalAlpha = clamp(e.life / e.max, 0, 1) * 0.9;
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x, e.y, e.size, e.size);
  }
  ctx.globalAlpha = 1;
}

// 레벨이 오를수록 네더의 가장자리(좌우·천장)가 진홍빛으로 달아오르고 가장자리 불티가 늘어난다 (보이는 것만, 판정과 상관없음).
// 화면 가운데·바닥 밝기는 Lv.1 과 거의 같게 둔다 (가스트·화염구가 잘 보이게, 화염구·황금 가스트의 주황과 겹치지 않게 진홍).
// bgHeat 은 0 ~ 1 로 레벨(FxCore.heatOf)을 천천히 따라간다. 효과 줄이기면 일렁임 없이 고정
let bgHeat = 0;
const HEAT_EDGE_ALPHA = 0.6;
const HEAT_EDGE_COLOR = '200, 18, 48';  // 진홍
const HEAT_EMBER_MAX = 40;              // Lv.4 에서 더 생기는 가장자리 불티 수
let heatEdge = null;                    // { w, h, img } 화면 크기마다 한 번 그린 가장자리 빛
function heatEdgeImage() {
  if (heatEdge && heatEdge.w === W && heatEdge.h === H) return heatEdge.img;
  const img = document.createElement('canvas');
  img.width = 160; img.height = 90;   // 작게 그려 늘려 쓴다 (부드러운 빛이라 충분)
  const g = img.getContext('2d');
  const band = (x0, y0, x1, y1, a) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, `rgba(${HEAT_EDGE_COLOR}, ${a})`);
    grad.addColorStop(1, `rgba(${HEAT_EDGE_COLOR}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 160, 90);
  };
  band(0, 0, 160 * 0.2, 0, 0.9);          // 왼쪽
  band(160, 0, 160 * 0.8, 0, 0.9);        // 오른쪽
  band(0, 0, 0, 90 * 0.2, 0.6);           // 천장
  heatEdge = { w: W, h: H, img };
  return img;
}
function updateHeat(dt) { bgHeat = FxCore.approach(bgHeat, FxCore.heatOf(game.level), dt, 0.5); }
function drawHeat(time) {
  if (bgHeat <= 0.01) return;
  const pulse = settings.fewEffects ? 1 : 0.85 + 0.15 * Math.sin(time * 2.2);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true; // 빛은 부드럽게 늘려야 계단이 안 생긴다
  ctx.globalAlpha = bgHeat * HEAT_EDGE_ALPHA * pulse;
  ctx.drawImage(heatEdgeImage(), 0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = smooth;
}

function spawnEmber(heat) {
  // heat: 레벨이 올라 더 생기는 가장자리 불티 (좌우 14% 안에서, 진홍빛)
  const x = heat ? (Math.random() < 0.5 ? rand(0, W * 0.14) : rand(W * 0.86, W)) : rand(0, W);
  const max = rand(3, 7);
  embers.push({
    x, y: heat ? rand(H * 0.3, H) : rand(groundY, H), vx: rand(-15, 15), vy: rand(-60, -25),
    size: rand(0.25, 0.6) * U, life: max, max, heat,
    color: heat ? pick(['#ff3a4a', '#e01e3c', '#ff6a5a']) : pick(['#ffb23a', '#ff6a1a', '#ffd25a']),
  });
}
function updateEmbers(dt) {
  const base = embers.filter((e) => !e.heat).length;
  if (base < (settings.fewEffects ? 20 : 60) && Math.random() < dt * 20) spawnEmber(false);
  const heatMax = Math.round(HEAT_EMBER_MAX * bgHeat * (settings.fewEffects ? 0.5 : 1));
  if (embers.length - base < heatMax && Math.random() < dt * 25 * bgHeat) spawnEmber(true);
  for (let i = embers.length - 1; i >= 0; i--) {
    const e = embers[i];
    e.x += (e.vx + Math.sin(e.y * 0.02) * 10) * dt;
    e.y += e.vy * dt;
    e.life -= dt;
    if (e.life <= 0 || e.y < -10) embers.splice(i, 1);
  }
}

// ---------- 파티클 (팡팡 터지는 효과) ----------
const parts = [];
const MAX_PARTS = 350; // 효과가 한꺼번에 너무 많이 쌓여 버벅이지 않게
function addPart(p) {
  // 글자 효과(점수·'팡!')는 꼭 보여야 하니 남기고, 작은 조각은 많으면 새로 만들지 않는다
  if (parts.length >= (settings.fewEffects ? 120 : MAX_PARTS) && p.kind !== 'text') return;
  parts.push({
    x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 1, age: 0,
    size: U, grow: 0, color: '#fff', kind: 'sq', rot: 0, vr: 0, ...p,
  });
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.age += dt;
    if (p.age >= p.life) { parts.splice(i, 1); continue; }
    p.vx *= 1 - Math.min(1, p.drag * dt);
    p.vy *= 1 - Math.min(1, p.drag * dt);
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.size = Math.max(0, p.size + p.grow * dt);
    p.rot += p.vr * dt;
  }
}
function drawParts() {
  for (const p of parts) {
    const a = p.age / p.life;
    ctx.globalAlpha = p.kind === 'text' ? (a > 0.7 ? (1 - a) / 0.3 : 1) : 1 - a * a;
    if (p.kind === 'sq') {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else if (p.kind === 'ring') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(2, U * 0.6 * (1 - a));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
    } else if (p.kind === 'img') {
      // 떨어지는 아이템: 픽셀 그림이라 정수 px 자리·크기에, 90°씩만 돌린다 (비스듬히 돌리면 픽셀이 번진다)
      const s = Math.round(p.size);
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2));
      ctx.drawImage(p.img, -Math.round(s / 2), -Math.round(s / 2), s, s);
      ctx.restore();
    } else if (p.kind === 'sprite') {
      // 터지는 가스트: 옆으로 퍼지고 위아래로 납작해지며 사라진다 (보이기만, 판정은 이미 끝남). 정수 px
      ctx.globalAlpha = 1 - a;
      const dw = Math.round(p.w * (1 + a * 0.6)), dh = Math.max(1, Math.round(p.h * (1 - a * 0.7)));
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y));
      ctx.scale(p.flip, 1);
      ctx.drawImage(p.img, -Math.round(dw / 2), -Math.round(dh / 2), dw, dh);
      ctx.restore();
    } else if (p.kind === 'cross') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(2, U * 0.4);
      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y);
      ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s);
      ctx.stroke();
    } else if (p.kind === 'text') {
      // 뿅 하고 커졌다가 살짝 줄어드는 글자
      const s = a < 0.12 ? lerp(0.3, 1.25, a / 0.12) : lerp(1.25, 1, Math.min(1, (a - 0.12) / 0.2));
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(s, s);
      text(p.text, 0, 0, p.size, p.color, 'center', { shadow: p.shadow });
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// 가스트가 연기와 함께 팡! 터지는 효과
function burstGhast(gh) {
  const { x, y } = gh.center();
  const w = gh.w, h = gh.h;
  // 가스트 모습이 납작해지며 사라지는 '펑' (0.28초). 조각이 많아도 꼭 보이게 맨 앞에 넣는다
  const look = GV[gh.type] || GV.normal;
  parts.push({ kind: 'sprite', img: look.hurt, x, y, w, h, flip: gh.flip, age: 0, life: 0.28, vx: 0, vy: 0, g: 0, drag: 0, size: 0, grow: 0, rot: 0, vr: 0 });
  // 조각 수는 줄이고(가볍게) 크기를 조금 키워 '팡' 느낌은 그대로
  for (let i = 0; i < 16; i++) {
    addPart({
      x: x + rand(-0.45, 0.45) * w, y: y + rand(-0.45, 0.3) * h,
      vx: rand(-1, 1) * U * 12, vy: rand(-14, -2) * U, drag: 2.5,
      size: rand(1.9, 4.2) * U * gh.z, grow: U * 3, life: rand(0.5, 1.0),
      color: pick(['#ffffff', '#ececec', '#d2d2d2', '#b4b4b4']),
    });
  }
  for (let i = 0; i < 12; i++) {
    const ang = rand(0, Math.PI * 2), sp = rand(20, 60) * U;
    addPart({
      x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: U * 60, drag: 1.5,
      size: rand(0.6, 1.4) * U, life: rand(0.4, 0.8),
      color: pick(['#ffd25a', '#ff8a1c', '#fff3b0', '#ff5a1a']),
    });
  }
  addPart({ kind: 'ring', x, y, size: w * 0.2, grow: U * 90, life: 0.35, color: '#fff7d6' });
  // 가스트의 눈물·화약이 떨어짐
  const drops = Math.random() < 0.5 ? 2 : 1;
  for (let i = 0; i < drops; i++) {
    addPart({
      kind: 'img', img: pick([IMG.tear, IMG.gunpowder, IMG.tear]),
      x, y, vx: rand(-1, 1) * U * 15, vy: -rand(15, 30) * U, g: U * 110,
      size: U * 5 * gh.z, life: 1.2, vr: rand(-6, 6),
    });
  }
  addPart({
    kind: 'text', text: pick(['팡!', '펑!', '빵!', '팡팡!']), x, y: y - h * 0.15,
    vy: -U * 6, size: U * 9 * Math.max(0.8, gh.z), life: 0.8, rot: rand(-0.25, 0.25),
    color: '#ffe14a', shadow: '#b2340f',
  });
}

function burstFire(x, y, scale) {
  for (let i = 0; i < 20 * scale; i++) {
    const ang = rand(0, Math.PI * 2), sp = rand(15, 70) * U * scale;
    addPart({
      x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: U * 30, drag: 2,
      size: rand(1.2, 3.4) * U * scale, grow: U * 2, life: rand(0.4, 0.9),
      color: pick(['#ffd25a', '#ff8a1c', '#fff3b0', '#ff5a1a', '#5a5a5a', '#3a3a3a']),
    });
  }
  addPart({ kind: 'ring', x, y, size: U * 3, grow: U * 120 * scale, life: 0.4, color: '#ffb23a' });
}

function popupScore(x, y, label, color) {
  addPart({ kind: 'text', text: label, x, y, vy: -U * 10, size: U * 6, life: 1.0, color, shadow: '#1a1a1a' });
}

