'use strict';
/* =============================================================
 * 가스트 사격 (Ghast Shooting)
 *
 * 네더에 나타난 가스트가 화염구를 쏘기 전에 맞히는 게임입니다.
 * 엡손 인터랙티브 프로젝터의 손가락 터치·전자펜, 마우스, 터치스크린은
 * 모두 브라우저에서 'pointerdown' 으로 들어오므로 이것 하나로 처리합니다.
 * ============================================================= */

// ---------- 설정 (설정 창에서 바꿀 수 있음, 브라우저에 저장됨) ----------
const DEFAULTS = {
  gameSeconds: 40,     // 제한 시간 40초
  // 보너스를 받으려면 '새로' 모아야 하는 점수. 처음 30점 → 그다음 50점 더 → 그다음 70점 더,
  // 이후로는 마지막 값(70점)을 모을 때마다. 점수로 치면 30 → 80 → 150 → 220 …
  bonusGaps: '30, 50, 70',
  bonusSeconds: 7,     // 이만큼 시간 추가
  rewardScore: 100,    // 이 점수 이상이면 가스트의 눈물(밀키스)
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
  difficulty: 1,       // 0.5 쉬움 ~ 2 어려움
  hitPadding: 15,      // 가스트 판정 범위를 몇 % 넓힐지
  ghastScale: 100,     // 가스트 크기 (%)
  volume: 0.8,
  inputMode: 'gun',    // 'gun' = 라이트건(마우스로 인식) / 'touch' = 프로젝터 터치 센서
  aimMode: 'big',      // 조준점: 'big' 큰 조준점 / 'small' 작은 마우스 십자 / 'hidden' 게임 중 숨김
  aimSize: 100,        // 큰 조준점 크기 (%)
  debounceMs: 80,      // (터치 모드에서만) 센서가 한 번의 충격을 여러 번 보내는 것을 무시
  showTouches: true,   // 터치(탄착) 위치를 화면에 표시
};
// 기본 규칙이 바뀌면 이름 뒤 숫자를 올려 예전에 저장된 설정을 무시한다
const SETTINGS_KEY = 'ghast-shooting-settings-v10';
let settings = loadSettings();

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 저장 불가 환경 */ }
}

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
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
let U = 10; // 화면 크기에 비례하는 기본 단위. 글자·가스트 크기가 모두 이 값을 따른다.

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  U = Math.min(W, H * 1.6) / 160;
  buildBackground();
}

// ---------- 이미지 ----------
const IMG = {};
const IMG_SRC = {
  ghast: 'assets/ghast.png',
  fireball: 'assets/fireball.png',
  tear: 'assets/ghast-tear.png',
  gunpowder: 'assets/gunpowder.png',
  drop: 'assets/drop.png',
};
function loadImages() {
  return Promise.all(Object.entries(IMG_SRC).map(([key, src]) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { IMG[key] = img; resolve(); };
    img.onerror = () => reject(new Error(`${src} 를 불러오지 못했습니다`));
    img.src = src;
  })));
}

