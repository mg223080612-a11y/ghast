// 가스트 사격 — 효과·난이도·가스트·화염구·게임 상태 (흔들림·번쩍임·알림, 난이도, Ghast·Fireball, game)
// game.js 에서 기능별로 나눈 조각. index.html 이 game.js 다음에 차례로 불러오며, 이름(함수·변수)을 모두 함께 쓴다.
'use strict';
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
  const p = clamp(game.elapsed / Math.max(30, game.baseSeconds || settings.gameSeconds), 0, 1);
  const d = clamp(settings.difficulty * rules().speed, 0.3, 3);
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
// size·speed: 기본 가스트 대비 배수 / points: 처치 점수 (맞히기 어려울수록 높게) / img: 그림(GV) 이름 — 종류마다 모양이 다르다
const GHAST_TYPES = {
  normal: { name: '가스트', size: 1, speed: 1, img: 'normal', points: () => settings.killPoints },
  small: { name: '아기 가스트', size: 0.6, speed: 1.5, img: 'small', points: () => settings.killPoints + 2 },
  big: { name: '큰 가스트', size: 1.35, speed: 0.7, img: 'big', points: () => Math.max(1, settings.killPoints - 1) },
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

// ---------- 난이도 (Easy · Normal · Hard) ----------
// Normal 은 설정 창의 값을 그대로 쓰고, Easy·Hard 는 그 값에 배율을 곱한다
// (운영자가 설정을 바꾸면 세 난이도가 함께 따라 바뀐다). game: 랭킹 서버에서 난이도마다 따로 쓰는 이름
const DIFFICULTIES = {
  easy: {
    label: 'Easy', color: '#9fe870', game: 'ghasteasy', rewardKey: 'rewardScoreEasy',
    speed: 0.7, size: 1.2, padding: 10,          // 느리고, 크고, 판정이 넉넉하게
    penalty: { miss: 1, escape: 1, hit: 1 },      // 감점은 Normal 과 같다
    odds: [                                       // 분노 가스트가 늦게, 적게
      { normal: 85, big: 15 },
      { normal: 65, small: 10, big: 20, gold: 5 },
      { normal: 50, small: 15, big: 20, angry: 10, gold: 5 },
      { normal: 40, small: 15, big: 20, angry: 20, gold: 5 },
    ],
  },
  normal: {
    label: 'Normal', color: '#ffe14a', game: 'ghast', rewardKey: 'rewardScore',
    speed: 1, size: 1, padding: 0,
    penalty: { miss: 1, escape: 1, hit: 1 },
    odds: GHAST_ODDS,
  },
  hard: {
    label: 'Hard', color: '#ff6a5a', game: 'ghasthard', rewardKey: 'rewardScoreHard',
    speed: 1.35, size: 0.85, padding: -5,        // 빠르고, 작고, 판정이 빡빡하게
    penalty: { miss: 2, escape: 2, hit: 2 },      // 감점 두 배
    odds: [                                       // 1레벨부터 아기·분노 가스트가 많이
      { normal: 45, small: 25, big: 5, angry: 20, gold: 5 },
      { normal: 30, small: 25, big: 10, angry: 30, gold: 5 },
      { normal: 15, small: 25, big: 10, angry: 45, gold: 5 },
      { normal: 10, small: 25, big: 10, angry: 50, gold: 5 },
    ],
  },
};
const DIFF_KEYS = Object.keys(DIFFICULTIES);
const diffKeyOf = (key) => (DIFFICULTIES[key] ? key : 'normal');
// 지금 판의 난이도 규칙 (처음 화면에서는 고른 난이도)
const rules = () => DIFFICULTIES[diffKeyOf(game.diff)];
// 감점: 'miss' 빈 곳 · 'escape' 놓침 · 'hit' 화염구 피격
const penaltyOf = (kind) => Math.round(settings[`${kind}Penalty`] * rules().penalty[kind]);
const rewardScoreNow = () => settings[rules().rewardKey] ?? settings.rewardScore;
// 상품: 판 도중 한 번이라도 기준을 넘었으면(rewardShown) 끝 점수가 내려가도 받는다 (보너스 시간에 감점으로 잃는 일 없게)
const gotReward = (p) => !!p && (p.rewardShown || p.score >= rewardScoreNow());
const ghastScaleNow = () => settings.ghastScale * rules().size;
const hitPaddingNow = () => Math.max(0, settings.hitPadding + rules().padding);
// 토너먼트는 경기 시간이 늘 같게 보너스 시간이 없다 (레벨 UP 은 그대로)
const bonusSecondsNow = () => (game.mode === 'tournament' ? 0 : settings.bonusSeconds);

function pickGhastType(level) {
  const table = rules().odds;
  const odds = table[Math.min(level, table.length) - 1];
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

    // 클수록 가까이(크게) 보임. 폭을 좁혀서 가까운 작은 가스트가 먼 보통 가스트만큼 커 보이지 않게 (종류가 크기로 구별됨)
    this.z = rand(0.82, 0.98);        // 클수록 가까이(크게). 범위를 좁혀 아기<보통<큰 가스트 크기가 겹치지 않게 (평균 0.90 은 예전과 같음)
    this.flip = 1;
    this.x = W / 2; this.y = H / 2;
    this.tx = this.x; this.ty = this.y;
    this.retarget = 0;
    this.bob = rand(0, Math.PI * 2);
    this.wiggle = rand(0, 3);         // 촉수 흔들림 박자 (가스트마다 다르게, 보이기만)
    this.state = 'in';
    this.t = 0;
    this.alpha = 0;
    this.shots = Math.random() < 0.2 ? 2 : 1; // 화염구를 두 번 쏘는 가스트 (예전 35% → 20%)
    this.floatDur = rand(1.4, 3.0) * difficulty().floatMul;
    if (T.noShoot) this.floatDur = rand(2.2, 3.2); // 황금 가스트는 잠깐 머물다 도망
    this.chargeDur = difficulty().chargeTime;
    this.speedMul = rand(0.85, 1.2);  // 가스트마다 빠르기가 조금씩 다름
    this.dead = false;
  }
  get T() { return GHAST_TYPES[this.type]; }
  get w() { return U * 24 * this.z * this.T.size * (ghastScaleNow() / 100); }
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
    const pad = hitPaddingNow() / 100;
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
        if (this.demo) this.updatePreview(dt);
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
          noteFireballLaunched();
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
        // 맞힌 뒤 아주 잠깐(0.05초)만 빨갛게 번쩍이고 바로 '팡!' — 쏜 순간 터지는 느낌이 나게
        if (this.t >= 0.05) { burstGhast(this); Sound.pop(); this.dead = true; }
        break;
    }
  }
  // 처음 화면의 가스트: 가끔 충전하는 모습만 보여 준다 (화염구는 쏘지 않음 — 위험 신호를 미리 알게)
  updatePreview(dt) {
    if (!this.preview) {
      if (Math.random() < dt * DEMO_PREVIEW_PER_SEC) this.preview = { t: 0, dur: rand(1.1, 1.5) };
      return;
    }
    this.preview = { ...this.preview, t: this.preview.t + dt };
    if (this.preview.t >= this.preview.dur) {
      const m = this.mouth();
      puff(m.x, m.y, this.w * 0.3, this.w * 0.3); // 피식 — 쏘지 않고 꺼짐
      this.preview = null;
    }
  }
  // 충전이 얼마나 됐는지 0 ~ 1 (충전 중이 아니면 -1). 처음 화면의 미리 보기 충전도 같은 모습으로 그린다
  chargeP() {
    if (this.state === 'charge') return clamp(this.t / this.chargeDur, 0, 1);
    if (this.preview && this.state === 'float') return clamp(this.preview.t / this.preview.dur, 0, 1);
    return -1;
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
    const p = this.chargeP();
    const charging = p >= 0;
    if (charging) x += rand(-1, 1) * U * 0.5 * p;
    if (this.state === 'dying') { x += rand(-1, 1) * U; y += rand(-1, 1) * U; }

    // 충전 중이면 뒤에 붉은 경고 빛 (효과 줄이기에서는 빠진다 → 아래 drawChargeCue 가 늘 보인다)
    if (charging) drawGlow(x, y, w * 0.9, '255,60,20', 0.35 * p);

    ctx.save();
    // 악랄 모드 Lv.4 의 분노 가스트는 깜빡여서 잘 안 보인다
    const flicker = this.fierce && this.type === 'angry' ? 0.55 + 0.45 * Math.abs(Math.sin(time * 2.5 + this.bob)) : 1;
    ctx.globalAlpha = this.alpha * flicker;
    // 픽셀 그림이 번지지 않게 그리는 자리·크기를 정수 px 로 맞춘다 (판정에 쓰는 w·h 값은 그대로)
    ctx.translate(Math.round(x), Math.round(y));
    const s = this.state === 'in' ? lerp(0.6, 1, this.alpha) : (this.state === 'dying' ? 1 + this.t * 0.8 : 1);
    const dw = Math.round(w * s), dh = Math.round(h * s);
    ctx.scale(this.flip, 1);
    const look = GV[this.T.img] || GV.normal;
    // 촉수 흔들림: 1초에 약 6번 그림을 바꾼다 (가스트마다 박자가 다르게)
    const f = Math.floor(time * GHAST_WIGGLE_FPS + this.wiggle) % look.frames.length;
    const img = this.state === 'dying' ? look.hurt : charging ? look.charge[f] : look.frames[f];
    ctx.drawImage(img, -Math.round(dw / 2), -Math.round(dh / 2), dw, dh);
    if (charging) {
      // 입 앞에서 화염구가 점점 커짐 (날아가는 화염구와 같은 그림·깜빡임)
      const fs = Math.max(1, Math.round(w * 0.42 * p * (0.92 + 0.08 * Math.sin(time * 40))));
      const mx = Math.round((MOUTH.x / GHAST_W - 0.5) * dw), my = Math.round((MOUTH.y / GHAST_H - 0.5) * dh);
      ctx.drawImage(fireballFrame(time, this.wiggle), mx - Math.round(fs / 2), my - Math.round(fs / 2), fs, fs);
    }
    ctx.restore();
    if (charging) drawChargeCue(x, y, w, h, p, time, this.alpha * flicker);
  }
}

