// 가스트·아이템 픽셀 그림(ghast-art.js) 테스트 — 실행: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Art = require('../ghast-art.js');

const cell = (rows, x, y) => rows[Math.floor(y)][Math.floor(x)];
const filled = (rows) => rows.reduce((n, row) => n + [...row].filter((ch) => ch !== '.').length, 0);

test('가스트 그림은 종류·장면마다 40×50 칸이고 쓰는 글자는 모두 색이 정해져 있다', () => {
  for (const type of Art.TYPES) {
    const pal = Art.palette(type);
    for (let frame = 0; frame < Art.FRAMES; frame++) {
      for (const charge of [false, true]) {
        const rows = Art.ghastGrid(type, { frame, charge });
        assert.equal(rows.length, Art.GH, `${type} 줄 수`);
        rows.forEach((row) => assert.equal(row.length, Art.GW, `${type} 칸 수`));
        for (const ch of new Set(rows.join(''))) if (ch !== '.') assert.ok(pal[ch], `${type} 의 '${ch}' 색이 없음`);
      }
    }
  }
});

test('입 자리(MOUTH_CELL)는 game.js 의 MOUTH(440×554 의 96, 338)와 같고, 모든 종류에서 몸 위에 있다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  const m = /const MOUTH = \{ x: (\d+), y: (\d+) \}/.exec(src);
  const size = /const GHAST_W = (\d+), GHAST_H = (\d+)/.exec(src);
  assert.ok(m && size, 'game.js 에서 MOUTH·GHAST_W·GHAST_H 를 찾지 못함');
  assert.ok(Math.abs(Art.MOUTH_CELL.x - (Number(m[1]) / Number(size[1])) * Art.GW) < 1e-9);
  assert.ok(Math.abs(Art.MOUTH_CELL.y - (Number(m[2]) / Number(size[2])) * Art.GH) < 1e-9);
  for (const type of Art.TYPES) {
    const calm = Art.ghastGrid(type);
    const charge = Art.ghastGrid(type, { charge: true });
    assert.notEqual(cell(calm, Art.MOUTH_CELL.x, Art.MOUTH_CELL.y), '.', `${type} 입 자리가 비어 있음`);
    // 충전 그림은 입 자리에 벌린 입(검은 입·불빛)이 있다
    assert.ok(['k', 'r', 'y'].includes(cell(charge, Art.MOUTH_CELL.x, Art.MOUTH_CELL.y)), `${type} 충전 입`);
  }
});

test('종류마다 모양이 다르다 (색만 바꾼 그림이 아님)', () => {
  const masks = Art.TYPES.map((type) => Art.ghastGrid(type).map((row) => row.replace(/[^.]/g, '#')).join('\n'));
  assert.equal(new Set(masks).size, Art.TYPES.length, '두 종류의 테두리 모양이 똑같음');
  // 아기 가스트는 보통 가스트보다 작게 칠해지고(동그란 몸·짧은 촉수), 큰 가스트는 더 많이 칠해진다
  const area = Object.fromEntries(Art.TYPES.map((t) => [t, filled(Art.ghastGrid(t))]));
  assert.ok(area.small < area.normal, `아기 ${area.small} < 보통 ${area.normal}`);
  assert.ok(area.big > area.normal, `큰 ${area.big} > 보통 ${area.normal}`);
});

test('촉수만 흔들린다: 장면(frame)마다 아랫부분은 다르고 윗부분(몸·얼굴)은 같다', () => {
  for (const type of Art.TYPES) {
    const [a, b, c] = [0, 1, 2].map((frame) => Art.ghastGrid(type, { frame }));
    assert.deepEqual(a.slice(0, 30), b.slice(0, 30), `${type} 윗부분이 바뀜`);
    assert.notDeepEqual(a.slice(36), b.slice(36), `${type} 0·1 촉수가 같음`);
    assert.notDeepEqual(b.slice(36), c.slice(36), `${type} 1·2 촉수가 같음`);
    assert.deepEqual(Art.ghastGrid(type, { frame: 3 }), a, 'frame 은 3장마다 되돌아온다');
  }
});