// 가스트 원본 그림(440×554) 안의 위치들
const GHAST_W = 440, GHAST_H = 554;
const MOUTH = { x: 96, y: 338 };
// 평소 / 화염구 충전(빨간 눈 + 벌린 입) / 맞았을 때(빨갛게) 세 가지 모습을 미리 그려 둔다
const GV = {};
function parallelogram(g, x1, y1, x2, y2, h, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x2, y2 + h); g.lineTo(x1, y1 + h);
  g.closePath();
  g.fill();
}
function buildGhastVariants() {
  const make = (paint) => {
    const c = document.createElement('canvas');
    c.width = GHAST_W; c.height = GHAST_H;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(IMG.ghast, 0, 0);
    if (paint) paint(g);
    return c;
  };
  const chargeFace = (g) => {
    // 눈을 크게 뜨고 빨간 눈동자
    parallelogram(g, 34, 190, 72, 207, 16, '#262626');
    parallelogram(g, 116, 231, 158, 249, 15, '#262626');
    parallelogram(g, 45, 198, 61, 205, 8, '#ff2418');
    parallelogram(g, 130, 239, 146, 246, 8, '#ff2418');
    // 입을 크게 벌림
    parallelogram(g, 72, 312, 118, 333, 34, '#1b1b1b');
    parallelogram(g, 85, 326, 105, 335, 16, '#ff2418');
  };
  // 그림 전체에 색을 덧칠 (투명한 부분은 그대로)
  const tint = (color) => (g) => {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, GHAST_W, GHAST_H);
    g.globalCompositeOperation = 'source-over';
  };
  const angry = tint('rgba(215, 35, 15, 0.42)');
  const gold = tint('rgba(255, 196, 30, 0.55)');

  // GV[이미지 이름] = { normal: 평소, charge: 화염구 충전 중 }
  GV.normal = { normal: IMG.ghast, charge: make(chargeFace) };
  GV.angry = { normal: make(angry), charge: make((g) => { angry(g); chargeFace(g); }) };
  GV.gold = { normal: make(gold), charge: make(gold) };
  GV.hurt = make(tint('rgba(255, 30, 30, 0.6)'));
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

  hit()     { this.tone(900, 0.08, { freqEnd: 400, gain: 0.25 }); this.noise(0.08, { type: 'highpass', freq: 2000, gain: 0.4 }); },
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
  charge()  { this.tone(500, 0.55, { type: 'sawtooth', freqEnd: 1300, gain: 0.06, attack: 0.1 }); },
  shoot()   { this.noise(0.5, { type: 'bandpass', freq: 400, freqEnd: 2500, q: 2, gain: 0.7 }); },
  spawn()   { this.tone(rand(260, 340), 0.6, { type: 'sine', freqEnd: 180, gain: 0.08, attack: 0.15 }); },
  escape()  { this.tone(420, 0.35, { type: 'triangle', freqEnd: 160, gain: 0.18 }); this.tone(300, 0.4, { type: 'sine', freqEnd: 120, gain: 0.12, delay: 0.08 }); },
  miss()    { this.noise(0.06, { type: 'highpass', freq: 1500, gain: 0.15 }); this.tone(180, 0.18, { type: 'square', freqEnd: 110, gain: 0.12 }); },
  tick()    { this.tone(1000, 0.05, { gain: 0.12 }); },
  go()      { this.tone(660, 0.12, { gain: 0.2 }); this.tone(990, 0.3, { gain: 0.2, delay: 0.1 }); },
  bonus()   { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, { gain: 0.2, delay: i * 0.09 })); },
  reward()  { [784, 988, 1175].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', gain: 0.25, delay: i * 0.1 })); },
  end(win)  {
    const notes = win ? [523, 659, 784, 1047, 784, 1047] : [392, 349, 311, 262];
    notes.forEach((f, i) => this.tone(f, 0.28, { gain: 0.2, delay: i * 0.14 }));
  },
};

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

  bg = document.createElement('canvas');
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
function drawBackground(time) {
  if (!bg || bg.width === 0 || bg.height === 0) return; // 창이 숨겨져 크기가 0일 때
  ctx.drawImage(bg, 0, 0, W, H);

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
function updateEmbers(dt) {
  if (embers.length < 60 && Math.random() < dt * 20) {
    embers.push({
      x: rand(0, W), y: rand(groundY, H), vx: rand(-15, 15), vy: rand(-60, -25),
      size: rand(0.25, 0.6) * U, life: 0, max: rand(3, 7),
      color: pick(['#ffb23a', '#ff6a1a', '#ffd25a']),
    });
    embers[embers.length - 1].life = embers[embers.length - 1].max;
  }
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
function addPart(p) {
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
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.drawImage(p.img, -p.size / 2, -p.size / 2, p.size, p.size);
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
  for (let i = 0; i < 26; i++) {
    addPart({
      x: x + rand(-0.45, 0.45) * w, y: y + rand(-0.45, 0.3) * h,
      vx: rand(-1, 1) * U * 12, vy: rand(-14, -2) * U, drag: 2.5,
      size: rand(1.5, 3.5) * U * gh.z, grow: U * 3, life: rand(0.5, 1.0),
      color: pick(['#ffffff', '#ececec', '#d2d2d2', '#b4b4b4']),
    });
  }
  for (let i = 0; i < 18; i++) {
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
  for (let i = 0; i < 30 * scale; i++) {
    const ang = rand(0, Math.PI * 2), sp = rand(15, 70) * U * scale;
    addPart({
      x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: U * 30, drag: 2,
      size: rand(1, 3) * U * scale, grow: U * 2, life: rand(0.4, 0.9),
      color: pick(['#ffd25a', '#ff8a1c', '#fff3b0', '#ff5a1a', '#5a5a5a', '#3a3a3a']),
    });
  }
  addPart({ kind: 'ring', x, y, size: U * 3, grow: U * 120 * scale, life: 0.4, color: '#ffb23a' });
}

function popupScore(x, y, label, color) {
  addPart({ kind: 'text', text: label, x, y, vy: -U * 10, size: U * 6, life: 1.0, color, shadow: '#1a1a1a' });
}

// ---------- 화면 흔들림 / 번쩍임 / 알림 ----------
let shake = 0;
let flash = { color: '#fff', a: 0 };
let banner = null;
function doFlash(color, a) { flash = { color, a }; }
function showBanner(textStr, sub, color = '#ffe14a', dur = 2.2) { banner = { text: textStr, sub, color, t: 0, dur }; }

// ---------- 난이도 ----------
// 시간이 지날수록 가스트가 많아지고 빨리 쏜다.
// 레벨(보너스 점수를 넘을 때마다 1씩 오름)이 오를수록 가스트가 더 빨리 날아다니고 서두른다.
function levelMul() {
  return Math.min(3, 1 + (settings.levelSpeedUp / 100) * ((game.level || 1) - 1));
}
function difficulty() {
  const p = clamp(game.elapsed / Math.max(30, settings.gameSeconds), 0, 1);
  const d = clamp(settings.difficulty, 0.3, 3);
  const L = levelMul();
  const lv = (game.level || 1) - 1;
  return {
    spawnEvery: lerp(1.6, 0.8, p) / d / (1 + 0.1 * lv),
    maxGhasts: Math.max(2, Math.round(lerp(3, 6, p) * Math.min(1.4, d))) + Math.floor(lv / 2),
    floatMul: lerp(1, 0.6, p) / d / Math.sqrt(L),
    chargeTime: lerp(1.4, 0.9, p) / Math.sqrt(d) / (1 + 0.1 * lv),
    flightTime: lerp(1.7, 1.15, p) / Math.sqrt(d) / (1 + 0.08 * lv),
    speed: lerp(0.8, 1.3, p) * Math.sqrt(d) * L,
    level: L,
  };
}

// ---------- 가스트 종류 ----------
// size·speed: 기본 가스트 대비 배수 / points: 처치 점수 (맞히기 어려울수록 높게)
const GHAST_TYPES = {
  normal: { name: '가스트', size: 1, speed: 1, img: 'normal', points: () => settings.killPoints },
  small: { name: '아기 가스트', size: 0.6, speed: 1.5, img: 'normal', points: () => settings.killPoints + 2 },
  big: { name: '큰 가스트', size: 1.35, speed: 0.7, img: 'normal', points: () => Math.max(1, settings.killPoints - 1) },
  angry: { name: '분노 가스트', size: 1, speed: 1.35, img: 'angry', points: () => settings.killPoints + 1 },
  // 황금 가스트: 화염구를 쏘지 않고 금방 도망간다. 놓쳐도 감점 없음
  gold: { name: '황금 가스트', size: 0.75, speed: 1.9, img: 'gold', points: () => settings.killPoints * 5, noShoot: true, noEscapePenalty: true },
};
// 레벨별 등장 확률 (%). 마지막 줄은 그 이상 레벨에도 그대로 쓴다
const GHAST_ODDS = [
  { normal: 80, small: 12, big: 8 },                          // Lv.1
  { normal: 55, small: 20, big: 15, angry: 5, gold: 5 },      // Lv.2
  { normal: 30, small: 20, big: 15, angry: 30, gold: 5 },     // Lv.3 — 악랄 모드 시작
  { normal: 15, small: 20, big: 20, angry: 40, gold: 5 },     // Lv.4~
];
function pickGhastType(level) {
  const odds = GHAST_ODDS[Math.min(level, GHAST_ODDS.length) - 1];
  let r = Math.random() * 100;
  for (const [type, pct] of Object.entries(odds)) {
    r -= pct;
    if (r < 0) return type;
  }
  return 'normal';
}
// 레벨이 오를수록 가스트가 빠르고 악랄해지는 만큼 처치 점수도 더 준다: Lv.2·3 +1점, Lv.4~ +2점
const levelBonus = (level) => Math.min(2, Math.floor(level / 2));

// ---------- 가스트 ----------
class Ghast {
  constructor(demo) {
    this.demo = demo;                 // 처음 화면에서 떠다니기만 하는 가스트
    const level = demo ? 1 : (game.level || 1);
    this.type = demo ? 'normal' : pickGhastType(level);
    const T = this.T;
    // 모든 가스트는 한 번 맞히면 처치. 점수는 종류 + 레벨 보너스 (황금 가스트는 고정)
    this.points = T.points() + (this.type === 'gold' ? 0 : levelBonus(level));
    // 악랄 모드: Lv.3 부터 갑자기 돌진하고, Lv.4 부터는 화염구를 여러 발 쏜다
    this.vicious = !demo && level >= 3;
    this.fierce = !demo && level >= 4;
    this.dashCD = rand(0.6, 1.4);
    this.dashT = 0;

    this.z = rand(0.65, 1.15);        // 클수록 가까이(크게) 보임
    this.flip = 1;
    this.x = W / 2; this.y = H / 2;
    this.tx = this.x; this.ty = this.y;
    this.retarget = 0;
    this.bob = rand(0, Math.PI * 2);
    this.state = 'in';
    this.t = 0;
    this.alpha = 0;
    this.shots = Math.random() < 0.35 ? 2 : 1;
    this.floatDur = rand(1.4, 3.0) * difficulty().floatMul;
    if (T.noShoot) this.floatDur = rand(2.2, 3.2); // 황금 가스트는 잠깐 머물다 도망
    this.chargeDur = difficulty().chargeTime;
    this.speedMul = rand(0.85, 1.2);  // 가스트마다 빠르기가 조금씩 다름
    this.dead = false;
  }
  get T() { return GHAST_TYPES[this.type]; }
  get w() { return U * 24 * this.z * this.T.size * (settings.ghastScale / 100); }
  get h() { return this.w * GHAST_H / GHAST_W; }
  center() { return { x: this.x, y: this.y + Math.sin(this.bob) * U * 1.2 }; }

  pickTarget() {
    const w = this.w, h = this.h;
    this.tx = rand(w / 2 + U * 2, W - w / 2 - U * 2);
    this.ty = rand(h / 2 + U * 16, Math.max(h / 2 + U * 16, groundY - h * 0.45));
    // 레벨이 높으면 방향을 더 자주 바꿔 이리저리 날아다님
    this.retarget = rand(1.5, 3) / levelMul();
    // 가는 방향을 바라봄 (원본 그림은 왼쪽을 봄)
    if (Math.abs(this.tx - this.x) > W * 0.05) this.flip = this.tx < this.x ? 1 : -1;
  }
  hittable() { return !this.dead && this.state !== 'dying' && !(this.state === 'in' && this.alpha < 0.3); }
  hitTest(px, py) {
    const { x, y } = this.center();
    const pad = settings.hitPadding / 100;
    const hw = this.w * (0.5 + pad), hh = this.h * (0.5 + pad);
    return px >= x - hw && px <= x + hw && py >= y - hh && py <= y + hh;
  }
  mouth() {
    const c = this.center();
    return {
      x: c.x + (MOUTH.x / GHAST_W - 0.5) * this.w * this.flip,
      y: c.y + (MOUTH.y / GHAST_H - 0.5) * this.h,
    };
  }

  update(dt, D) {
    this.t += dt;
    this.bob += dt * 2.2;
    this.retarget -= dt;
    if (this.retarget <= 0 && this.state !== 'leave' && this.state !== 'dying') this.pickTarget();

    // 악랄 모드: 가끔 갑자기 방향을 틀어 휙 돌진한다
    if (this.vicious && this.state === 'float') {
      this.dashCD -= dt;
      if (this.dashCD <= 0) {
        this.pickTarget();
        this.dashT = 0.35;
        this.dashCD = rand(0.7, 1.5) / (this.fierce ? 1.3 : 1);
      }
    }
    this.dashT = Math.max(0, this.dashT - dt);
    // 황금 가스트는 반짝인다
    if (this.type === 'gold' && Math.random() < dt * 12) {
      const c = this.center();
      addPart({ x: c.x + rand(-0.5, 0.5) * this.w, y: c.y + rand(-0.5, 0.5) * this.h, vy: -U * 3, size: U * 0.7, life: 0.5, color: pick(['#fff3b0', '#ffd84a']) });
    }

    // 목표 지점으로 둥실둥실 이동
    let speed = 0.8 * D.speed * this.speedMul * this.T.speed;
    if (this.dashT > 0) speed *= 3.5;
    if (this.state === 'charge') speed *= 0.2;
    if (this.state === 'leave') speed = 1.4 * this.T.speed * (this.forced ? 1 : D.level);
    if (this.state === 'dying') speed = 0;
    const k = Math.min(1, dt * speed);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;

    switch (this.state) {
      case 'in':
        this.alpha = Math.min(1, this.t / 0.5);
        if (this.t >= 0.5) { this.state = 'float'; this.t = 0; }
        break;
      case 'float':
        if (!this.demo && this.t >= this.floatDur) {
          if (this.T.noShoot) { this.leave(); break; }
          this.state = 'charge'; this.t = 0; this.chargeDur = D.chargeTime;
          Sound.charge();
        }
        break;
      case 'charge':
        if (this.t >= this.chargeDur) {
          const m = this.mouth();
          // 악랄 모드 Lv.4 부터는 한 번에 여러 발 (분노 가스트는 3발)
          const volley = this.fierce ? (this.type === 'angry' ? 3 : 2) : 1;
          for (let i = 0; i < volley; i++) {
            fireballs.push(new Fireball(m.x, m.y, this.w * 0.42, D.flightTime * rand(0.9, 1.15)));
          }
          Sound.shoot();
          this.shots--;
          this.t = 0;
          if (this.shots > 0) {
            this.state = 'float';
            this.floatDur = rand(1.4, 2.6) * D.floatMul;
          } else {
            this.leave();
          }
        }
        break;
      case 'leave':
        if (this.x < -this.w || this.x > W + this.w) {
          this.dead = true;
          // 화면 밖으로 놓쳐 버린 가스트 → 감점 (게임이 끝나 물러나는 가스트는 제외)
          if (!this.demo && !this.forced) ghastEscaped(this);
        }
        break;
      case 'dying':
        if (this.t >= 0.18) { burstGhast(this); Sound.pop(); this.dead = true; }
        break;
    }
  }
  // forced: 게임 종료·처음 화면 이동 때문에 물러나는 것 (놓침 감점 없음)
  leave(forced = false) {
    this.forced = forced;
    this.state = 'leave';
    this.tx = this.x < W / 2 ? -W * 0.4 : W * 1.4;
    this.ty = this.y - H * 0.1;
    this.flip = this.tx < this.x ? 1 : -1;
  }
  kill() {
    this.state = 'dying';
    this.t = 0;
  }
  draw(time) {
    const w = this.w, h = this.h;
    let { x, y } = this.center();
    if (this.state === 'charge') x += rand(-1, 1) * U * 0.5 * (this.t / this.chargeDur);
    if (this.state === 'dying') { x += rand(-1, 1) * U; y += rand(-1, 1) * U; }

    // 충전 중이면 뒤에 붉은 경고 빛
    if (this.state === 'charge') {
      const p = this.t / this.chargeDur;
      const glow = ctx.createRadialGradient(x, y, w * 0.2, x, y, w * 0.9);
      glow.addColorStop(0, `rgba(255, 60, 20, ${0.35 * p})`);
      glow.addColorStop(1, 'rgba(255, 60, 20, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - w, y - w, w * 2, w * 2);
    }

    ctx.save();
    // 악랄 모드 Lv.4 의 분노 가스트는 깜빡여서 잘 안 보인다
    const flicker = this.fierce && this.type === 'angry' ? 0.55 + 0.45 * Math.abs(Math.sin(time * 2.5 + this.bob)) : 1;
    ctx.globalAlpha = this.alpha * flicker;
    ctx.translate(x, y);
    const s = this.state === 'in' ? lerp(0.6, 1, this.alpha) : (this.state === 'dying' ? 1 + this.t * 0.8 : 1);
    ctx.scale(this.flip * s, s);
    const look = GV[this.T.img];
    const img = this.state === 'dying' ? GV.hurt : this.state === 'charge' ? look.charge : look.normal;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    if (this.state === 'charge') {
      // 입 앞에서 화염구가 점점 커짐
      const p = this.t / this.chargeDur;
      const fs = w * 0.42 * p * (0.92 + 0.08 * Math.sin(time * 40));
      const mx = (MOUTH.x / GHAST_W - 0.5) * w, my = (MOUTH.y / GHAST_H - 0.5) * h;
      ctx.drawImage(IMG.fireball, mx - fs / 2, my - fs / 2, fs, fs);
    }
    ctx.restore();
  }
}

// 가스트가 나타날 때 피어오르는 연기
function puff(x, y, w, h) {
  for (let i = 0; i < 10; i++) {
    addPart({
      x: x + rand(-0.4, 0.4) * w, y: y + rand(-0.4, 0.4) * h,
      vx: rand(-1, 1) * U * 4, vy: -U * rand(1, 4), drag: 2, size: rand(1.5, 3) * U,
      grow: U * 2, life: rand(0.4, 0.8), color: pick(['#5a2a2a', '#7a4a4a', '#3a1a1a']),
    });
  }
}

// ---------- 화염구 ----------
// 가스트 입에서 출발해 화면(플레이어) 쪽으로 점점 커지며 날아온다
class Fireball {
  constructor(x, y, size, dur) {
    this.x0 = x; this.y0 = y;
    this.tx = rand(0.25, 0.75) * W;
    this.ty = rand(0.4, 0.75) * H;
    this.size0 = size;
    this.dur = dur;
    this.p = 0;
    this.rot = rand(0, Math.PI * 2);
    this.dead = false;
  }
  get x() { return lerp(this.x0, this.tx, this.p); }
  get y() { return lerp(this.y0, this.ty, this.p); }
  get size() { return this.size0 * (1 + 4.5 * this.p * this.p); }
  hitTest(px, py) {
    return Math.hypot(px - this.x, py - this.y) < this.size * 0.55 + U * 2;
  }
  update(dt) {
    this.p += dt / this.dur;
    this.rot += dt * 5;
    if (Math.random() < dt * 40) {
      addPart({
        x: this.x + rand(-0.3, 0.3) * this.size, y: this.y + rand(-0.3, 0.3) * this.size,
        vx: rand(-1, 1) * U * 3, vy: -U * rand(2, 6), size: rand(0.5, 1.2) * U * (0.6 + this.p),
        life: rand(0.3, 0.6), color: pick(['#ffb23a', '#ff6a1a', '#ffd25a', '#4a4a4a']),
      });
    }
    if (this.p >= 1) {
      this.dead = true;
      playerHit(this);
    }
  }
  draw() {
    const s = this.size;
    const glow = ctx.createRadialGradient(this.x, this.y, s * 0.2, this.x, this.y, s);
    glow.addColorStop(0, 'rgba(255, 150, 40, 0.45)');
    glow.addColorStop(1, 'rgba(255, 150, 40, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(this.x - s, this.y - s, s * 2, s * 2);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.drawImage(IMG.fireball, -s / 2, -s / 2, s, s);
    ctx.restore();
  }
}

// ---------- 게임 상태 ----------
let ghasts = [];
let fireballs = [];
const game = {
  state: 'loading',     // loading → title → countdown → play → result
  paused: false,
  score: 0,
  timeLeft: 0,
  elapsed: 0,
  spawnTimer: 0,
  countdown: 0,
  nextBonus: 0,         // 다음 보너스 시간을 받는 점수
  bonusCount: 0,        // 이번 판에 받은 보너스 횟수
  level: 1,             // 보너스 점수를 넘을 때마다 1씩 오름 → 가스트가 빨라짐
  resultTime: 0,
  lastTick: 0,
  mode: 'solo',         // 'solo' 1인 기록전(랭킹 저장) / 'versus' 2인 대결(랭킹 없음)
  players: [],          // [{ name, score, rewardShown, stats }] — 1인은 1명, 2인 대결은 2명
  rankInfo: null,       // 결과 화면의 순위 { status: 'saving'|'saved'|'error', rankToday, rankAll, local }
  lastEntryId: null,    // 방금 저장한 기록 (랭킹 화면에서 강조)
  rankFrom: 'title',    // 랭킹 화면을 닫으면 돌아갈 곳
  titleTop: [],         // 처음 화면에 흘러가는 오늘의 TOP 10
};

// ---------- 랭킹 (Cloudflare 온라인 DB) ----------
// 기록은 Cloudflare Worker + D1 에 저장한다 (worker.js).
// 인터넷이 끊기면 이 PC 에 잠시 보관했다가, 다시 연결되면 자동으로 올린다.
const RANK_API_ORIGIN = 'https://ghast-shooting.gcinhak.workers.dev'; // wrangler deploy 로 만든 주소
const RANK_PENDING_KEY = 'ghast-shooting-pending';   // 아직 못 올린 기록
const RANK_CACHE_KEY = 'ghast-shooting-rank-cache';  // 마지막으로 받아 온 랭킹 (오프라인일 때 보여줌)
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
const byRank = (a, b) => b.score - a.score || a.created_at - b.created_at;
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가 */ } };

// Cloudflare 에 올린 게임 페이지에서 열면 같은 주소의 /api, 행사 PC(localhost·파일)에서 열면 위 주소로 보낸다
function rankApi(path) {
  const sameOrigin = location.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(location.hostname);
  return `${sameOrigin ? '' : RANK_API_ORIGIN}/api/scores${path}`;
}

const Ranking = {
  online: null, // 마지막 요청이 성공했는지 (설정 창 표시용)

  async request(method, path, body) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (method === 'DELETE') headers['X-Admin-Key'] = settings.adminKey || '';
    let res;
    try {
      res = await fetch(rankApi(path), { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (err) {
      this.online = false;
      throw err;
    }
    this.online = true;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `서버 오류 ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  },
  // 서버가 '이 기록은 안 받는다'고 확실히 거절한 경우 (닉네임·점수 문제).
  // 이런 기록은 다시 보내도 안 되니 보관하지 않는다.
  // 인터넷 끊김(status 없음)·너무 잦은 저장(429)·서버 고장(5xx)은 나중에 다시 보낸다.
  isRejected(err) { return err.status >= 400 && err.status < 500 && err.status !== 429; },

  pending() { return readJson(RANK_PENDING_KEY, []); },

  // 기록 저장 → { id, rankToday, rankAll, pending } 또는 { rejected: '이유' }
  async add(entry) {
    const row = { ...entry, created_at: Date.now() };
    try {
      const r = await this.request('POST', '', { ...row, since: todayStart() });
      return { ...r, pending: false };
    } catch (err) {
      if (this.isRejected(err)) return { rejected: err.message };
      console.warn('랭킹을 올리지 못해 이 PC 에 보관합니다', err);
      const id = `p-${row.created_at}`;
      writeJson(RANK_PENDING_KEY, [...this.pending(), { ...row, id }]);
      return { id, pending: true };
    }
  },

  // 보관해 둔 기록을 올린다 (처음 켤 때, 그리고 주기적으로)
  flushing: false,
  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    const drop = (id) => writeJson(RANK_PENDING_KEY, this.pending().filter((p) => p.id !== id));
    for (const row of this.pending()) {
      try {
        const r = await this.request('POST', '', { ...row, since: todayStart() });
        drop(row.id);
        if (game.lastEntryId === row.id) game.lastEntryId = r.id;
      } catch (err) {
        // 서버가 거절한 기록 하나 때문에 뒤의 기록까지 막히지 않도록 버리고 계속한다
        if (this.isRejected(err)) { console.warn('서버가 거절한 보관 기록을 버립니다', row, err.message); drop(row.id); continue; }
        break; // 아직 오프라인 등 — 다음에 다시 시도
      }
    }
    this.flushing = false;
  },

  // scope: 'today' | 'all' — 아직 못 올린 기록도 함께 보여준다
  async top(scope, limit = 10) {
    const since = scope === 'today' ? todayStart() : 0;
    await this.flush();
    let list;
    try {
      list = await this.request('GET', `?since=${since}&limit=${limit}`);
      writeJson(`${RANK_CACHE_KEY}-${scope}`, list);
    } catch {
      list = readJson(`${RANK_CACHE_KEY}-${scope}`, []).filter((r) => r.created_at >= since);
    }
    const waiting = this.pending().filter((r) => r.created_at >= since).map((r) => ({ ...r, pending: true }));
    return [...list, ...waiting].sort(byRank).slice(0, limit);
  },

  async remove(id) {
    if (String(id).startsWith('p-')) {
      writeJson(RANK_PENDING_KEY, this.pending().filter((p) => p.id !== id));
      return;
    }
    return this.request('DELETE', `/${id}`);
  },
  async clear() {
    await this.request('DELETE', '');
    writeJson(RANK_PENDING_KEY, []);
  },
};
// 보관 중인 기록은 30초마다 다시 올려 본다
setInterval(() => { if (Ranking.pending().length) Ranking.flush(); }, 30_000);

function refreshTitleTop() {
  Ranking.top('today', 10).then((list) => { game.titleTop = list; }).catch(() => {});
}
// 처음 화면에 머무는 동안에도 30초마다 새 기록을 반영한다
setInterval(() => { if (game.state === 'title') refreshTitleTop(); }, 30_000);

// 랭킹 화면
// '오늘' 은 TOP 10 만, '전체' 는 100명까지 쪽을 넘겨 가며 본다
const RANK_TODAY_LIMIT = 10;
const RANK_ALL_LIMIT = 100;
const rankLimit = (scope) => (scope === 'today' ? RANK_TODAY_LIMIT : RANK_ALL_LIMIT);
const rankView = { scope: 'today', list: null, req: 0, page: 0, perPage: 10 };
function openRanking() {
  game.rankFrom = game.state === 'result' ? 'result' : 'title';
  game.state = 'ranking';
  setRankScope(rankView.scope);
  updateCornerButtons();
}
function setRankScope(scope) {
  rankView.scope = scope;
  rankView.list = null;
  rankView.page = 0;
  const req = ++rankView.req;
  Ranking.top(scope, rankLimit(scope))
    .then((list) => {
      if (req !== rankView.req) return;
      rankView.list = list;
      // 방금 한 판의 기록이 있으면 그 기록이 있는 쪽을 먼저 보여 준다
      const mine = list.findIndex((r) => r.id === game.lastEntryId);
      if (mine >= 0) rankView.page = Math.floor(mine / rankView.perPage);
    })
    .catch(() => { if (req === rankView.req) rankView.list = []; });
}
function rankPages() { return Math.max(1, Math.ceil((rankView.list?.length || 0) / rankView.perPage)); }
function turnRankPage(delta) { rankView.page = clamp(rankView.page + delta, 0, rankPages() - 1); }
// 이 노트북의 serve.cjs 로 열었으면 관리자 키를 자동으로 채운다 (data/admin-key.txt)
async function loadLocalAdminKey() {
  if (settings.adminKey || !['localhost', '127.0.0.1'].includes(location.hostname)) return;
  try {
    const res = await fetch('/local/admin-key', { cache: 'no-store' });
    if (!res.ok) return;
    const key = (await res.text()).trim();
    if (key) { settings.adminKey = key; saveSettings(); }
  } catch { /* 키 파일이 없으면 설정 창에서 직접 입력 */ }
}

// 결과 화면 버튼 잠금 시간(초): 게임이 끝나도 계속 쏘는 학생이 버튼을 잘못 누르지 않게
const RESULT_LOCK = 3;

// ---------- 총 연결 화면 (2인 대결용 1P/2P 지정) ----------
function openGunSetup() {
  game.state = 'gunsetup';
  Guns.assigning = null;
  Guns.message = '';
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave(true));
  updateCornerButtons();
}
function closeGunSetup() {
  Guns.assigning = null;
  goTitle();
}
// 현장에서 조준이 거꾸로 움직이면 바로 고칠 수 있게 (설정에도 저장)
function toggleGunSetting(key) {
  if (key === 'gunAxes') settings.gunAxes = { auto: '01', '01': '23', '23': 'auto' }[settings.gunAxes] || 'auto';
  else settings[key] = !settings[key];
  saveSettings();
}

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
  if (g.type === 'gold') Sound.reward();
}

function goTitle() {
  game.state = 'title';
  game.level = 1; // 처음 화면의 가스트는 천천히
  game.paused = false;
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave(true));
  refreshTitleTop();
  updateCornerButtons();
}

// mode·names 를 비우면 방금 한 판과 같은 모드·이름으로 다시 시작 ('다시 하기')
function startGame(mode = game.mode, names = game.players.map((p) => p.name)) {
  Sound.init();
  game.mode = mode;
  const count = mode === 'versus' ? 2 : 1;
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
  game.timeLeft = settings.gameSeconds;
  game.elapsed = 0;
  game.spawnTimer = 0;
  game.nextBonus = bonusGaps()[0] ?? Infinity;
  game.bonusCount = 0;
  game.level = 1;
  game.rankInfo = null;
  banner = null;
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave(true));
  updateCornerButtons();
}

function endGame() {
  game.state = 'result';
  game.resultTime = 0;
  game.timeLeft = 0;
  // 남은 화염구는 공중에서 터뜨림
  fireballs.forEach((f) => burstFire(f.x, f.y, 0.6));
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave(true));
  const win = game.players.some((p) => p.score >= settings.rewardScore);
  Sound.end(win || game.mode === 'versus');
  updateCornerButtons();

  // 랭킹은 1인 기록전만 저장한다 (2인 대결은 승패만)
  if (game.mode !== 'solo') return;
  const me = game.players[0];
  game.rankInfo = { status: 'saving' };
  Ranking.add({ name: me.name || '이름없음', score: me.score, kills: me.stats.kills })
    .then((r) => {
      if (r.rejected) { game.rankInfo = { status: 'rejected', reason: r.rejected }; return; }
      game.rankInfo = { status: 'saved', ...r };
      game.lastEntryId = r.id;
    })
    .catch((err) => { console.error(err); game.rankInfo = { status: 'error' }; });
}

// 2인 대결에서 각 플레이어를 구분하는 색 (조준점·점수판·점수 팝업)
const PLAYER_COLORS = ['#5ae8ff', '#ff7ad9'];
const topScore = () => Math.max(0, ...game.players.map((p) => p.score));
// '1P 다희' 처럼 자리와 이름을 함께. 이름을 비워 '1P' 그대로면 한 번만
const playerLabel = (p, i) => (p.name === `${i + 1}P` ? p.name : `${i + 1}P  ${p.name}`);

// who: 점수를 받는 플레이어 (0 = 1P, 1 = 2P)
function addScore(n, who = 0) {
  const p = game.players[who];
  if (!p) return;
  p.score = Math.max(0, p.score + n);
  let rewardNow = false;
  if (!p.rewardShown && p.score >= settings.rewardScore) {
    p.rewardShown = true;
    rewardNow = true;
    Sound.reward();
    const title = game.mode === 'versus' ? `${p.name} 가스트의 눈물 확보!` : '가스트의 눈물 확보!';
    showBanner(title, `${settings.rewardScore}점 달성`, '#9ff6ff');
  }
  // 마지막 보너스 이후 점수를 새로 30 → 50 → 70 … 모을 때마다 시간 추가
  // (감점으로 내려갔다 다시 넘어도 같은 구간은 한 번만). 2인 대결은 앞선 사람 점수 기준
  const top = topScore();
  if (settings.bonusSeconds > 0 && top >= game.nextBonus) {
    const reached = game.nextBonus;
    const gaps = bonusGaps();
    while (top >= game.nextBonus) {
      game.timeLeft += settings.bonusSeconds;
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
    const sub = `+${settings.bonusSeconds}초 보너스  ·  ${what}`;
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
  game.players.forEach((p, i) => {
    p.stats.escapes++;
    if (settings.escapePenalty > 0) addScore(-settings.escapePenalty, i);
  });
  if (settings.escapePenalty > 0) {
    // 가스트가 사라진 쪽 화면 가장자리에 표시
    const x = clamp(gh.x, U * 10, W - U * 10);
    popupScore(x, clamp(gh.y, U * 22, H - U * 10), `-${settings.escapePenalty} 놓침!`, '#ff6a5a');
  }
}

// 화염구가 화면에 닿음 = 플레이어 피격
function playerHit(fb) {
  if (game.state !== 'play') return;
  Sound.explode();
  burstFire(fb.x, fb.y, 1.4);
  shake = Math.max(shake, U * 2.5);
  doFlash('#ff2a10', 0.5);
  // 화면에 닿은 화염구는 모두가 맞은 것: 2인 대결이면 두 사람 모두 감점
  game.players.forEach((p, i) => {
    p.stats.hitsTaken++;
    if (settings.hitPenalty > 0) addScore(-settings.hitPenalty, i);
  });
  if (settings.hitPenalty > 0) popupScore(fb.x, fb.y - U * 6, `-${settings.hitPenalty}`, '#ff6a5a');
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

let buttons = [];
// who: 쏜 사람 (0 = 1P, 1 = 2P). 마우스·1인 기록전은 항상 1P
function onTap(x, y, who = 0) {
  const now = performance.now();
  if (isDuplicateTap(x, y, now)) return;
  Sound.init();

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
  if (game.state === 'title' || game.state === 'result' || game.state === 'ranking' || game.state === 'gunsetup') {
    for (const b of buttons) {
      if (b.enabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.action(); return; }
    }
    if (game.state === 'ranking' || game.state === 'gunsetup') return;
    // 처음 화면의 가스트는 연습용으로 맞힐 수 있다 (점수 없음)
    const g = [...ghasts].sort((a, b) => b.z - a.z).find((o) => o.hittable() && o.hitTest(x, y));
    if (g) { g.kill(); Sound.hit(); }
    return;
  }
  if (game.state !== 'play' || game.paused) return;
  const shooter = game.players[who];
  if (!shooter) return;
  const versus = game.mode === 'versus';
  // 2인 대결에서는 점수 팝업에 누가 얻었는지(1P/2P)와 그 사람 색을 붙인다
  const tag = (s) => (versus ? `${who + 1}P ${s}` : s);
  const tint = (c) => (versus ? PLAYER_COLORS[who] : c);

  shooter.stats.shots++;

  // 1) 가장 가까이 날아온 화염구부터
  const fb = [...fireballs].sort((a, b) => b.p - a.p).find((f) => !f.dead && f.hitTest(x, y));
  if (fb) {
    fb.dead = true;
    shooter.stats.deflects++;
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
    Sound.hit();
    shake = Math.max(shake, U * 0.8);
    doFlash('#ffffff', 0.12);
    const color = g.type === 'gold' ? '#ffd84a' : g.points > settings.killPoints ? '#ffb23a' : '#7dff6a';
    popupScore(c.x + g.w * 0.3, c.y - g.h * 0.5, tag(`+${g.points}`), tint(color));
    addScore(g.points, who);
    return;
  }

  // 3) 빗나감 (배경을 맞힘) → 쏜 사람만 감점
  shooter.stats.misses++;
  Sound.miss();
  for (let i = 0; i < 6; i++) {
    addPart({ x, y, vx: rand(-1, 1) * U * 8, vy: rand(-1, 0.3) * U * 8, g: U * 40, size: U * 0.6, life: 0.4, color: '#bbbbbb' });
  }
  if (settings.missPenalty > 0) {
    popupScore(x, y - U * 4, tag(`-${settings.missPenalty}`), versus ? PLAYER_COLORS[who] : '#ff6a5a');
    addScore(-settings.missPenalty, who);
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
  onTap(e.clientX, e.clientY, 0);
});
// 조준점 위치 (라이트건을 움직이면 마우스 커서가 따라 움직인다)
const aim = { x: 0, y: 0, seen: false };
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  aim.x = e.clientX; aim.y = e.clientY; aim.seen = true;
});

// ---------- 총 2대 (게임패드) ----------
// 총 2대가 모두 '마우스'로 들어오면 브라우저는 어느 총이 쐈는지 구분하지 못한다.
// 그래서 엑스거너를 조이스틱 모드(총에서 Space + 5 + 조이스틱 왼쪽)로 두면 총마다 게임패드로 따로 잡히고,
//   조준 = 조이스틱 축(-1 ~ 1) → 화면 위치, 방아쇠 = 버튼 하나
// 로 읽는다. 어느 총이 1P/2P 인지, 어느 버튼이 방아쇠인지는 '총 연결' 화면에서 방아쇠를 당겨 정한다.
const GUN_SAVE_KEY = 'ghast-shooting-guns';
const Guns = {
  pads: {},        // gamepad.index → { key, id, x, y, pressed[], min[], max[], lastActive }
  // 저장되는 지정 정보: 어떤 총(key)이 1P/2P 인지, 총마다 방아쇠 버튼 번호
  saved: readJson(GUN_SAVE_KEY, { p1: null, p2: null, trigger: {} }),
  assigning: null, // 총 연결 화면에서 지금 지정 중인 자리 (0 = 1P, 1 = 2P)
  message: '',

  save() { writeJson(GUN_SAVE_KEY, this.saved); },
  list() { return Object.values(this.pads); },
  // 최근 몇 초 안에 움직이거나 버튼을 누른 총이 있는지
  active(ms = 5000) { const now = performance.now(); return this.list().some((s) => now - s.lastActive < ms); },
  playerOf(s) { return this.saved.p1 === s.key ? 0 : this.saved.p2 === s.key ? 1 : -1; },
  triggerOf(s) { return this.saved.trigger[s.key] ?? 0; },

  // 조준에 쓸 축: 설정에서 고르거나(0·1 / 2·3), 자동이면 더 많이 움직인 쪽
  aimAxes(s, gp) {
    if (settings.gunAxes === '01') return [0, 1];
    if (settings.gunAxes === '23') return [2, 3];
    const span = (i) => (s.max[i] ?? 0) - (s.min[i] ?? 0);
    return gp.axes.length >= 4 && span(2) + span(3) > span(0) + span(1) ? [2, 3] : [0, 1];
  },

  poll() {
    const list = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const now = performance.now();
    // 같은 이름의 총이 둘이면 번호를 붙여 구분한다 (DIP 스위치가 같게 맞춰진 경우 등)
    const sameId = (id) => list.filter((g) => g.id === id).length > 1;
    for (const gp of list) {
      const key = sameId(gp.id) ? `${gp.id}#${gp.index}` : gp.id;
      let s = this.pads[gp.index];
      if (!s || s.key !== key) {
        s = this.pads[gp.index] = { key, id: gp.id, index: gp.index, x: W / 2, y: H / 2, pressed: [], min: [], max: [], lastActive: 0 };
      }
      gp.axes.forEach((v, i) => { s.min[i] = Math.min(s.min[i] ?? v, v); s.max[i] = Math.max(s.max[i] ?? v, v); });
      const [ix, iy] = this.aimAxes(s, gp);
      let ax = gp.axes[ix] ?? 0, ay = gp.axes[iy] ?? 0;
      if (settings.gunInvertX) ax = -ax;
      if (settings.gunInvertY) ay = -ay;
      const nx = ((clamp(ax, -1, 1) + 1) / 2) * W, ny = ((clamp(ay, -1, 1) + 1) / 2) * H;
      if (Math.hypot(nx - s.x, ny - s.y) > 2) s.lastActive = now;
      s.x = nx; s.y = ny;
      s.axes = [...gp.axes];
      gp.buttons.forEach((b, i) => {
        const down = b.pressed || b.value > 0.5;
        if (down && !s.pressed[i]) { s.lastActive = now; this.onButton(s, i); }
        s.pressed[i] = down;
      });
    }
    // 뽑힌 총은 목록에서 뺀다
    for (const idx of Object.keys(this.pads)) {
      if (!list.some((g) => String(g.index) === idx)) delete this.pads[idx];
    }
  },

  onButton(s, i) {
    Sound.init();
    // 총 연결 화면: 방아쇠를 당긴 총을 지금 자리(1P/2P)에, 그 버튼을 방아쇠로 기억
    if (this.assigning !== null) {
      const slot = this.assigning === 0 ? 'p1' : 'p2';
      const other = this.assigning === 0 ? 'p2' : 'p1';
      if (this.saved[other] === s.key) { this.message = '그 총은 이미 다른 자리에 지정돼 있어요. 다른 총의 방아쇠를 당기세요'; return; }
      this.saved[slot] = s.key;
      this.saved.trigger[s.key] = i;
      this.save();
      Sound.bonus();
      const done = this.assigning;
      // 1P 를 정했고 2P 가 아직 없으면 바로 2P 지정으로 넘어간다
      this.assigning = done === 0 && !this.saved.p2 ? 1 : null;
      this.message = `${done + 1}P 총을 지정했어요 (방아쇠 = 버튼 ${i})`;
      return;
    }
    if (i !== this.triggerOf(s)) return; // 방아쇠가 아닌 버튼은 무시
    // 2인 대결 중에는 지정된 자리로, 그 밖에는 (1인 기록전·메뉴) 1P 로 친다
    let who = 0;
    if (game.mode === 'versus' && (game.state === 'play' || game.state === 'countdown')) {
      who = this.playerOf(s);
      if (who < 0) return; // 지정 안 된 총은 대결 중 무시
    }
    onTap(s.x, s.y, who);
  },

  // 화면에 총 조준점 그리기 (최근에 쓴 총만). 지정된 총은 1P/2P 색과 이름표
  draw(time) {
    const now = performance.now();
    for (const s of this.list()) {
      if (now - s.lastActive > 10000) continue;
      const who = this.playerOf(s);
      drawAim(s.x, s.y, who >= 0 ? PLAYER_COLORS[who] : null, who >= 0 ? `${who + 1}P` : '총');
    }
  },
};
// 길게 누르기(오른쪽 클릭) 메뉴, 확대 제스처 막기
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  // 설정 창·닉네임 입력 중에는 게임 단축키를 쓰지 않는다 (글자 입력과 겹치지 않게)
  if (settingsOpen()) {
    if (e.key === 'Escape') closeSettings();
    return;
  }
  if (nameOpen()) {
    if (e.key === 'Escape') closeNameEntry();
    return;
  }
  Sound.init();
  // 엑스거너 총에는 q·s·w·a·d·5 같은 키보드 버튼이 달려 있다.
  // 게임 중에 학생이 잘못 눌러 판이 끝나거나(Q) 설정 창이 뜨지(S) 않도록 막는다.
  // 진행요원이 게임을 중단하려면 P(일시정지) → Q.
  const playing = (game.state === 'play' || game.state === 'countdown') && !game.paused;
  if (playing && (e.code === 'KeyQ' || e.code === 'KeyS')) return;
  switch (e.code) {
    case 'Space':
    case 'Enter':
    case 'NumpadEnter':
    case 'Digit1':   // 라이트건의 Start 버튼은 보통 키보드 '1' 로 들어온다
    case 'Numpad1':
      e.preventDefault();
      if (game.state === 'title') openNameEntry('solo');
      else if (game.state === 'result' && game.resultTime > RESULT_LOCK) nextPlayer();
      else if (game.state === 'ranking') closeRanking();
      else if (game.state === 'aimtest') goTitle();
      else if (game.state === 'gunsetup') closeGunSetup();
      else if (game.state === 'play' && game.paused) game.paused = false;
      break;
    case 'Digit2':   // 처음 화면에서 2 = 2인 대결
    case 'Numpad2':
      if (game.state === 'title') { e.preventDefault(); openNameEntry('versus'); }
      break;
    case 'KeyG':     // 총 연결 (2인 대결용 1P/2P 지정)
      if (game.state === 'title') openGunSetup();
      else if (game.state === 'gunsetup') closeGunSetup();
      break;
    case 'ArrowLeft':
    case 'PageUp':
      if (game.state === 'ranking') turnRankPage(-1);
      break;
    case 'ArrowRight':
    case 'PageDown':
      if (game.state === 'ranking') turnRankPage(1);
      break;
    case 'KeyR':
      if (game.state === 'title' || (game.state === 'result' && game.resultTime > RESULT_LOCK)) openRanking();
      else if (game.state === 'ranking') closeRanking();
      break;
    case 'KeyT':
      if (game.state === 'title') openAimTest();
      else if (game.state === 'aimtest') goTitle();
      break;
    case 'KeyP':
      if (game.state === 'play') game.paused = !game.paused;
      break;
    case 'KeyQ':
    case 'Escape':
      if (game.state === 'ranking') closeRanking();
      else if (game.state === 'gunsetup') closeGunSetup();
      else if (game.state === 'aimtest' || e.code === 'KeyQ') goTitle();
      break;
    case 'KeyF':
      toggleFullscreen();
      break;
    case 'KeyM':
      showBanner(Sound.toggleMute() ? '소리 꺼짐' : '소리 켜짐', '', '#ffffff', 1.2);
      break;
    case 'KeyS':
      openSettings();
      break;
  }
});

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}

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
  try { list = await Ranking.top('all', 100); } catch { box.textContent = '랭킹을 불러오지 못했습니다'; return; }
  const waiting = Ranking.pending().length;
  where.textContent = `저장 위치: Cloudflare 온라인 DB — ${Ranking.online ? '연결됨' : '연결 안 됨 (인터넷 확인)'}`
    + (waiting ? ` · 올리지 못한 기록 ${waiting}개 (연결되면 자동 업로드)` : '')
    + ' · 삭제하려면 아래 관리자 키가 필요합니다';
  box.textContent = '';
  if (!list.length) { box.textContent = '아직 기록이 없습니다'; return; }
  list.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'rank-row';
    const label = document.createElement('span');
    label.textContent = `${i + 1}. ${r.name} · ${r.score}점 · ${new Date(r.created_at).toLocaleString('ko-KR')}${r.pending ? ' · 업로드 대기' : ''}`;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '삭제';
    del.addEventListener('click', async () => {
      if (!confirm(`'${r.name}' (${r.score}점) 기록을 지울까요?`)) return;
      await Ranking.remove(r.id).catch((err) => alert(`삭제 실패: ${err.message}`));
      loadRankAdmin();
      refreshTitleTop();
    });
    row.append(label, del);
    box.append(row);
  });
}
document.getElementById('rank-clear').addEventListener('click', async () => {
  if (!confirm('랭킹 기록을 모두 지울까요? 되돌릴 수 없습니다.')) return;
  await Ranking.clear().catch((err) => alert(`삭제 실패: ${err.message}`));
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
let nameMode = 'solo';
// mode: 'solo' 1인 기록전(닉네임 필수, 랭킹 저장) / 'versus' 2인 대결(이름 두 개, 비우면 1P·2P)
function openNameEntry(mode = 'solo') {
  Sound.init();
  if (game.state !== 'title') goTitle();
  nameMode = mode;
  const versus = mode === 'versus';
  nameForm.classList.toggle('versus', versus);
  nameTitle.textContent = versus ? '2인 대결 — 이름을 입력하세요' : '1인 기록전 — 닉네임을 입력하세요';
  nameInput.placeholder = versus ? '1P 이름' : '예: 가스트헌터';
  nameInput.value = '';
  nameInput2.value = '';
  nameInput2.hidden = !versus;
  nameHint.textContent = versus
    ? '비워 두면 1P · 2P 로 표시돼요 (대결은 랭킹에 저장되지 않아요)'
    : '랭킹에 이 이름으로 기록돼요 (최대 12자)';
  nameHint.classList.remove('error');
  nameEl.hidden = false;
  setTimeout(() => nameInput.focus(), 0);
}
function closeNameEntry() { nameEl.hidden = true; }
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
  if (!name) {
    nameHint.textContent = '닉네임을 입력해 주세요!';
    nameHint.classList.add('error');
    nameInput.select();
    nameInput.focus();
    return;
  }
  closeNameEntry();
  startGame('solo', [name]);
});
document.getElementById('name-cancel').addEventListener('click', closeNameEntry);
// 결과 화면 → 다음 사람/새 대결 (이름 새로 입력)
function nextPlayer() { openNameEntry(game.mode); }
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
});
document.getElementById('settings-reset').addEventListener('click', () => fillForm(DEFAULTS));
document.getElementById('settings-close').addEventListener('click', closeSettings);
document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
document.getElementById('btn-aimtest').addEventListener('click', () => { Sound.init(); openAimTest(); });
document.getElementById('btn-gunsetup').addEventListener('click', () => { Sound.init(); openGunSetup(); });
function updateCornerButtons() {
  document.getElementById('corner-buttons').classList.toggle('hidden', game.state !== 'title' && game.state !== 'result');
}

