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
  bonusScore: 20,      // 이 점수마다 (20, 40, 60 …)
  bonusSeconds: 8,     // 이만큼 시간 추가
  rewardScore: 30,     // 이 점수 이상이면 가스트의 눈물(밀키스)
  killPoints: 2,       // 가스트 처치
  deflectPoints: 1,    // 날아오는 화염구 맞히기
  hitPenalty: 1,       // 화염구에 맞으면 감점
  missPenalty: 1,      // 배경(빈 곳)을 맞히면 감점
  difficulty: 1,       // 0.5 쉬움 ~ 2 어려움
  hitPadding: 15,      // 가스트 판정 범위를 몇 % 넓힐지
  ghastScale: 100,     // 가스트 크기 (%)
  volume: 0.8,
  debounceMs: 80,      // 센서가 한 번의 충격을 여러 번 보내는 것을 무시
  showTouches: true,   // 터치(탄착) 위치를 화면에 표시
};
// 기본 규칙이 바뀌면 이름 뒤 숫자를 올려 예전에 저장된 설정을 무시한다
const SETTINGS_KEY = 'ghast-shooting-settings-v2';
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
  GV.normal = IMG.ghast;
  GV.charge = make((g) => {
    // 눈을 크게 뜨고 빨간 눈동자
    parallelogram(g, 34, 190, 72, 207, 16, '#262626');
    parallelogram(g, 116, 231, 158, 249, 15, '#262626');
    parallelogram(g, 45, 198, 61, 205, 8, '#ff2418');
    parallelogram(g, 130, 239, 146, 246, 8, '#ff2418');
    // 입을 크게 벌림
    parallelogram(g, 72, 312, 118, 333, 34, '#1b1b1b');
    parallelogram(g, 85, 326, 105, 335, 16, '#ff2418');
  });
  GV.hurt = make((g) => {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255, 30, 30, 0.6)';
    g.fillRect(0, 0, GHAST_W, GHAST_H);
  });
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
// 시간이 지날수록 가스트가 많아지고 빨리 쏜다
function difficulty() {
  const p = clamp(game.elapsed / Math.max(30, settings.gameSeconds), 0, 1);
  const d = clamp(settings.difficulty, 0.3, 3);
  return {
    spawnEvery: lerp(1.6, 0.8, p) / d,
    maxGhasts: Math.max(2, Math.round(lerp(3, 6, p) * Math.min(1.4, d))),
    floatMul: lerp(1, 0.6, p) / d,
    chargeTime: lerp(1.4, 0.9, p) / Math.sqrt(d),
    flightTime: lerp(1.7, 1.15, p) / Math.sqrt(d),
    speed: lerp(0.8, 1.3, p) * Math.sqrt(d),
  };
}

// ---------- 가스트 ----------
class Ghast {
  constructor(demo) {
    this.demo = demo;                 // 처음 화면에서 떠다니기만 하는 가스트
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
    this.chargeDur = difficulty().chargeTime;
    this.dead = false;
  }
  get w() { return U * 24 * this.z * (settings.ghastScale / 100); }
  get h() { return this.w * GHAST_H / GHAST_W; }
  center() { return { x: this.x, y: this.y + Math.sin(this.bob) * U * 1.2 }; }