test('맞았을 때 색(hurt)은 모든 칸이 빨간 계열로 바뀐다', () => {
  const pal = Art.palette('gold', { hurt: true });
  assert.notEqual(pal.m, Art.palette('gold').m);
  for (const v of Object.values(pal)) assert.match(v, /^#[0-9a-f]{6}$/i);
});

test('아이템 그림(화염구·가스트의 눈물·화약)은 16×16 이고 모든 글자에 색이 있다', () => {
  for (const name of ['fireball', 'tear', 'gunpowder']) {
    const { rows, palette } = Art.itemGrid(name);
    assert.equal(rows.length, 16);
    rows.forEach((row) => assert.equal(row.length, 16));
    assert.ok(filled(rows) > 40, `${name} 이 너무 작음`);
    for (const ch of new Set(rows.join(''))) if (ch !== '.') assert.ok(palette[ch], `${name} 의 '${ch}' 색이 없음`);
  }
  assert.throws(() => Art.itemGrid('diamond'));
});

test('화염구는 3장(깜빡임)이 서로 다르고, 어두운 테두리와 흰빛 가운데가 있다', () => {
  const frames = [0, 1, 2].map((frame) => Art.itemGrid('fireball', { frame }));
  assert.equal(new Set(frames.map((f) => f.rows.join('\n'))).size, 3);
  for (const { rows, palette } of frames) {
    assert.equal(cell(rows, 8, 8), 'W', '가운데가 흰빛');
    assert.ok(rows.join('').includes('o'));
    assert.equal(palette.o.toLowerCase(), '#3a0a04');
  }
  assert.deepEqual(Art.itemGrid('fireball', { frame: 3 }).rows, frames[0].rows);
});

// ---------- 픽셀 아트 규칙 (art-metrics 기준과 같은 수치) ----------
const BODY_KEYS = new Set(['o', 'd', 'm', 'l', 'h']);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (rgb) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const allGrids = (type) => [0, 1, 2].flatMap((frame) => [false, true].map((charge) => Art.ghastGrid(type, { frame, charge })));

test('몸 색(o·d·m·l·h)에 한 칸짜리 잡티가 1% 이하 (모든 장면·충전 포함)', () => {
  for (const type of Art.TYPES) {
    for (const rows of allGrids(type)) {
      let cells = 0, orphans = 0;
      rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (!BODY_KEYS.has(ch)) return;
        cells++;
        const same = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (rows[y + dy] || '')[x + dx] === ch);
        if (!same) orphans++;
      }));
      assert.ok(orphans / cells <= 0.01, `${type} 잡티 ${(orphans / cells * 100).toFixed(1)}%`);
    }
  }
});

test('촉수 줄(y=38~43)의 80% 이상에서 촉수 사이가 2칸 이상 떨어지고, 한 덩어리 폭은 6칸 이하 (흔들려도)', () => {
  for (const type of Art.TYPES) {
    for (const rows of allGrids(type)) {
      let ok = 0, total = 0;
      for (let y = 38; y <= 43; y++) {
        const runs = [...rows[y].matchAll(/[^.]+/g)].map((m) => [m.index, m.index + m[0].length]);
        if (runs.length < 2) continue;
        total++;
        const gaps = runs.slice(1).map((r, i) => r[0] - runs[i][1]);
        if (gaps.every((g) => g >= 2) && runs.every((r) => r[1] - r[0] <= 6)) ok++;
      }
      assert.ok(!total || ok / total >= 0.8, `${type} 촉수 줄 ${ok}/${total}`);
    }
  }
});

test('몸 중간색은 네더 배경(58,12,10)과 6.5:1 이상, 큰 가스트는 차가운 돌빛·보통 가스트는 따뜻한 흰색', () => {
  for (const type of Art.TYPES) {
    const c = contrast(hex(Art.palette(type).m), [58, 12, 10]);
    assert.ok(c >= 6.5, `${type} 대비 ${c.toFixed(2)}`);
  }
  const warm = (h) => { const [r, , b] = hex(h); return r - b; };
  assert.ok(warm(Art.palette('big').m) <= -4, '큰 가스트가 차가운 색이 아님');
  assert.ok(warm(Art.palette('normal').m) > 0, '보통 가스트가 따뜻한 흰색이 아님');
});

test('하이라이트(h)는 4칸 이상 붙은 한 덩어리', () => {
  for (const type of Art.TYPES) {
    const rows = Art.ghastGrid(type);
    const cells = [];
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'h') cells.push(`${x},${y}`); }));
    assert.ok(cells.length >= 4, `${type} 하이라이트 ${cells.length}칸`);
    // 한 덩어리인지: 첫 칸에서 4방향으로 이어 칠한 수 = 전체 수
    const set = new Set(cells), seen = new Set([cells[0]]), stack = [cells[0]];
    while (stack.length) {
      const [x, y] = stack.pop().split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push(k); }
      }
    }
    assert.equal(seen.size, cells.length, `${type} 하이라이트가 여러 조각`);
  }
});