// ---------- 글자·버튼 그리기 ----------
const FONT = '"Galmuri11", "Galmuri9", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
// 글자가 maxW 보다 넓으면 들어가도록 글자 크기를 줄여서 돌려준다
function fitTextSize(str, size, maxW) {
  ctx.font = `bold ${Math.round(size)}px ${FONT}`;
  const w = ctx.measureText(str).width;
  return w > maxW ? size * (maxW / w) : size;
}
function text(str, x, y, size, color = '#fff', align = 'center', opts = {}) {
  ctx.font = `bold ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const off = Math.max(2, size * 0.08);
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.18;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(str, x + off, y + off);
  ctx.fillStyle = opts.shadow || '#2a0d06';
  ctx.fillText(str, x + off, y + off);
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
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
  text(label, cx, cy, h * 0.42, '#ffffff');
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
function drawTitle(time) {
  const cx = W / 2;
  const bobY = Math.sin(time * 2) * U * 0.8;
  text('가스트 사격', cx, H * 0.17 + bobY, U * 15, '#ffffff', 'center', { shadow: '#a3200c' });
  text('GHAST SHOOTING', cx, H * 0.17 + U * 11, U * 4.5, '#ffcf5a');

  const pw = Math.min(W - U * 8, U * 112), ph = U * 45;
  const py = H * 0.32;
  panel(cx - pw / 2, py, pw, ph, 0.68);
  const lines = [
    ['네더의 가스트가 화염구를 쏘기 전에 맞혀라!', '#ffffff', 5],
    [`가스트 종류마다 +${Math.max(1, settings.killPoints - 1)}~${settings.killPoints * 5}점  ·  화염구 맞히기 +${settings.deflectPoints}점`, '#ffd9b0', 3.4],
    [`배경을 맞히면 -${settings.missPenalty}점  ·  가스트를 놓치면 -${settings.escapePenalty}점  ·  화염구에 맞으면 -${settings.hitPenalty}점`, '#ff9a8a', 3.3],
    [`제한 시간 ${timeLabel(settings.gameSeconds)}   ·   ${bonusSteps()}점마다 +${settings.bonusSeconds}초 & 레벨 UP!`, '#ffe14a', 3.4],
    [`${settings.rewardScore}점 이상이면 '가스트의 눈물'을 드려요`, '#9ff6ff', 4],
    ['※ 화면만 쏘세요! 사람을 향해 쏘면 안 돼요', '#ff8a7a', 3.2],
  ];
  lines.forEach(([str, color, size], i) => text(str, cx, py + U * (6 + i * 6.6), U * size, color));
  // 가스트의 눈물 아이콘
  ctx.imageSmoothingEnabled = false;
  const ts = U * 6, ty = py + U * (6 + 4 * 6.6);
  ctx.drawImage(IMG.tear, cx - pw / 2 + U * 3, ty - ts / 2, ts, ts);
  ctx.drawImage(IMG.tear, cx + pw / 2 - U * 3 - ts, ty - ts / 2, ts, ts);

  // 1인 기록전(랭킹 저장) · 2인 대결(랭킹 없음) · 랭킹
  button('1인 기록전', cx - U * 30, H * 0.84, U * 36, U * 12, () => openNameEntry('solo'), true, true);
  button('2인 대결', cx + U * 8, H * 0.84, U * 32, U * 12, () => openNameEntry('versus'), true, true);
  button('랭킹', cx + U * 38, H * 0.84, U * 20, U * 12, openRanking);
  const hint = 'Space 1인 · 2 대결 · R 랭킹 · G 총 연결 · S 설정';
  text(hint, cx, H * 0.84 + U * 10, U * 2.6, '#c9a89a');
  // 오늘 랭킹은 버튼·안내 글자와 겹치지 않게 그 왼쪽까지만
  ctx.font = `bold ${Math.round(U * 2.6)}px ${FONT}`;
  const hintLeft = cx - ctx.measureText(hint).width / 2;
  drawTitleTicker(time, Math.min(cx - U * 50, hintLeft - U * 3));
}

// 처음 화면 왼쪽 아래: 오늘 랭킹 TOP 10 이 아래에서 위로 천천히 흘러 올라간다
function drawTitleTicker(time, right) {
  const list = game.titleTop;
  if (!list.length) return;
  const x = U * 4;
  const maxW = Math.max(U * 22, right - x);
  const rowH = U * 4.6;
  const visible = 4;                       // 한 번에 보이는 줄 수
  const boxBottom = H - U * 2.5;
  const boxTop = boxBottom - rowH * visible;

  const head = `오늘의 랭킹 TOP ${list.length}`;
  text(head, x, boxTop - U * 3.5, fitTextSize(head, U * 3.4, maxW), '#ffe14a', 'left');

  // 줄 수가 보이는 칸보다 적으면 멈춰 있고, 많으면 끝없이 위로 흐른다 (한 바퀴 뒤 빈 줄 하나 두고 반복)
  const scrolling = list.length > visible;
  const loopH = (list.length + 1) * rowH;
  const offset = scrolling ? (time * rowH / 1.6) % loopH : 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x - U, boxTop, maxW + U * 2, boxBottom - boxTop);
  ctx.clip();
  const copies = scrolling ? 2 : 1;
  for (let c = 0; c < copies; c++) {
    list.forEach((r, i) => {
      const y = boxTop + rowH * (i + 0.5) + c * loopH - offset;
      if (y < boxTop - rowH || y > boxBottom + rowH) return;
      // 위·아래 가장자리에서는 흐릿하게 사라지고 나타난다
      const edge = Math.min(y - boxTop, boxBottom - y);
      const fade = scrolling ? clamp(edge / (rowH * 0.9), 0, 1) : 1;
      ctx.globalAlpha = fade;
      const str = `${i + 1}위  ${r.name}  ${r.score}점`;
      const crownW = U * 4.2;
      // 1등은 줄 끝에 왕관을 달 자리를 남겨 둔다
      const size = fitTextSize(str, U * 3.2, i === 0 ? maxW - crownW - U * 1.5 : maxW);
      text(str, x, y, size, MEDAL[i] || '#ffffff', 'left');
      if (i === 0) {
        ctx.font = `bold ${Math.round(size)}px ${FONT}`;
        const tw = ctx.measureText(str).width;
        drawSparkles(x - U, y - rowH * 0.5, tw + crownW + U * 3, rowH, time, 5, 7, fade);
        drawCrown(x + tw + U * 1.2 + crownW / 2, y - U * 0.3, crownW, time, fade);
        ctx.globalAlpha = fade;
      }
    });
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
const MEDAL = ['#ffd84a', '#d8d8e0', '#e09a5a'];

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

function drawGunSetup() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const pw = Math.min(W - U * 8, U * 130), ph = Math.min(H - U * 4, U * 96);
  const px = cx - pw / 2, py = (H - ph) / 2;
  panel(px, py, pw, ph, 0.88);

  text('총 연결 (2인 대결)', cx, py + U * 7, U * 6.5, '#ffcf5a', 'center', { shadow: '#a3200c' });
  text('두 총을 조이스틱 모드로 바꾸세요: 총에서 Space + 5 + 조이스틱 왼쪽  ·  방아쇠를 한 번 당기면 게임이 총을 알아봐요', cx, py + U * 14, U * 2.7, '#ffd9b0');

  const pads = Guns.list();
  let y = py + U * 22;
  if (!pads.length) {
    text('아직 게임패드로 잡힌 총이 없어요', cx, y + U * 6, U * 4.2, '#ff8a7a');
    text('① 수신기가 꽂혀 있고 총 전원이 켜졌는지  ② 조이스틱 모드인지  ③ 방아쇠를 한 번 당겼는지 확인하세요', cx, y + U * 13, U * 2.8, '#ffffff');
    text('1인 기록전은 마우스(라이트건) 모드로도 그대로 할 수 있어요', cx, y + U * 19, U * 2.8, '#c9a89a');
  } else {
    pads.forEach((s, i) => {
      const who = Guns.playerOf(s);
      const color = who >= 0 ? PLAYER_COLORS[who] : '#ffffff';
      const role = who >= 0 ? `${who + 1}P` : '미지정';
      const axes = (s.axes || []).slice(0, 4).map((v) => v.toFixed(2)).join('  ');
      const fresh = performance.now() - s.lastActive < 1500;
      text(`총 ${i + 1}  ·  ${role}`, px + U * 6, y, U * 3.8, color, 'left');
      text(`방아쇠 = 버튼 ${Guns.triggerOf(s)}  ·  축 [${axes}]${fresh ? '  ● 움직임' : ''}`, px + U * 34, y, U * 2.6, '#ffd9b0', 'left');
      text(s.id.slice(0, 48), px + U * 6, y + U * 4, U * 2.2, '#8a7a72', 'left');
      y += U * 9.5;
    });
  }

  // 안내 문구: 지금 무엇을 해야 하는지
  const ask = Guns.assigning !== null ? `${Guns.assigning + 1}P 총의 방아쇠를 당기세요` : Guns.message;
  if (ask) text(ask, cx, py + ph - U * 33, U * 4, Guns.assigning !== null ? PLAYER_COLORS[Guns.assigning] : '#9ff6ff');
  const p1 = Guns.saved.p1 ? '지정됨' : '없음', p2 = Guns.saved.p2 ? '지정됨' : '없음';
  text(`1P: ${p1}   ·   2P: ${p2}   ·   두 총 조준점이 화면에 따라다니면 준비 끝`, cx, py + ph - U * 27, U * 2.8, '#ffffff');

  // 조준 보정: 조준점이 거꾸로 움직이거나 안 움직이면 여기서 바로 고친다
  const axesLabel = { auto: '자동', '01': '0·1', '23': '2·3' }[settings.gunAxes] || '자동';
  const by1 = py + ph - U * 19;
  button(`좌우 뒤집기 ${settings.gunInvertX ? 'ON' : 'OFF'}`, cx - U * 34, by1, U * 30, U * 7, () => toggleGunSetting('gunInvertX'), true, settings.gunInvertX);
  button(`위아래 뒤집기 ${settings.gunInvertY ? 'ON' : 'OFF'}`, cx, by1, U * 30, U * 7, () => toggleGunSetting('gunInvertY'), true, settings.gunInvertY);
  button(`조준 축: ${axesLabel}`, cx + U * 34, by1, U * 30, U * 7, () => toggleGunSetting('gunAxes'));

  const by2 = py + ph - U * 8;
  button('1P 지정', cx - U * 45, by2, U * 20, U * 8, () => { Guns.assigning = 0; Guns.message = ''; }, true, Guns.assigning === 0);
  button('2P 지정', cx - U * 22, by2, U * 20, U * 8, () => { Guns.assigning = 1; Guns.message = ''; }, true, Guns.assigning === 1);
  button('초기화', cx + U * 1, by2, U * 20, U * 8, () => {
    Guns.saved = { p1: null, p2: null, trigger: {} };
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

function drawRanking(time) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  // '오늘' 은 TOP 10 한 줄, '전체' 는 넓은 화면(프로젝터)에서 두 줄로 한 번에 20명
  const today = rankView.scope === 'today';
  const cols = !today && W - U * 8 >= U * 140 ? 2 : 1;
  const pw = Math.min(W - U * 8, cols === 2 ? U * 150 : U * 100);
  const ph = Math.min(H - U * 4, U * 100);
  const px = cx - pw / 2, py = (H - ph) / 2;
  panel(px, py, pw, ph, 0.88);

  const list = rankView.list;
  const per = cols * 10;
  if (rankView.perPage !== per) { rankView.perPage = per; rankView.page = 0; }
  const pages = today ? 1 : rankPages();
  rankView.page = today ? 0 : clamp(rankView.page, 0, pages - 1);
  const start = rankView.page * per;

  text(today ? '오늘의 TOP 10' : '전체 랭킹', cx, py + U * 7, U * 7, '#ffcf5a', 'center', { shadow: '#a3200c' });
  button('오늘', cx - U * 13, py + U * 17, U * 22, U * 7, () => setRankScope('today'), true, rankView.scope === 'today');
  button('전체', cx + U * 13, py + U * 17, U * 22, U * 7, () => setRankScope('all'), true, rankView.scope === 'all');

  const top = py + U * 31, bottom = py + ph - U * 17;
  const rowH = Math.min(U * 6.4, (bottom - top) / 10);
  const colW = (pw - U * 6) / cols;
  const size = Math.min(U * 3.8, rowH * 0.62);
  // 긴 닉네임은 옆 칸을 침범하지 않게 글자를 줄인다
  const fit = (str, s, maxW) => {
    ctx.font = `bold ${Math.round(s)}px ${FONT}`;
    const w = ctx.measureText(str).width;
    return w > maxW ? s * (maxW / w) : s;
  };

  // 칸 하나(10명)를 그린다
  const drawColumn = (c, rows, firstRank) => {
    const left = px + U * 3 + c * colW;
    const colRank = left + U * 5, colName = left + U * 12, colKills = left + colW - U * 21, colScore = left + colW - U * 3;
    const headY = py + U * 26;
    text('순위', colRank, headY, U * 2.8, '#c9a89a');
    text('닉네임', colName, headY, U * 2.8, '#c9a89a', 'left');
    text('처치', colKills, headY, U * 2.8, '#c9a89a');
    text('점수', colScore, headY, U * 2.8, '#c9a89a', 'right');
    rows.forEach((r, i) => {
      const rank = firstRank + i;
      const y = top + rowH * (i + 0.5);
      if (r.id === game.lastEntryId) {
        ctx.fillStyle = 'rgba(255, 225, 74, 0.2)';
        ctx.fillRect(left, y - rowH / 2, colW - U * 1, rowH);
      }
      const color = MEDAL[rank - 1] || '#ffffff';
      // 1등: 금빛 줄 + 반짝이 (글자보다 먼저 그려 뒤에 깔리게)
      if (rank === 1) {
        ctx.fillStyle = 'rgba(255, 216, 74, 0.12)';
        ctx.fillRect(left, y - rowH / 2, colW - U * 1, rowH);
        drawSparkles(left, y - rowH * 0.8, colW - U * 1, rowH * 1.3, time, 10, 3);
      }
      text(`${rank}`, colRank, y, size, color);
      if (rank === 1) drawCrown(colRank, y - size * 0.95, U * 4.6, time); // 순위 '1' 위에 왕관을 씌운다
      text(r.name, colName, y, fit(r.name, size, colKills - colName - U * 5), color, 'left');
      text(String(r.kills ?? 0), colKills, y, size * 0.85, '#ffd9b0');
      text(`${r.score}점${r.pending ? ' *' : ''}`, colScore, y, size, color, 'right');
    });
  };

  if (!list) {
    text('불러오는 중…', cx, top + rowH * 3, U * 4, '#ffffff');
  } else if (!list.length) {
    text(rankView.scope === 'today' ? '오늘은 아직 기록이 없어요' : '아직 기록이 없어요', cx, top + rowH * 3, U * 4, '#ffffff');
  } else {
    for (let c = 0; c < cols; c++) {
      const from = start + c * 10;
      const rows = list.slice(from, from + 10);
      if (rows.length) drawColumn(c, rows, from + 1);
    }
  }

  // 아래: (전체일 때만) 이전 · 다음 과 지금 보고 있는 순위 범위
  const by = py + ph - U * 7;
  if (today) {
    button('돌아가기', cx, by, U * 36, U * 8, closeRanking);
  } else {
    button('◀ 이전', cx - U * 34, by, U * 24, U * 8, () => turnRankPage(-1), rankView.page > 0);
    button('돌아가기', cx, by, U * 30, U * 8, closeRanking);
    button('다음 ▶', cx + U * 34, by, U * 24, U * 8, () => turnRankPage(1), rankView.page < pages - 1);
  }
  if (list?.length) {
    const end = Math.min(list.length, start + per);
    const info = today
      ? '오늘 올라온 기록 중 상위 10명  ·  전체 랭킹은 [전체] 에서'
      : `${start + 1}~${end}위  ·  ${rankView.page + 1}/${pages}쪽  ·  총 ${list.length}명${list.length >= RANK_ALL_LIMIT ? ` (상위 ${RANK_ALL_LIMIT}명까지 표시)` : ''}`;
    text(info, cx, by - U * 7, U * 2.8, '#c9a89a');
  }
}

// 2인 대결: 왼쪽 1P, 오른쪽 2P 점수판. 앞선 사람 점수 옆에 작은 왕관
function drawVersusScores(time) {
  const [a, b] = game.players;
  const lead = a.score === b.score ? -1 : a.score > b.score ? 0 : 1;
  const pw = U * 46, ph = U * 13;
  [a, b].forEach((p, i) => {
    const left = i === 0 ? U * 2.5 : W - pw - U * 2.5;
    const align = i === 0 ? 'left' : 'right';
    const tx = i === 0 ? left + U * 3 : left + pw - U * 3;
    panel(left, U * 2.5, pw, ph, 0.6);
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
  if (game.mode === 'versus') {
    drawVersusScores(time);
  } else {
    panel(U * 2.5, U * 2.5, U * 40, U * 13, 0.6);
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
  text(`Lv.${game.level}`, W / 2, U * 17, U * 3.6, LEVEL_COLORS[Math.min(game.level, LEVEL_COLORS.length) - 1]);

  const bonusOn = settings.bonusSeconds > 0 && Number.isFinite(game.nextBonus);
  // 2인 대결은 양쪽에 점수판이 있으니, 다음 보너스만 타이머 아래 글자로
  if (game.mode === 'versus') {
    if (bonusOn) text(`다음 +${settings.bonusSeconds}초: 먼저 ${game.nextBonus}점`, W / 2, U * 21.5, U * 2.6, '#ffe14a');
    return;
  }

  // 목표 진행 막대: 가스트의 눈물 점수 / 다음 보너스 점수 표시
  const myScore = game.players[0].score;
  const bw = U * 52, bh = U * 3.4, bx = W - bw - U * 5, by = U * 9;
  const max = Math.max(settings.rewardScore, bonusOn ? game.nextBonus : 0, myScore, 1) * 1.15;
  panel(bx - U * 2.5, U * 2.5, bw + U * 5, U * 13, 0.6);
  ctx.fillStyle = '#2a1010';
  ctx.fillRect(bx, by, bw, bh);
  const fill = clamp(myScore / max, 0, 1);
  ctx.fillStyle = myScore >= settings.rewardScore ? '#7de3ff' : '#ff7a3a';
  ctx.fillRect(bx, by, bw * fill, bh);
  const mark = (score, label, color, img) => {
    const mx = bx + bw * clamp(score / max, 0, 1);
    ctx.fillStyle = color;
    ctx.fillRect(mx - U * 0.3, by - U * 1.2, U * 0.6, bh + U * 2.4);
    if (img) ctx.drawImage(img, mx - U * 2.4, by - U * 6, U * 4.8, U * 4.8);
    else text(label, mx, by - U * 3.4, U * 2.8, color);
    text(`${score}`, mx, by + bh + U * 2.6, U * 2.6, color);
  };
  mark(settings.rewardScore, '', '#9ff6ff', IMG.tear);
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
  const cx = W / 2, pw = Math.min(W - U * 8, U * 130), ph = U * 92;
  const px = cx - pw / 2, py = Math.max(U * 2, (H - ph) / 2);
  panel(px, py, pw, ph, 0.85);
  const [a, b] = game.players;
  const winner = a.score === b.score ? -1 : a.score > b.score ? 0 : 1;

  text('대결 종료!', cx, py + U * 7, U * 6, '#ffcf5a');
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
    if (p.score >= settings.rewardScore) {
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
  button('새 대결', cx - U * 33, by, U * 29, U * 9, () => openNameEntry('versus'), ready, true);
  button('다시 대결', cx, by, U * 29, U * 9, () => startGame(), ready);
  button('처음 화면', cx + U * 33, by, U * 29, U * 9, goTitle, ready);
}

function drawResult(time) {
  if (game.mode === 'versus') { drawVersusResult(time); return; }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, pw = Math.min(W - U * 8, U * 110), ph = U * 92;
  const py = Math.max(U * 2, (H - ph) / 2);
  panel(cx - pw / 2, py, pw, ph, 0.82);
  const me = game.players[0];
  const win = me.score >= settings.rewardScore;
  const st = me.stats;
  text(`${me.name || '이름없음'} 님 · 미션 종료!`, cx, py + U * 7, U * 6.5, '#ffcf5a');
  text(`${me.score}점`, cx, py + U * 20, U * 15, '#ffffff', 'center', { shadow: '#a3200c' });
  const acc = st.shots ? Math.round(((st.kills + st.deflects) / st.shots) * 100) : 0;
  text(`처치 ${st.kills}  ·  반사 ${st.deflects}  ·  빗나감 ${st.misses}  ·  놓침 ${st.escapes}  ·  피격 ${st.hitsTaken}  ·  명중률 ${acc}%  ·  레벨 ${game.level}`, cx, py + U * 31, U * 3.2, '#ffd9b0');

  // 순위
  const ri = game.rankInfo;
  let rankLine = '';
  if (ri?.status === 'saving') rankLine = '랭킹 저장 중…';
  else if (ri?.status === 'error') rankLine = '랭킹 저장에 실패했어요';
  else if (ri?.status === 'rejected') rankLine = `랭킹에 올리지 못했어요: ${ri.reason}`;
  else if (ri?.status === 'saved' && ri.pending) rankLine = '인터넷 연결이 안 돼 이 PC에 보관했어요 (연결되면 자동으로 올라가요)';
  else if (ri?.status === 'saved') rankLine = `오늘 ${ri.rankToday}위  ·  전체 ${ri.rankAll}위`;
  text(rankLine, cx, py + U * 38, U * 4.4, ri?.status === 'error' || ri?.status === 'rejected' ? '#ff8a7a' : '#ffe14a');

  if (win) {
    const ts = U * 15, ty = py + U * 53 + Math.sin(time * 3) * U;
    const glow = ctx.createRadialGradient(cx, ty, 0, cx, ty, ts * 1.4);
    glow.addColorStop(0, 'rgba(160, 246, 255, 0.55)');
    glow.addColorStop(1, 'rgba(160, 246, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - ts * 1.5, ty - ts * 1.5, ts * 3, ts * 3);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(IMG.tear, cx - ts / 2, ty - ts / 2, ts, ts);
    text('가스트의 눈물 획득!', cx, py + U * 66, U * 6, '#9ff6ff');
    text('진행요원에게 가스트의 눈물을 받아가세요', cx, py + U * 73, U * 3.4, '#ffffff');
  } else {
    text('아쉬워요!', cx, py + U * 53, U * 7, '#ff8a7a');
    text(`${settings.rewardScore}점 이상이면 가스트의 눈물을 받을 수 있어요`, cx, py + U * 63, U * 3.6, '#ffffff');
  }

  const ready = game.resultTime > RESULT_LOCK; // 계속 쏘던 총알이 실수로 버튼을 누르지 않게 잠깐 잠금
  const by = py + ph - U * 8;
  button('다음 사람', cx - U * 33, by, U * 29, U * 9, nextPlayer, ready, true);
  button('다시 하기', cx, by, U * 29, U * 9, () => startGame(), ready);
  button('랭킹', cx + U * 33, by, U * 29, U * 9, openRanking, ready);
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

// ---------- 매 프레임 ----------
function update(dt) {
  Guns.poll(); // 게임패드로 연결된 총의 조준·방아쇠 읽기
  updateEmbers(dt);

  if (game.state === 'title') {
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
  if (game.state === 'result') game.resultTime += dt;

  updateParts(dt);
  shake = Math.max(0, shake - dt * U * 8);
  flash.a = Math.max(0, flash.a - dt * 1.8);
  if (banner) { banner.t += dt; if (banner.t >= banner.dur) banner = null; }
}

function draw(time) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
  buttons = [];

  // 흔들림은 게임 세계에만 적용
  ctx.save();
  if (shake > 0) ctx.translate(rand(-1, 1) * shake, rand(-1, 1) * shake);
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
  if (game.state === 'countdown') { drawHUD(time); drawCountdown(); }
  if (game.state === 'play') drawHUD(time);
  if (game.state === 'result') drawResult(time);
  if (game.state === 'ranking') drawRanking(time);
  if (game.state === 'aimtest') drawAimTest();
  if (game.state === 'gunsetup') drawGunSetup();
  drawBanner();

  if (game.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    text('일시정지', W / 2, H * 0.45, U * 12, '#ffffff');
    text('P 또는 Space 를 누르면 계속합니다  ·  Q 를 누르면 처음 화면으로', W / 2, H * 0.45 + U * 11, U * 4, '#ffd9b0');
  }

  // 조준점은 게임 중(+총 조준 테스트)에만 그린다.
  // 처음 화면·랭킹·결과 화면에서는 버튼을 누르기 쉽게 보통 마우스 커서를 보여 준다.
  const inGame = (game.state === 'play' || game.state === 'countdown') && !game.paused;
  const showBig = (inGame && settings.aimMode === 'big') || game.state === 'aimtest';
  const hideCursor = showBig || (inGame && settings.aimMode === 'hidden');
  const cursor = hideCursor ? 'none' : inGame ? 'crosshair' : 'default';
  if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  // 2인 대결에서는 마우스 조준점 대신 총마다 색이 다른 조준점을 그린다
  const mouseAim = showBig && aim.seen && game.state !== 'aimtest' && !(game.mode === 'versus' && inGame && Guns.active());
  if (mouseAim) drawAim(aim.x, aim.y);
  // 게임패드로 연결된 총의 조준점 (메뉴에서도 보여야 총으로 버튼을 고를 수 있다)
  Guns.draw(time);
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
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw(now / 1000);
  requestAnimationFrame(frame);
}

// ---------- 시작 ----------
window.addEventListener('resize', resize);
resize();
loadImages()
  .then(() => {
    buildGhastVariants();
    goTitle();
    requestAnimationFrame(frame);
    loadLocalAdminKey();
  })
  .catch((err) => {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`오류: ${err.message} (assets 폴더를 확인하세요)`, 20, 40);
  });