// 가스트 촉수 흔들림 빠르기 (그림 바꾸는 횟수/초), 처음 화면 가스트가 충전 모습을 보여 주는 빈도 (1초에 이 확률)
const GHAST_WIGGLE_FPS = 6;
const DEMO_PREVIEW_PER_SEC = 0.1;

// 둥근 빛 번짐. 매 프레임 그라데이션을 새로 만들지 않고, 색마다 한 번 그린 그림을 늘려 쓴다
const glowCache = new Map();
function drawGlow(x, y, radius, rgb, alpha) {
  if (alpha <= 0.01 || radius <= 0 || settings.fewEffects) return;
  let img = glowCache.get(rgb);
  if (!img) {
    img = document.createElement('canvas');
    img.width = img.height = 128;
    const g = img.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.2, `rgba(${rgb},1)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    glowCache.set(rgb, img);
  }
  const prev = ctx.globalAlpha;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true; // 빛은 부드럽게 늘려야 계단이 안 생긴다
  ctx.globalAlpha = prev * clamp(alpha, 0, 1);
  ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = prev;
  ctx.imageSmoothingEnabled = smooth;
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
    this.flick = rand(0, 3);          // 불꽃 깜빡임 박자 (화염구마다 다르게, 보이기만)
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
  // 돌리지 않고 3장 깜빡임으로 불꽃이 일렁인다. 자리·크기는 정수 px (픽셀 그림이 번지지 않게)
  draw(time) {
    const s = Math.round(this.size);
    const x = Math.round(this.x), y = Math.round(this.y);
    drawGlow(x, y, s, '255,150,40', 0.45);
    ctx.drawImage(fireballFrame(time, this.flick), x - Math.round(s / 2), y - Math.round(s / 2), s, s);
  }
}
// 화염구 그림 3장 중 지금 것 (1초에 FIREBALL_FPS 장)
const FIREBALL_FPS = 9;
const fireballFrame = (time, phase = 0) => IMG.fireballFrames[Math.floor(time * FIREBALL_FPS + phase) % IMG.fireballFrames.length];

// ---------- 게임 상태 ----------
let ghasts = [];
let fireballs = [];
const game = {
  state: 'loading',     // loading → title → countdown → play → result
  paused: false,
  pauseNote: null, // 저절로 멈춘 까닭 { title, sub } (2인 경기 중 총이 빠졌을 때)
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
  mode: 'solo',         // 'solo' 1인 기록전(랭킹 저장) / 'versus' 2인 대결(랭킹 없음) / 'tournament' 토너먼트 한 경기
  diff: 'normal',       // 이번 판 난이도 (DIFFICULTIES 의 키)
  baseSeconds: 0,       // 이번 판 시작 시간 (토너먼트는 대진표에 정한 경기 시간)
  overtime: 0,          // 토너먼트 연장전 횟수
  timeUp: null,         // 시간이 다 돼 'TIME UP!' 을 보여 주는 중 { t } (game-fx.js) — 이때는 쏴도 점수 변화 없음
  players: [],          // [{ name, score, rewardShown, stats }] — 1인은 1명, 2인 대결은 2명
  rankInfo: null,       // 결과 화면의 순위 { status: 'saving'|'saved'|'error', rankToday, rankAll, local }
  lastEntryId: null,    // 방금 저장한 기록 (랭킹 화면에서 강조)
  rankFrom: 'title',    // 랭킹 화면을 닫으면 돌아갈 곳
  titleTop: [],         // 처음 화면에 흘러가는 오늘의 TOP 10
};