  pickTarget() {
    const w = this.w, h = this.h;
    this.tx = rand(w / 2 + U * 2, W - w / 2 - U * 2);
    this.ty = rand(h / 2 + U * 16, Math.max(h / 2 + U * 16, groundY - h * 0.45));
    this.retarget = rand(1.5, 3);
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

    // 목표 지점으로 둥실둥실 이동
    let speed = 0.8 * D.speed;
    if (this.state === 'charge') speed *= 0.2;
    if (this.state === 'leave') speed = 1.4;
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
          this.state = 'charge'; this.t = 0; this.chargeDur = D.chargeTime;
          Sound.charge();
        }
        break;
      case 'charge':
        if (this.t >= this.chargeDur) {
          const m = this.mouth();
          fireballs.push(new Fireball(m.x, m.y, this.w * 0.42, D.flightTime));
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
        if (this.x < -this.w || this.x > W + this.w) this.dead = true;
        break;
      case 'dying':
        if (this.t >= 0.18) { burstGhast(this); Sound.pop(); this.dead = true; }
        break;
    }
  }
  leave() {
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
    ctx.globalAlpha = this.alpha;
    ctx.translate(x, y);
    const s = this.state === 'in' ? lerp(0.6, 1, this.alpha) : (this.state === 'dying' ? 1 + this.t * 0.8 : 1);
    ctx.scale(this.flip * s, s);
    const img = this.state === 'dying' ? GV.hurt : this.state === 'charge' ? GV.charge : GV.normal;
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
  rewardShown: false,
  resultTime: 0,
  stats: null,
  lastTick: 0,
  player: '',           // 지금 플레이하는 사람의 닉네임
  rankInfo: null,       // 결과 화면의 순위 { status: 'saving'|'saved'|'error', rankToday, rankAll, local }
  lastEntryId: null,    // 방금 저장한 기록 (랭킹 화면에서 강조)
  rankFrom: 'title',    // 랭킹 화면을 닫으면 돌아갈 곳
  titleTop: [],         // 처음 화면에 보여줄 오늘의 TOP 3
};

// ---------- 랭킹 ----------
// serve.cjs 로 열었으면 서버 DB(data/ranking.db)에, index.html 을 바로 열었으면 이 브라우저에 저장한다.
const RANK_LOCAL_KEY = 'ghast-shooting-ranking';
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
const byRank = (a, b) => b.score - a.score || a.created_at - b.created_at;

const Ranking = {
  useServer: location.protocol.startsWith('http'),

  async request(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`서버 오류 ${res.status}`);
    return res.json();
  },
  readLocal() {
    try { return JSON.parse(localStorage.getItem(RANK_LOCAL_KEY) || '[]'); } catch { return []; }
  },
  writeLocal(list) {
    try { localStorage.setItem(RANK_LOCAL_KEY, JSON.stringify(list)); } catch { /* 저장 불가 */ }
  },

  // 기록 저장 → { id, rankToday, rankAll, local }
  async add(entry) {
    if (this.useServer) {
      try {
        return { ...(await this.request('POST', '/api/scores', { ...entry, since: todayStart() })), local: false };
      } catch (err) {
        console.warn('서버에 랭킹을 저장하지 못해 이 브라우저에 저장합니다', err);
      }
    }
    const list = this.readLocal();
    const row = { id: Date.now(), ...entry, created_at: Date.now() };
    list.push(row);
    this.writeLocal(list);
    const rankIn = (rows) => 1 + rows.filter((r) => r.score > row.score).length;
    return { id: row.id, rankToday: rankIn(list.filter((r) => r.created_at >= todayStart())), rankAll: rankIn(list), local: true };
  },
  // scope: 'today' | 'all'
  async top(scope, limit = 10) {
    const since = scope === 'today' ? todayStart() : 0;
    if (this.useServer) {
      try { return await this.request('GET', `/api/scores?since=${since}&limit=${limit}`); } catch (err) { console.warn(err); }
    }
    return this.readLocal().filter((r) => r.created_at >= since).sort(byRank).slice(0, limit);
  },
  async remove(id) {
    if (this.useServer) return this.request('DELETE', `/api/scores/${id}`);
    this.writeLocal(this.readLocal().filter((r) => r.id !== id));
  },
  async clear() {
    if (this.useServer) return this.request('DELETE', '/api/scores');
    this.writeLocal([]);
  },
};

function refreshTitleTop() {
  Ranking.top('today', 3).then((list) => { game.titleTop = list; }).catch(() => {});
}

