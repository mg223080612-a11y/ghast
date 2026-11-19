// 나타나기·터지기 장면, 칸 수가 다른 아이템, 처음 화면 아이콘(icon-art.js) 테스트 — 실행: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Art = require('../ghast-art.js');
const Icons = require('../icon-art.js');

const filled = (rows) => rows.reduce((n, row) => n + [...row].filter((ch) => ch !== '.').length, 0);

test('칠해진 칸 범위(visibleBox)는 그림 안이고, 모든 장면·충전 그림이 그 안에 있다', () => {
  for (const type of Art.TYPES) {
    const box = Art.visibleBox(type);
    const { cols, rows } = Art.gridSize(type);
    assert.ok(box.x0 >= 0 && box.y0 >= 0 && box.x1 <= cols && box.y1 <= rows);
    for (let frame = 0; frame < Art.FRAMES; frame++) {
      for (const charge of [false, true]) {
        Art.ghastGrid(type, { frame, charge }).forEach((row, y) => [...row].forEach((ch, x) => {
          if (ch !== '.') assert.ok(x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1, `${type} (${x},${y})`);
        }));
      }
    }
  }
});

test('나타나기: 0 이면 빈 그림, 1 이면 그대로, 단계가 오를수록 켜진 칸이 늘어난다 (앞 단계 칸은 그대로 켜짐)', () => {
  const rows = Art.ghastGrid('normal');
  assert.equal(filled(Art.materialize(rows, 0)), 0);
  assert.deepEqual(Art.materialize(rows, 1), rows);
  const quarter = Art.materialize(rows, 0.25), half = Art.materialize(rows, 0.5);
  const ratio = filled(half) / filled(rows);
  assert.ok(ratio > 0.4 && ratio < 0.6, `반 단계 ${ratio}`);
  quarter.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') assert.equal(half[y][x], ch); }));
  for (const row of half) assert.equal(row.length, rows[0].length);
});

test('터지기: 4장, 크기는 그림 + 여백, 같은 그림이면 늘 같고, 장면이 지날수록 조각이 줄며 원래 색 글자만 쓴다', () => {
  for (const type of Art.TYPES) {
    const rows = Art.ghastGrid(type);
    const a = Art.poofFrames(rows), b = Art.poofFrames(rows);
    assert.deepEqual(a, b);
    assert.equal(a.frames.length, 4);
    const chars = new Set(rows.join(''));
    let prev = Infinity;
    for (const f of a.frames) {
      assert.equal(f.length, rows.length + a.margin * 2);
      f.forEach((row) => assert.equal(row.length, rows[0].length + a.margin * 2));
      for (const ch of new Set(f.join(''))) assert.ok(chars.has(ch), `${type} 모르는 글자 ${ch}`);
      const n = filled(f);
      assert.ok(n <= prev && n > 0, `${type} 조각 수 ${n} (앞 ${prev})`);
      prev = n;
    }
    assert.ok(filled(a.frames[3]) < filled(rows) * 0.5, `${type} 마지막 장면에도 조각이 너무 많음`);
  }
});

test('아이템은 칸 수(size)를 바꿔도 같은 모양: 16칸은 예전 그림 그대로, 화염구는 어느 크기든 흰빛 가운데와 테두리', () => {
  for (const name of ['fireball', 'tear', 'gunpowder']) {
    assert.deepEqual(Art.itemGrid(name, { size: 16 }).rows, Art.itemGrid(name).rows);
    for (const size of [8, 10, 12, 24, 40, 96]) {
      const { rows, palette } = Art.itemGrid(name, { size });
      assert.equal(rows.length, size);
      rows.forEach((row) => assert.equal(row.length, size));
      for (const ch of new Set(rows.join(''))) if (ch !== '.') assert.ok(palette[ch], `${name} ${size} '${ch}'`);
    }
  }
  for (const size of [8, 12, 20, 40, 64, 132]) {
    const { rows } = Art.itemGrid('fireball', { size });
    const mid = Math.floor(size / 2);
    assert.equal(rows[mid][mid], 'W', `화염구 ${size} 가운데`);
    assert.ok(rows.join('').includes('o'), `화염구 ${size} 테두리`);
  }
});

test('처음 화면 아이콘: 종류마다 작은 칸 수(12×14 ~ 18×20), 크기 순서 아기 < 황금 < 보통 = 분노 < 큰, 색이 다 있다', () => {
  const size = Object.fromEntries(Icons.TYPES.map((t) => [t, Icons.iconSize(t)]));
  assert.ok(size.small.cols < size.gold.cols && size.gold.cols < size.normal.cols && size.normal.cols < size.big.cols);
  assert.equal(size.normal.cols, size.angry.cols);
  for (const t of Icons.TYPES) {
    const rows = Icons.iconGrid(t), pal = Icons.iconPalette(t);
    assert.ok(size[t].cols <= 18 && size[t].rows <= 20);
    assert.equal(rows.length, size[t].rows);
    rows.forEach((row) => assert.equal(row.length, size[t].cols));
    for (const ch of new Set(rows.join(''))) if (ch !== '.') assert.ok(pal[ch], `${t} '${ch}' 색이 없음`);
  }
  const fb = Icons.fireballIcon();
  assert.equal(fb.rows.length, Icons.FIREBALL_CELLS);
});

test('아이콘에도 종류마다 알아볼 표시가 있다: 눈·입, 아기 새싹, 황금 왕관 보석, 분노 뿔과 불타는 눈, 큰 가스트 눈썹·금', () => {
  const text = (t) => Icons.iconGrid(t).join('');
  for (const t of Icons.TYPES) {
    assert.ok(/[ery]/.test(text(t)), `${t} 눈`);
    assert.ok(text(t).includes('k'), `${t} 입`);
  }
  assert.ok(text('small').includes('X'), '아기 새싹');
  assert.ok(text('gold').includes('g') && text('gold').includes('X'), '황금 왕관');
  assert.ok(text('angry').includes('x') && text('angry').includes('y'), '분노 뿔·불타는 눈');
  assert.ok(text('big').includes('b') && text('big').includes('q'), '큰 가스트 눈썹·금');
  // 정수 배율: 카드 높이에 맞춰 반올림, 최소 1
  assert.equal(Icons.iconScale(80), 4);
  assert.equal(Icons.iconScale(5), 1);
});