test('몸 왼쪽 위 윤곽은 위에서 아래로 갈수록 줄어드는 고른 계단 (늘어날 때는 1칸까지만)', () => {
  for (const type of Art.TYPES) {
    const rows = Art.bodyMask(type);
    const left = rows.map((r) => r.indexOf('#'));
    const top = left.findIndex((v) => v >= 0);
    let widest = top;
    for (let y = top; y < 34; y++) if (left[y] >= 0 && left[y] < left[widest]) widest = y;
    const steps = [];
    for (let y = top + 1; y <= widest; y++) steps.push(left[y - 1] - left[y]);
    steps.forEach((s, i) => {
      if (i > 0 && s > steps[i - 1]) assert.ok(s <= 1, `${type} 계단 ${steps.join(',')}`);
    });
  }
});

test('얼굴: 눈 높이 4칸 이상, 아기 가스트의 눈이 가장 크다', () => {
  const eyeHeight = (type) => {
    const rows = Art.ghastGrid(type);
    // 가까운 눈(오른쪽, 11~17 칸)의 눈 글자가 있는 줄 수
    return rows.filter((row) => /[ewry]/.test(row.slice(11, 18))).length;
  };
  const h = Object.fromEntries(Art.TYPES.map((t) => [t, eyeHeight(t)]));
  for (const t of Art.TYPES) assert.ok(h[t] >= 4, `${t} 눈 높이 ${h[t]}`);
  for (const t of Art.TYPES) if (t !== 'small') assert.ok(h.small > h[t], `아기 ${h.small} > ${t} ${h[t]}`);
});

test('분노 가스트: 뿔 높이 8칸 이상, 눈 불빛(노랑) 3×2 이상', () => {
  const rows = Art.ghastGrid('angry');
  const hornRows = rows.filter((row) => /[xX]/.test(row)).length;
  assert.ok(hornRows >= 8, `뿔 높이 ${hornRows}`);
  const yellow = rows.slice(15, 26).map((row) => row.slice(11, 18).replace(/[^y]/g, '').length);
  assert.ok(yellow.filter((n) => n >= 3).length >= 2, `노란 불빛 ${yellow}`);
});

// ---------- 촉수·밑단 (떠다니는 유령·해파리처럼) ----------
const COUNTS = { normal: [5], small: [3], big: [4], angry: [5], gold: [4, 5] };
const bodyBottoms = (type) => {
  const mask = Art.bodyMask(type);
  return Array.from({ length: Art.GW }, (_, x) => mask.reduce((y, row, r) => (row[x] === '#' ? r : y), -1));
};

test('촉수 개수가 종류마다 정해진 수이고, 간격이 모두 같지 않으며, 몸 폭 가운데 80% 안에 있다', () => {
  for (const type of Art.TYPES) {
    const xs = Art.tentacles(type, 0).map((t) => t.x0);
    assert.ok(COUNTS[type].includes(xs.length), `${type} 촉수 ${xs.length}개`);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    assert.ok(new Set(gaps).size >= 2, `${type} 간격이 모두 같음 ${gaps}`);
    const mask = Art.bodyMask(type);
    const widest = mask.reduce((best, row) => { const l = row.indexOf('#'), r = row.lastIndexOf('#'); return r - l > best[1] - best[0] ? [l, r] : best; }, [99, -99]);
    const margin = (widest[1] - widest[0] + 1) * 0.1;
    for (const x of xs) assert.ok(x >= widest[0] + margin - 0.5 && x <= widest[1] - margin + 0.5, `${type} 촉수 x=${x} 가 가장자리`);
  }
});

test('촉수는 끝으로 갈수록 가늘다: 아래 절반은 몸 색 1칸 (큰 가스트는 뿌리 3 → 2 → 1)', () => {
  for (const type of Art.TYPES) {
    for (const t of Art.tentacles(type, 0)) {
      t.rows.forEach((row, r) => {
        if (type === 'big') {
          assert.ok(row.width <= 3);
          if (r >= t.len * 0.7) assert.equal(row.width, 1, `big r=${r}`);
        } else {
          assert.ok(row.width <= 2);
          if (r >= t.len / 2) assert.equal(row.width, 1, `${type} r=${r}/${t.len}`);
        }
      });
    }
  }
});