// 랭킹 화면
const rankView = { scope: 'today', list: null, req: 0 };
function openRanking() {
  game.rankFrom = game.state === 'result' ? 'result' : 'title';
  game.state = 'ranking';
  setRankScope(rankView.scope);
  updateCornerButtons();
}
function setRankScope(scope) {
  rankView.scope = scope;
  rankView.list = null;
  const req = ++rankView.req;
  Ranking.top(scope, 10)
    .then((list) => { if (req === rankView.req) rankView.list = list; })
    .catch(() => { if (req === rankView.req) rankView.list = []; });
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
  // 나타날 때 연기 한 줌
  for (let i = 0; i < 10; i++) {
    addPart({
      x: g.x + rand(-0.4, 0.4) * g.w, y: g.y + rand(-0.4, 0.4) * g.h,
      vx: rand(-1, 1) * U * 4, vy: -U * rand(1, 4), drag: 2, size: rand(1.5, 3) * U,
      grow: U * 2, life: rand(0.4, 0.8), color: pick(['#5a2a2a', '#7a4a4a', '#3a1a1a']),
    });
  }
  if (!demo) Sound.spawn();
}

function goTitle() {
  game.state = 'title';
  game.paused = false;
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave());
  refreshTitleTop();
  updateCornerButtons();
}

function startGame() {
  Sound.init();
  game.state = 'countdown';
  game.countdown = 3;
  game.lastTick = 4;
  game.paused = false;
  game.score = 0;
  game.timeLeft = settings.gameSeconds;
  game.elapsed = 0;
  game.spawnTimer = 0;
  game.nextBonus = settings.bonusScore;
  game.bonusCount = 0;
  game.rewardShown = false;
  game.stats = { shots: 0, kills: 0, deflects: 0, hitsTaken: 0, misses: 0 };
  banner = null;
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave());
  updateCornerButtons();
}

function endGame() {
  game.state = 'result';
  game.resultTime = 0;
  game.timeLeft = 0;
  // 남은 화염구는 공중에서 터뜨림
  fireballs.forEach((f) => burstFire(f.x, f.y, 0.6));
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave());
  const win = game.score >= settings.rewardScore;
  Sound.end(win);
  updateCornerButtons();

  // 랭킹 저장
  game.rankInfo = { status: 'saving' };
  Ranking.add({ name: game.player || '이름없음', score: game.score, kills: game.stats.kills })
    .then((r) => { game.rankInfo = { status: 'saved', ...r }; game.lastEntryId = r.id; })
    .catch((err) => { console.error(err); game.rankInfo = { status: 'error' }; });
}

function addScore(n) {
  game.score = Math.max(0, game.score + n);
  if (!game.rewardShown && game.score >= settings.rewardScore) {
    game.rewardShown = true;
    Sound.reward();
    showBanner('가스트의 눈물 확보!', `${settings.rewardScore}점 달성`, '#9ff6ff');
  }
  // 20점, 40점, 60점 … 처음 넘을 때마다 시간 추가 (감점 후 다시 넘어도 같은 구간은 한 번만)
  if (settings.bonusSeconds > 0 && settings.bonusScore > 0 && game.score >= game.nextBonus) {
    const reached = game.nextBonus;
    while (game.score >= game.nextBonus) {
      game.timeLeft += settings.bonusSeconds;
      game.bonusCount++;
      game.nextBonus += settings.bonusScore;
    }
    Sound.bonus();
    showBanner(`보너스 타임 +${settings.bonusSeconds}초!`, `${reached}점 돌파`, '#ffe14a', 2);
    doFlash('#ffe14a', 0.25);
  }
}

// 화염구가 화면에 닿음 = 플레이어 피격
function playerHit(fb) {
  if (game.state !== 'play') return;
  game.stats.hitsTaken++;
  Sound.explode();
  burstFire(fb.x, fb.y, 1.4);
  shake = Math.max(shake, U * 2.5);
  doFlash('#ff2a10', 0.5);
  if (settings.hitPenalty > 0) {
    addScore(-settings.hitPenalty);
    popupScore(fb.x, fb.y - U * 6, `-${settings.hitPenalty}`, '#ff6a5a');
  }
}

