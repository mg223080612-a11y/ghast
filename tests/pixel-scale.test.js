// 픽셀 크기 계산(pixel-scale.js) 테스트 — 실행: npm test
//   그린 가스트(칠해진 칸)가 언제나 판정 상자 안에 들어가는지, 모든 종류가 같은 칸 크기 P 로 그려지는지 확인한다.
//   판정 상자 식은 game-ghasts.js 원본 코드에서 그대로인지 글자로 확인한다 (랭킹 서버 규칙이 v2 와 같아야 해서).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PS = require('../pixel-scale.js');
const Art = require('../ghast-art.js');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const ghastsSrc = read('game-ghasts.js');
const gameSrc = read('game.js');

// 판정·크기에 쓰는 원본 식 (한 글자라도 바뀌면 실패 → 랭킹 규칙이 바뀌지 않았는지 지킨다)
const PINNED = [
  [ghastsSrc, 'get w() { return U * 24 * this.z * this.T.size * (ghastScaleNow() / 100); }'],
  [ghastsSrc, 'get h() { return this.w * GHAST_H / GHAST_W; }'],
  [ghastsSrc, 'center() { return { x: this.x, y: this.y + Math.sin(this.bob) * U * 1.2 }; }'],
  [ghastsSrc, 'this.z = rand(0.82, 0.98);'],
  [ghastsSrc, 'const pad = hitPaddingNow() / 100;'],
  [ghastsSrc, 'const hw = this.w * (0.5 + pad), hh = this.h * (0.5 + pad);'],
  [ghastsSrc, 'return px >= x - hw && px <= x + hw && py >= y - hh && py <= y + hh;'],
  [ghastsSrc, 'x: c.x + (MOUTH.x / GHAST_W - 0.5) * this.w * this.flip,'],
  [ghastsSrc, 'y: c.y + (MOUTH.y / GHAST_H - 0.5) * this.h,'],
  [ghastsSrc, 'const ghastScaleNow = () => settings.ghastScale * rules().size;'],
  [ghastsSrc, 'const hitPaddingNow = () => Math.max(0, settings.hitPadding + rules().padding);'],
  [gameSrc, 'const GHAST_W = 440, GHAST_H = 554;'],
  [gameSrc, 'U = Math.min(W, H * 1.6) / 160;'],
];

test('판정 상자·크기 식은 예전 그대로이고, pixel-scale.js 의 값과 같다', () => {
  for (const [src, line] of PINNED) assert.ok(src.includes(line), `원본 식이 바뀜: ${line}`);
  assert.equal(PS.GHAST_UNITS, 24);
  assert.equal(PS.GHAST_RATIO, 554 / 440);
  assert.equal(PS.Z_MIN, 0.82);
  assert.equal(PS.Z_MAX, 0.98);
});

