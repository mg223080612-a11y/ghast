// 네더 배경(nether-bg.js) 테스트 — 실행: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const N = require('../nether-bg.js');

const lum = (hex) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const digest = (data) => crypto.createHash('sha1').update(Buffer.from(data.buffer)).digest('hex');
const SIZE = { tw: 320, th: 180, groundRow: 148 }; // 1280×720, P = 4

test('네더랙 타일은 손으로 그린 8×8 6가지(서로 다름), 발광석 타일은 8×8', () => {
  assert.equal(N.ROCK_TILES.length, 6);
  for (const tile of N.ROCK_TILES) {
    assert.equal(tile.length, N.TILE);
    for (const row of tile) assert.match(row, /^[0-4]{8}$/);
    assert.ok(tile.join('').includes('0') || tile.join('').includes('4'), '금(0)이나 혹(4) 같은 뚜렷한 모양이 있어야 함');
  }
  assert.equal(new Set(N.ROCK_TILES.map((t) => t.join(''))).size, 6);
  assert.equal(N.GLOW_TILE.length, N.TILE);
  for (const row of N.GLOW_TILE) assert.match(row, /^[0-3]{8}$/);
});

test('타일 고르기는 씨앗으로 정해진다: 같은 자리는 늘 같고, 넓은 곳에는 6가지가 고루 깔린다', () => {
  const counts = Array(6).fill(0);
  for (let row = 0; row < 24; row++) {
    for (let col = 0; col < 40; col++) {
      const a = N.rockTile(col, row, 'far', 1), b = N.rockTile(col, row, 'far', 1);
      assert.deepEqual(a, b);
      counts[a.index]++;
    }
  }
  for (const n of counts) assert.ok(n > 0 && n / 960 < 0.3, `타일 분포 ${counts}`);
  // 겹(far·near)마다 다르게 깔린다
  const diff = Array.from({ length: 50 }, (_, i) => N.rockTile(i, 3, 'far', 1).index !== N.rockTile(i, 3, 'near', 1).index).filter(Boolean).length;
  assert.ok(diff > 20, `겹마다 배치가 같음 (${diff}/50 만 다름)`);
});

test('배경 버퍼는 같은 화면·씨앗이면 한 픽셀도 다르지 않고, 씨앗이 다르면 달라진다', () => {
  const a = N.paint(N.layout(SIZE)), b = N.paint(N.layout(SIZE));
  assert.equal(a.length, SIZE.tw * SIZE.th * 4);
  assert.equal(digest(a), digest(b));
  for (let i = 3; i < a.length; i += 4) if (a[i] !== 255) assert.fail('투명한 텍셀이 있음');
  const c = N.paint(N.layout({ ...SIZE, seed: 7 }));
  assert.notEqual(digest(a), digest(c));
});

test('깊이: 먼 벽은 어둡고 대비가 낮고, 가까운 바닥은 밝고 대비가 크다 (먼 벽 < 기둥 < 바닥)', () => {
  const spread = (name) => lum(N.PALETTES[name][4]) - lum(N.PALETTES[name][0]);
  const mean = (name) => N.PALETTES[name].reduce((s, h) => s + lum(h), 0) / 5;
  assert.ok(spread('far') < spread('mid') && spread('mid') < spread('near'), '대비 순서');
  assert.ok(mean('far') < mean('mid') && mean('mid') < mean('near'), '밝기 순서');
});

test('배치: 기둥은 화면 한가운데(40~60%)를 비우고, 폭포·웅덩이·불은 화면 안, 바닥은 바닥 줄에서 시작', () => {
  const L = N.layout(SIZE);
  for (const p of L.pillars) assert.ok(p.x1 <= SIZE.tw * 0.4 || p.x0 >= SIZE.tw * 0.6, `기둥 ${p.x0}~${p.x1}`);
  assert.equal(L.falls.length, 2);
  for (const f of L.falls) {
    assert.ok(f.x >= 0 && f.x + f.w <= SIZE.tw && f.top < f.bottom && f.bottom <= SIZE.th);
  }
  assert.ok(L.pool.c0 < L.pool.c1 && L.pool.c1 * N.TILE <= SIZE.tw + N.TILE);
  for (const f of L.fires) assert.ok(f.x >= 0 && f.x < SIZE.tw);
  for (const top of L.floorTop) assert.ok(top === SIZE.groundRow || top === SIZE.groundRow + N.TILE / 2);
});

test('용암 무늬는 LAVA_PERIOD 줄마다 되풀이되고(한 칸씩 밀어 흐르게), 가운데가 가장자리보다 밝다', () => {
  for (let x = 0; x < N.FALL_W; x++) {
    for (let y = 0; y < 40; y++) assert.equal(N.lavaLevel(x, y, N.FALL_W), N.lavaLevel(x, y + N.LAVA_PERIOD, N.FALL_W));
  }
  const avg = (x) => Array.from({ length: N.LAVA_PERIOD }, (_, y) => N.lavaLevel(x, y, N.FALL_W)).reduce((a, b) => a + b, 0);
  assert.ok(avg(2) > avg(0) && avg(3) > avg(5));
  const strip = N.lavaStrip(N.FALL_W, 20);
  assert.equal(strip.length, N.FALL_W * 20 * 4);
});