test('촉수 길이가 확실히 다르다: 가장 짧은 것 ≤ 가장 긴 것의 65%, 서로 다른 길이 3가지 이상', () => {
  for (const type of Art.TYPES) {
    const lens = Art.tentacles(type, 0).map((t) => t.len);
    assert.ok(Math.min(...lens) <= Math.max(...lens) * 0.65, `${type} ${lens}`);
    assert.ok(new Set(lens).size >= 3, `${type} ${lens}`);
  }
  assert.ok(Math.max(...Art.tentacles('normal', 0).map((t) => t.len)) >= 12, '보통 가스트의 가장 긴 촉수 12칸 이상');
  for (const t of Art.tentacles('small', 0)) assert.ok(t.len >= 4 && t.len <= 7, `아기 촉수 ${t.len}`);
});

test('촉수는 무릎 없이 S 자: 한 줄에 옆으로 1칸까지, 같은 자리에 2줄 이상, 6줄 이상이면 방향이 한 번 이상 바뀜 (3장 모두)', () => {
  for (const type of Art.TYPES) {
    for (let frame = 0; frame < Art.FRAMES; frame++) {
      for (const t of Art.tentacles(type, frame)) {
        const xs = t.rows.map((r) => r.x);
        const moves = xs.slice(1).map((x, i) => x - xs[i]);
        assert.ok(moves.every((m) => Math.abs(m) <= 1), `${type} f${frame} ${moves}`);
        const dwell = [];
        let run = 1;
        for (let i = 1; i < xs.length; i++) { if (xs[i] === xs[i - 1]) run++; else { dwell.push(run); run = 1; } }
        dwell.push(run);
        assert.ok(Math.min(...dwell) >= 2, `${type} f${frame} 한 줄짜리 자리 ${dwell}`);
        if (t.len >= 6) assert.ok(moves.includes(1) && moves.includes(-1), `${type} f${frame} 한쪽으로만 ${moves}`);
      }
    }
  }
});

test('촉수 뿌리는 몸과 바로 이어진다 (사이에 테두리 줄이 없다)', () => {
  for (const type of Art.TYPES) {
    const rows = Art.ghastGrid(type);
    for (const t of Art.tentacles(type, 0)) {
      const above = rows[t.top - 1][t.rows[0].x];
      assert.ok(above !== '.' && above !== 'o', `${type} x=${t.x0} 뿌리 위가 '${above}'`);
    }
  }
});

test('밑단은 일직선이 아니다: 몸 맨 아랫줄 높이가 2가지 이상, 볼록한 물결 3개 이상', () => {
  for (const type of Art.TYPES) {
    const bottoms = bodyBottoms(type).filter((y) => y >= 0);
    assert.ok(new Set(bottoms).size >= 2, `${type} 바닥 높이 ${bottoms}`);
    // 같은 높이로 이어진 칸 묶음 중 양옆보다 낮게(아래로) 내려온 것 = 볼록한 물결
    const runs = bottoms.reduce((acc, y) => (acc.length && acc.at(-1).y === y ? acc : [...acc, { y }]), []);
    const bumps = runs.filter((r, i) => i > 0 && i < runs.length - 1 && r.y > runs[i - 1].y && r.y > runs[i + 1].y).length;
    assert.ok(bumps >= 3, `${type} 물결 ${bumps}개`);
  }
});

test('반사광(u)은 짧게 끊어진다: 이어진 덩어리가 6칸 이하', () => {
  for (const type of Art.TYPES) {
    for (let frame = 0; frame < Art.FRAMES; frame++) {
      const rows = Art.ghastGrid(type, { frame });
      const seen = new Set();
      rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch !== 'u' || seen.has(`${x},${y}`)) return;
        let size = 0;
        const stack = [[x, y]];
        seen.add(`${x},${y}`);
        while (stack.length) {
          const [cx, cy] = stack.pop();
          size++;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const k = `${cx + dx},${cy + dy}`;
            if ((rows[cy + dy] || '')[cx + dx] === 'u' && !seen.has(k)) { seen.add(k); stack.push([cx + dx, cy + dy]); }
          }
        }
        assert.ok(size <= 6, `${type} f${frame} 반사광 ${size}칸 이어짐 (${x},${y})`);
      }));
    }
  }
});