// game-ghasts.js · game.js 에서 읽은 값
const TYPE_SIZE = Object.fromEntries([...ghastsSrc.matchAll(/^\s+(\w+): \{ name: '[^']+', size: ([\d.]+)/gm)].map((m) => [m[1], Number(m[2])]));
const DIFFS = Object.fromEntries([...ghastsSrc.matchAll(/^\s+(easy|normal|hard): \{\s*\n\s*label:[^\n]*\n\s*speed: [\d.]+, size: ([\d.]+), padding: (-?\d+)/gm)].map((m) => [m[1], { size: Number(m[2]), padding: Number(m[3]) }]));
const DEFAULT_PADDING = Number((/hitPadding: (\d+),/.exec(gameSrc) || [])[1]);
const SCREENS = [[1280, 720], [1366, 768], [1920, 1080], [3840, 2160]];
const uOf = (W, H) => Math.min(W, H * 1.6) / 160;
const types = () => Art.TYPES.map((type) => ({ type, size: TYPE_SIZE[type], ...Art.gridSize(type), box: Art.visibleBox(type), ref: type === 'normal' }));
// 게임의 pixelP() 와 같은 계산
function texelFor(W, H, diff, hitPadding, ghastScale = 100) {
  const d = DIFFS[diff];
  return PS.pickTexel({ U: uOf(W, H), scalePct: ghastScale * d.size, padPct: Math.max(0, hitPadding + d.padding), types: types() });
}

test('원본에서 종류 크기 5개·난이도 3개·기본 판정 여유를 읽었다', () => {
  assert.deepEqual(Object.keys(TYPE_SIZE).sort(), [...Art.TYPES].sort());
  assert.deepEqual(DIFFS, { easy: { size: 1.2, padding: 10 }, normal: { size: 1, padding: 0 }, hard: { size: 0.85, padding: -5 } });
  assert.equal(DEFAULT_PADDING, 15);
});

test('칠해진 가스트 그림은 언제나 판정 상자 안 (화면 4가지 × 난이도 × 판정 여유 15·0 × 종류 × z × 좌우 × 반 픽셀 자리 × 충전 떨림)', () => {
  let checked = 0;
  for (const [W, H] of SCREENS) {
    const U = uOf(W, H);
    for (const diff of Object.keys(DIFFS)) {
      for (const hitPadding of [DEFAULT_PADDING, 0]) {
        const d = DIFFS[diff];
        const padPct = Math.max(0, hitPadding + d.padding);
        const P = texelFor(W, H, diff, hitPadding);
        for (const t of types()) {
          for (let z = PS.Z_MIN; z <= PS.Z_MAX + 1e-9; z += 0.02) {
            const { w, h } = PS.hitSize({ U, z, size: t.size, scalePct: 100 * d.size });
            const { hw, hh } = PS.hitHalf({ w, h, padPct });
            const shake = PS.shakeCells({ P, hw, cols: t.cols, box: t.box });
            for (const flip of [1, -1]) {
              for (const fx of [0, 0.25, 0.5, 0.75]) {
                for (const jx of [0, shake * P, -shake * P]) {
                  const cx = 500 + fx, cy = 300 + (1 - fx);
                  const at = PS.placeSprite({ cx, cy, P, cols: t.cols, rows: t.rows, jx });
                  const v = PS.visibleRect(at, t.box, P, flip);
                  const where = `${W}×${H} ${diff} 여유${hitPadding} ${t.type} z=${z.toFixed(2)} P=${P} flip=${flip} jx=${jx}`;
                  assert.ok(v.left >= cx - hw && v.right <= cx + hw, `${where}: 가로 ${v.left}~${v.right} ⊄ ${(cx - hw).toFixed(1)}~${(cx + hw).toFixed(1)}`);
                  assert.ok(v.top >= cy - hh && v.bottom <= cy + hh, `${where}: 세로 ${v.top}~${v.bottom} ⊄ ${(cy - hh).toFixed(1)}~${(cy + hh).toFixed(1)}`);
                  if (padPct === 0) assert.ok(v.right - v.left <= w && v.bottom - v.top <= h, `${where}: 여유 0 인데 그림이 판정보다 큼`);
                  checked++;
                }
              }
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 10000, `확인한 경우 ${checked}`);
});

test('한 화면에서 모든 종류가 같은 칸 크기 P 로 그려지고, 그린 크기 비율은 종류 크기 비율과 같다 (±1칸)', () => {
  for (const [W, H] of SCREENS) {
    for (const diff of Object.keys(DIFFS)) {
      const P = texelFor(W, H, diff, DEFAULT_PADDING);
      assert.ok(Number.isInteger(P) && P >= 1);
      const normal = Art.gridSize('normal').cols * P;
      for (const t of types()) {
        const at = PS.placeSprite({ cx: 100.4, cy: 80.6, P, cols: t.cols, rows: t.rows });
        assert.equal(at.w, t.cols * P);
        assert.equal(at.h, t.rows * P);
        assert.ok(Number.isInteger(at.x) && Number.isInteger(at.y), '그리는 자리는 정수 px');
        assert.ok(Math.abs(at.w - normal * t.size) <= P, `${t.type} ${at.w} vs ${normal * t.size}`);
      }
    }
  }
});

test('P 는 보통 가스트의 평균 판정 폭에 맞춘다 (기본 설정: 720p 4 · 1080p 6 · 4K 12), 판정 여유 0 인 Hard 에서도 720p 3 이상', () => {
  assert.equal(texelFor(1280, 720, 'normal', DEFAULT_PADDING), 4);
  assert.equal(texelFor(1920, 1080, 'normal', DEFAULT_PADDING), 6);
  assert.equal(texelFor(3840, 2160, 'normal', DEFAULT_PADDING), 12);
  for (const [W, H] of SCREENS) for (const diff of Object.keys(DIFFS)) for (const pad of [DEFAULT_PADDING, 0]) {
    assert.ok(texelFor(W, H, diff, pad) >= 3, `${W}×${H} ${diff} 여유${pad}`);
  }
  // 가스트 크기 설정을 키우면 칸도 커진다
  assert.ok(texelFor(1280, 720, 'normal', DEFAULT_PADDING, 200) > texelFor(1280, 720, 'normal', DEFAULT_PADDING, 100));
});

test('충전 떨림은 0 또는 1칸, 판정 상자 여유가 한 칸보다 작으면 떨지 않는다', () => {
  const box = { x0: 1, x1: 39, y0: 0, y1: 50 };
  assert.equal(PS.shakeCells({ P: 4, hw: 19 * 4 + 0.5 + 3.9, cols: 40, box }), 0);
  assert.equal(PS.shakeCells({ P: 4, hw: 19 * 4 + 0.5 + 4, cols: 40, box }), 1);
  assert.equal(PS.shakeCells({ P: 4, hw: 500, cols: 40, box }), 1);
});

test('화염구 칸 수는 짝수이고 최소값 이상, px 크기에 가장 가까운 칸', () => {
  for (const P of [2, 3, 4, 6, 12]) {
    for (let px = 0; px < 900; px += 7) {
      const n = PS.evenCells(px, P, 4);
      assert.equal(n % 2, 0);
      assert.ok(n >= 4);
      if (px > 6 * P) assert.ok(Math.abs(n * P - px) <= P, `P=${P} px=${px} → ${n}`);
    }
  }
});