// ---------- 입력 (센서 터치 / 마우스 / 펜) ----------
const recentTaps = [];
function isDuplicateTap(x, y, now) {
  // 프로젝터 센서는 한 번 맞은 것을 여러 번 보낼 수 있어 짧은 시간·가까운 위치는 무시
  while (recentTaps.length && now - recentTaps[0].t > 500) recentTaps.shift();
  const dup = recentTaps.some((p) => now - p.t < settings.debounceMs && Math.hypot(p.x - x, p.y - y) < U * 4);
  recentTaps.push({ x, y, t: now });
  return dup;
}

let buttons = [];
function onTap(x, y) {
  const now = performance.now();
  if (isDuplicateTap(x, y, now)) return;
  Sound.init();

  if (settings.showTouches) {
    addPart({ kind: 'ring', x, y, size: U * 1.5, grow: U * 18, life: 0.3, color: 'rgba(255,255,255,0.9)' });
    addPart({ kind: 'cross', x, y, size: U * 1.6, life: 0.35, color: '#ffffff' });
  }

  if (game.state === 'title' || game.state === 'result' || game.state === 'ranking') {
    for (const b of buttons) {
      if (b.enabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.action(); return; }
    }
    if (game.state === 'ranking') return;
    // 처음 화면의 가스트는 연습용으로 맞힐 수 있다 (점수 없음)
    const g = [...ghasts].sort((a, b) => b.z - a.z).find((o) => o.hittable() && o.hitTest(x, y));
    if (g) { g.kill(); Sound.hit(); }
    return;
  }
  if (game.state !== 'play' || game.paused) return;

  game.stats.shots++;

  // 1) 가장 가까이 날아온 화염구부터
  const fb = [...fireballs].sort((a, b) => b.p - a.p).find((f) => !f.dead && f.hitTest(x, y));
  if (fb) {
    fb.dead = true;
    game.stats.deflects++;
    Sound.deflect();
    burstFire(fb.x, fb.y, 0.7);
    shake = Math.max(shake, U * 0.6);
    if (settings.deflectPoints > 0) popupScore(fb.x, fb.y - U * 4, `+${settings.deflectPoints} 반사!`, '#ffd25a');
    addScore(settings.deflectPoints);
    return;
  }

  // 2) 가까운(큰) 가스트부터
  const g = [...ghasts].sort((a, b) => b.z - a.z).find((o) => o.hittable() && o.hitTest(x, y));
  if (g) {
    const charging = g.state === 'charge';
    g.kill();
    game.stats.kills++;
    Sound.hit();
    shake = Math.max(shake, U * 0.8);
    doFlash('#ffffff', 0.12);
    const c = g.center();
    popupScore(c.x + g.w * 0.3, c.y - g.h * 0.5, `+${settings.killPoints}`, charging ? '#ffd25a' : '#7dff6a');
    addScore(settings.killPoints);
    return;
  }

  // 3) 빗나감 (배경을 맞힘) → 감점
  game.stats.misses++;
  Sound.miss();
  for (let i = 0; i < 6; i++) {
    addPart({ x, y, vx: rand(-1, 1) * U * 8, vy: rand(-1, 0.3) * U * 8, g: U * 40, size: U * 0.6, life: 0.4, color: '#bbbbbb' });
  }
  if (settings.missPenalty > 0) {
    popupScore(x, y - U * 4, `-${settings.missPenalty}`, '#ff6a5a');
    addScore(-settings.missPenalty);
  }
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  onTap(e.clientX, e.clientY);
});
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
  switch (e.code) {
    case 'Space':
    case 'Enter':
      e.preventDefault();
      if (game.state === 'title') openNameEntry();
      else if (game.state === 'result' && game.resultTime > 1.5) nextPlayer();
      else if (game.state === 'ranking') closeRanking();
      else if (game.state === 'play' && game.paused) game.paused = false;
      break;
    case 'KeyR':
      if (game.state === 'title' || (game.state === 'result' && game.resultTime > 1.5)) openRanking();
      else if (game.state === 'ranking') closeRanking();
      break;
    case 'KeyP':
      if (game.state === 'play') game.paused = !game.paused;
      break;
    case 'KeyQ':
    case 'Escape':
      if (game.state === 'ranking') closeRanking();
      else if (e.code === 'KeyQ') goTitle();
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
  document.getElementById('rank-where').textContent = Ranking.useServer
    ? '저장 위치: 서버 DB (ghast/data/ranking.db)'
    : '저장 위치: 이 브라우저 (serve.cjs 로 열면 DB 에 저장됩니다)';
  box.textContent = '불러오는 중…';
  let list = [];
  try { list = await Ranking.top('all', 100); } catch { box.textContent = '랭킹을 불러오지 못했습니다'; return; }
  box.textContent = '';
  if (!list.length) { box.textContent = '아직 기록이 없습니다'; return; }
  list.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'rank-row';
    const label = document.createElement('span');
    label.textContent = `${i + 1}. ${r.name} · ${r.score}점 · ${new Date(r.created_at).toLocaleString('ko-KR')}`;
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
const nameHint = document.getElementById('name-hint');
const nameOpen = () => !nameEl.hidden;
function openNameEntry() {
  Sound.init();
  if (game.state !== 'title') goTitle();
  nameInput.value = '';
  nameHint.textContent = '랭킹에 이 이름으로 기록돼요 (최대 12자)';
  nameHint.classList.remove('error');
  nameEl.hidden = false;
  setTimeout(() => nameInput.focus(), 0);
}
function closeNameEntry() { nameEl.hidden = true; }
nameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = cleanName(nameInput.value);
  if (!name) {
    nameHint.textContent = '닉네임을 입력해 주세요!';
    nameHint.classList.add('error');
    nameInput.focus();
    return;
  }
  game.player = name;
  closeNameEntry();
  startGame();
});
document.getElementById('name-cancel').addEventListener('click', closeNameEntry);
// 결과 화면 → 다음 사람 (닉네임 새로 입력)
function nextPlayer() { openNameEntry(); }
function closeSettings() { settingsEl.hidden = true; }
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const next = { ...settings };
  for (const k of Object.keys(DEFAULTS)) {
    const input = form.elements[k];
    if (!input) continue;
    if (input.type === 'checkbox') next[k] = input.checked;
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
function updateCornerButtons() {
  document.getElementById('corner-buttons').classList.toggle('hidden', game.state !== 'title' && game.state !== 'result');
}

// ---------- 글자·버튼 그리기 ----------
const FONT = '"Galmuri11", "Galmuri9", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
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
    [`가스트 처치 +${settings.killPoints}점   ·   날아오는 화염구 맞히기 +${settings.deflectPoints}점`, '#ffd9b0', 3.4],
    [`배경을 잘못 맞히면 -${settings.missPenalty}점   ·   화염구에 맞으면 -${settings.hitPenalty}점`, '#ff9a8a', 3.4],
    [`제한 시간 ${timeLabel(settings.gameSeconds)}   ·   ${settings.bonusScore}점마다 +${settings.bonusSeconds}초 보너스!`, '#ffe14a', 3.4],
    [`${settings.rewardScore}점 이상이면 '가스트의 눈물'을 드려요`, '#9ff6ff', 4],
    ['※ 화면만 쏘세요! 사람을 향해 쏘면 안 돼요', '#ff8a7a', 3.2],
  ];
  lines.forEach(([str, color, size], i) => text(str, cx, py + U * (6 + i * 6.6), U * size, color));
  // 가스트의 눈물 아이콘
  ctx.imageSmoothingEnabled = false;
  const ts = U * 6, ty = py + U * (6 + 4 * 6.6);
  ctx.drawImage(IMG.tear, cx - pw / 2 + U * 3, ty - ts / 2, ts, ts);
  ctx.drawImage(IMG.tear, cx + pw / 2 - U * 3 - ts, ty - ts / 2, ts, ts);

  button('게임 시작', cx - U * 13, H * 0.84, U * 46, U * 12, openNameEntry, true, true);
  button('랭킹', cx + U * 26, H * 0.84, U * 22, U * 12, openRanking);
  text('Space 시작 · R 랭킹 · F 전체화면 · S 설정 · M 소리', cx, H * 0.84 + U * 10, U * 2.6, '#c9a89a');

  // 오늘의 TOP 3
  if (game.titleTop.length) {
    const x = U * 4;
    let y = H - U * 4 - (game.titleTop.length - 1) * U * 4.6;
    text('오늘의 TOP 3', x, y - U * 5.5, U * 3.4, '#ffe14a', 'left');
    game.titleTop.forEach((r, i) => {
      text(`${i + 1}위  ${r.name}  ${r.score}점`, x, y, U * 3.2, MEDAL[i], 'left');
      y += U * 4.6;
    });
  }
}
const MEDAL = ['#ffd84a', '#d8d8e0', '#e09a5a'];

function drawRanking() {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const pw = Math.min(W - U * 8, U * 100);
  const ph = Math.min(H - U * 4, U * 100);
  const px = cx - pw / 2, py = (H - ph) / 2;
  panel(px, py, pw, ph, 0.88);

  text('랭킹 TOP 10', cx, py + U * 7, U * 7, '#ffcf5a', 'center', { shadow: '#a3200c' });
  button('오늘', cx - U * 13, py + U * 17, U * 22, U * 7, () => setRankScope('today'), true, rankView.scope === 'today');
  button('전체', cx + U * 13, py + U * 17, U * 22, U * 7, () => setRankScope('all'), true, rankView.scope === 'all');

  const colRank = px + U * 8, colName = px + U * 16, colKills = px + pw - U * 26, colScore = px + pw - U * 6;
  const headY = py + U * 26;
  text('순위', colRank, headY, U * 2.8, '#c9a89a');
  text('닉네임', colName, headY, U * 2.8, '#c9a89a', 'left');
  text('처치', colKills, headY, U * 2.8, '#c9a89a');
  text('점수', colScore, headY, U * 2.8, '#c9a89a', 'right');

  const top = py + U * 31, bottom = py + ph - U * 13;
  const rowH = Math.min(U * 6.4, (bottom - top) / 10);
  const list = rankView.list;
  if (!list) {
    text('불러오는 중…', cx, top + rowH * 3, U * 4, '#ffffff');
  } else if (!list.length) {
    text(rankView.scope === 'today' ? '오늘은 아직 기록이 없어요' : '아직 기록이 없어요', cx, top + rowH * 3, U * 4, '#ffffff');
  } else {
    list.forEach((r, i) => {
      const y = top + rowH * (i + 0.5);
      if (r.id === game.lastEntryId) {
        ctx.fillStyle = 'rgba(255, 225, 74, 0.2)';
        ctx.fillRect(px + U * 3, y - rowH / 2, pw - U * 6, rowH);
      }
      const color = MEDAL[i] || '#ffffff';
      const size = Math.min(U * 3.8, rowH * 0.62);
      text(`${i + 1}`, colRank, y, size, color);
      text(r.name, colName, y, size, color, 'left');
      text(String(r.kills ?? 0), colKills, y, size * 0.85, '#ffd9b0');
      text(`${r.score}점`, colScore, y, size, color, 'right');
    });
  }
  button('돌아가기', cx, py + ph - U * 7, U * 36, U * 8, closeRanking);
}

function drawHUD(time) {
  // 점수
  panel(U * 2.5, U * 2.5, U * 40, U * 13, 0.6);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(IMG.tear, U * 4.5, U * 4.5, U * 9, U * 9);
  text('점수', U * 16, U * 6, U * 3, '#ffd9b0', 'left');
  text(String(game.score), U * 16, U * 11.2, U * 7, '#ffffff', 'left');

  // 남은 시간
  const danger = game.timeLeft <= 10;
  const pulse = danger ? 1 + 0.1 * Math.max(0, Math.sin(time * 12)) : 1;
  ctx.save();
  ctx.translate(W / 2, U * 9);
  ctx.scale(pulse, pulse);
  text(formatTime(game.timeLeft), 0, 0, U * 10, danger ? '#ff5a4a' : '#ffffff');
  ctx.restore();

  // 목표 진행 막대: 가스트의 눈물 점수 / 다음 보너스 점수 표시
  const bonusOn = settings.bonusSeconds > 0 && settings.bonusScore > 0;
  const bw = U * 52, bh = U * 3.4, bx = W - bw - U * 5, by = U * 9;
  const max = Math.max(settings.rewardScore, bonusOn ? game.nextBonus : 0, game.score, 1) * 1.15;
  panel(bx - U * 2.5, U * 2.5, bw + U * 5, U * 13, 0.6);
  ctx.fillStyle = '#2a1010';
  ctx.fillRect(bx, by, bw, bh);
  const fill = clamp(game.score / max, 0, 1);
  ctx.fillStyle = game.score >= settings.rewardScore ? '#7de3ff' : '#ff7a3a';
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

function drawResult(time) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, pw = Math.min(W - U * 8, U * 110), ph = U * 92;
  const py = Math.max(U * 2, (H - ph) / 2);
  panel(cx - pw / 2, py, pw, ph, 0.82);
  const win = game.score >= settings.rewardScore;
  const st = game.stats;
  text(`${game.player || '이름없음'} 님 · 미션 종료!`, cx, py + U * 7, U * 6.5, '#ffcf5a');
  text(`${game.score}점`, cx, py + U * 20, U * 15, '#ffffff', 'center', { shadow: '#a3200c' });
  const acc = st.shots ? Math.round(((st.kills + st.deflects) / st.shots) * 100) : 0;
  text(`처치 ${st.kills}  ·  반사 ${st.deflects}  ·  빗나감 ${st.misses}  ·  피격 ${st.hitsTaken}  ·  명중률 ${acc}%  ·  보너스 ${game.bonusCount}회`, cx, py + U * 31, U * 3.2, '#ffd9b0');

  // 순위
  const ri = game.rankInfo;
  let rankLine = '';
  if (ri?.status === 'saving') rankLine = '랭킹 저장 중…';
  else if (ri?.status === 'error') rankLine = '랭킹 저장에 실패했어요';
  else if (ri?.status === 'saved') rankLine = `오늘 ${ri.rankToday}위  ·  전체 ${ri.rankAll}위${ri.local ? '  (이 브라우저에만 저장됨)' : ''}`;
  text(rankLine, cx, py + U * 38, U * 4.4, ri?.status === 'error' ? '#ff8a7a' : '#ffe14a');

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

  const ready = game.resultTime > 1.5; // 남은 총알이 실수로 버튼을 누르지 않게 잠깐 잠금
  const by = py + ph - U * 8;
  button('다음 사람', cx - U * 33, by, U * 29, U * 9, nextPlayer, ready, true);
  button('다시 하기', cx, by, U * 29, U * 9, startGame, ready);
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
  if (game.state === 'ranking') drawRanking();
  drawBanner();

  if (game.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    text('일시정지', W / 2, H * 0.45, U * 12, '#ffffff');
    text('P 또는 Space 를 누르면 계속합니다', W / 2, H * 0.45 + U * 11, U * 4, '#ffd9b0');
  }
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
  })
  .catch((err) => {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`오류: ${err.message} (assets 폴더를 확인하세요)`, 20, 40);
  });
