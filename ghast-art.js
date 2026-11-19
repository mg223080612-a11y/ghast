// =============================================================
// 가스트·아이템 픽셀 그림 (이 게임만의 그림 — 그림 파일 없이 코드로 그린다)
//   가스트 5종은 종류마다 칸 수가 다르다 (v3.2.0): 보통·분노 40×50, 아기 24×30, 황금 30×38, 큰 54×68.
//   칸 수가 크기 비율(0.6 · 0.75 · 1 · 1.35)과 같아서, 게임은 모든 종류를 같은 칸 크기(P px)로 그린다
//   → 화면에서 픽셀 한 칸 크기가 가스트마다 같다 (pixel-scale.js).
//   몸은 둥근 유령 모양, 아래로 촉수가 늘어지고, 얼굴은 왼쪽을 보는 3/4 모습이다 (게임은 그림이 왼쪽을 본다고 보고 좌우를 뒤집는다).
//   종류마다 모양·얼굴이 다르다: 아기 = 동그랗고 눈이 가장 큼(머리 위 새싹), 큰 = 넓적한 돌빛 몸·굵은 촉수·금 간 무늬,
//   분노 = 붉은 몸·큰 뿔 셋·불타는 눈·송곳니, 황금 = 금빛 몸·왕관·반짝이.
//   그리는 법 (픽셀 아트 규칙):
//     · 몸은 빛(l)·중간(m)·그림자(d) 세 덩어리 + 작은 하이라이트(h) 한 덩어리. 한 칸짜리 잡티는 지운다
//     · 용암 동굴이라 몸 아랫단·촉수 끝에 주황 반사광(u), 그림자는 보랏빛(황금은 주황갈색)
//     · 촉수는 두 줄씩 같은 자리(2칸 계단)로 내려가며 흔들리고, 끝은 한쪽으로 말린다. 촉수 사이는 2칸 이상 띄운다
//     · 테두리는 대각선에서도 끊기지 않게 8방향으로 1칸
//   촉수는 3장(frame 0~2)으로 흔들리고, 충전 그림(charge)은 빨간 눈 + 크게 벌린 입이다.
//   입 자리는 모든 종류에서 game.js 의 MOUTH(440×554 그림의 96, 338)와 같은 비율 → 화염구가 입에서 나간다.
//   아이템(화염구 3장·가스트의 눈물·화약)은 16×16 칸 (화염구는 날아오며 칸 수가 늘어난다: size 옵션).
//   그림은 글자 줄(행) 배열로 만들고(순수 계산, 테스트는 node 에서 require), 게임에서는 toCanvas 로 작은 캔버스에 찍는다.
// =============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GhastArt = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const GW = 40, GH = 50;            // 보통 가스트 그림 칸 수 (440×554 의 비율과 거의 같다)
  const MOUTH_FRAC = { x: 96 / 440, y: 338 / 554 }; // 입 자리 (그림 폭·높이에 대한 비율)
  const MOUTH_CELL = { x: MOUTH_FRAC.x * GW, y: MOUTH_FRAC.y * GH }; // ≈ (8.7, 30.5)
  const FRAMES = 3;
  const TYPES = ['normal', 'small', 'big', 'angry', 'gold'];
  const BODY_SHADES = ['d', 'm', 'l'];

  // ---------- 색 ----------
  // 몸: o 테두리 · d 그림자 · m 중간 · l 빛 · h 하이라이트 · u 용암 반사광 (그림자색과 주황의 중간, 부드럽게)
  // 얼굴: e 눈 · w 눈빛 · k 입 · r 빨간 불빛 · y 노란 불빛 · b 눈썹 · t 이빨 · c 볼
  // 꾸밈: x·X 뿔·왕관·새싹 · g 보석 · s 반짝이 · q 금 간 무늬 · p 분노 테두리 빛
  const FACE = {
    e: '#221a20', w: '#ffffff', k: '#36141c', r: '#ff2a18', y: '#ffe04a',
    b: '#2a1c24', t: '#ffffff', c: '#f29aa6', g: '#e8302a', s: '#ffffff',
  };
  const PALETTES = {
    normal: { o: '#33263a', d: '#a497b6', m: '#e8e2dc', l: '#f7f2ea', h: '#ffffff', u: '#d1a598' },
    small: { o: '#2c2c50', d: '#a3a3d2', m: '#e6ecf6', l: '#f6f9ff', h: '#ffffff', u: '#d1aeb1', x: '#6fc05a', X: '#a8e47a', c: '#ff9fb4' },
    big: { o: '#22202e', d: '#7d7a9c', m: '#b9c2cc', l: '#d3dae2', h: '#ebf0f4', u: '#ab8a8a', q: '#3c3a52' },
    angry: { o: '#2a0c18', d: '#8a4a6c', m: '#d0949a', l: '#e6b6b4', h: '#f8dcd6', u: '#c4625f', p: '#ff7c6c', x: '#3e1a26', X: '#7a3a48' },
    gold: { o: '#5a2a06', d: '#c0741e', m: '#ffc83a', l: '#ffe27a', h: '#fff6c8', u: '#e0872c', x: '#e8a81c', X: '#fff0a0', e: '#5a2c00', k: '#6a2a00', c: '#ff9a5a' },
  };
  // 맞았을 때(터지기 직전) 빨갛게
  const HURT = { o: '#5a0c08', d: '#c8382a', m: '#ff8a7a', l: '#ffc4ba', h: '#ffe4de', u: '#ffb0a0', face: '#7a1008' };
  // 터진 뒤 흩어지는 조각의 마지막 장면 (연기처럼 밝은 회색)
  const SMOKE = { o: '#6a5a5a', d: '#b4b4b4', m: '#d2d2d2', l: '#ececec', h: '#ffffff', u: '#d2c4c0', face: '#9a8a8a' };

  function palette(type, opts = {}) {
    const base = { ...FACE, ...(PALETTES[type] || PALETTES.normal) };
    const tint = opts.hurt ? HURT : opts.smoke ? SMOKE : null;
    if (!tint) return base;
    const out = {};
    for (const key of Object.keys(base)) out[key] = tint[key] || tint.face;
    return out;
  }

  // ---------- 얼굴 조각 (충전 = 빨간 눈 + 벌린 입) ----------
  const CHARGE_EYES = {
    near: ['.ee.', 'erre', 'eyye', 'eyye', 'erre', '.ee.'],
    far: ['.e.', 'ere', 'eye', 'eye', 'ere', '.e.'],
    nearBrow: ['...bb', 'bbb..'],
    farBrow: ['bb.', '.bb'],
  };
  const CHARGE_MOUTH = ['.kkkk.', 'kkrrkk', 'krryrk', 'krryrk', 'kkrrkk', '.kkkk.'];
  const CHARGE_MOUTH_5 = ['.kkk.', 'krrrk', 'kryrk', 'krrrk', '.kkk.'];

  // ---------- 모양 ----------
  // grid: [칸 수, 줄 수]
  // body: cx·cy 몸 가운데, rx 반 너비, ryTop 위쪽 둥근 부분 높이, n 둥근 정도(클수록 네모), bottom 치마 끝 줄,
  //       round 아랫부분도 둥글게(아기), corner 아래 모서리 둥글기, hl 하이라이트 자리(없으면 빛 방향으로 계산), hlR 하이라이트 반지름,
  //       shadeBottom 음영 계산에 쓰는 바닥 (물결이 아래로 내려와도 몸 음영은 그대로 두려고)
  // hem: 치마 끝 물결 — 볼록한 곳 [가운데 x, 반 너비, 아래로 내려오는 칸]. 촉수는 볼록한 곳 아래에서 나온다
  // tentacles: xs 촉수 뿌리 칸, lens 길이(줄 수), curl 끝이 말리는 쪽(-1 왼쪽 / 1 오른쪽),
  //            thick 뿌리 3칸(큰 가스트), thin 1칸(아기), amp 흔들림 폭(칸), wave 물결 길이(줄), forkBelow 이 줄 아래 끝이 갈라짐(분노)
  // face: near 가까운 눈 · far 먼 눈 · mouth 입 · cheeks 볼 · marks 무늬 / charge: 충전 얼굴 자리 (eyes·mouthRows 로 바꿀 수 있다)
  // crown: 머리 위 꾸밈 (새싹·왕관), horns: 뿔, rim: 위·왼쪽 윤곽 안쪽 뜨거운 테두리 빛 (분노)
  const SPECS = {
    normal: {
      grid: [40, 50],
      body: { cx: 20, cy: 17, rx: 17.5, ryTop: 14, n: 2.4, bottom: 34, shadeBottom: 35, round: 0, corner: 6 },
      hem: [[12.5, 2.5, 2], [18.5, 2.5, 2], [26, 3, 2]],
      tentacles: { xs: [6, 12, 18, 26, 33], lens: [8, 12, 9, 11, 7], curl: [-1, -1, -1, 1, 1], amp: 1.6, wave: 9 },
      face: {
        near: { at: [12, 19], rows: ['.ee.', 'eeee', 'weee', 'eeee', '.ee.'] },
        far: { at: [4, 20], rows: ['.e.', 'eee', 'wee', 'eee', '.e.'] },
        mouth: { at: [6, 29], rows: ['.kkk.', 'kkkkk', 'kkkkk', '.kkk.'] },
        charge: { near: [12, 19], far: [4, 20], mouth: [6, 28] },
      },
    },
    // 아기: 24×30. 동그란 몸에 큰 눈(4×6), 머리 위 새싹, 가는 촉수 3개
    small: {
      grid: [24, 30],
      body: { cx: 12, cy: 13.5, rx: 10, ryTop: 10, n: 2, bottom: 21, shadeBottom: 22, round: 0.55, corner: 0, hl: [7, 6.5], hlR: [1.7, 1.2] },
      hem: [[7.5, 2, 1.5], [12, 1.5, 1.5], [16.5, 2, 1.5]],
      tentacles: { xs: [6, 11, 17], lens: [4, 5, 3], curl: [-1, 1, 1], thin: true, amp: 1.4, wave: 6 },
      crown: { at: [10, 2], rows: ['XX.', '.Xx'] },
      face: {
        near: { at: [8, 9], rows: ['.ee.', 'eeee', 'wwee', 'wwee', 'eeee', '.ee.'] },
        far: { at: [3, 10], rows: ['.e.', 'eee', 'wee', 'eee', '.e.'] },
        mouth: { at: [3, 17], rows: ['.kk.', 'kkkk', '.kk.'] },
        cheeks: [{ at: [9, 15], rows: ['cc'] }, { at: [2, 15], rows: ['c'] }],
        charge: {
          near: [8, 9], far: [3, 9], mouth: [3, 17], mouthRows: ['.kkk.', 'kryrk', 'krrrk', '.kkk.'],
          eyes: { near: CHARGE_EYES.near, far: ['.e.', 'ere', 'eye', 'ere', '.e.'] },
        },
      },
    },
    // 큰: 54×68. 넓적한 돌빛 몸, 무거운 눈썹, 굵은 촉수, 금 간 무늬
    big: {
      grid: [54, 68],
      body: { cx: 27, cy: 20.5, rx: 24, ryTop: 17, n: 3.2, bottom: 46, round: 0, corner: 9.5, hlR: [3.1, 2.2] },
      hem: [[15, 2.7, 2], [21, 3.4, 2.7], [32, 4, 2.7], [38.5, 2.7, 2]],
      tentacles: { xs: [11, 20, 31, 43], lens: [11, 10, 15, 16], curl: [-1, -1, 1, 1], thick: true, amp: 2.2, wave: 13.5 },
      face: {
        near: { at: [15, 24], rows: ['.bbbbbbb', 'bbbbbbb.', '.eeeeee.', '.weeeee.', '.eeeeee.', '..eeee..'] },
        far: { at: [4, 25], rows: ['bbbbb', '.eee.', '.wee.', '.eee.', '..ee.'] },
        mouth: { at: [7, 39], rows: ['kkkkkkkkkk', 'ktkkkkkktk', 'kkkkkkkkkk', 'kkkkkkkkkk', '.kkkkkkkk.'] },
        charge: {
          near: [15, 25], far: [4, 26], mouth: [8, 38],
          mouthRows: ['..kkkk..', '.kkrrkk.', 'kkrrrrkk', 'krryyrrk', 'krryyrrk', 'kkrrrrkk', '.kkrrkk.', '..kkkk..'],
          eyes: {
            near: ['.eeeee.', 'errrrre', 'erryyre', 'eryyyre', 'erryyre', 'errrrre', '.eeeee.'],
            far: ['.eee.', 'errre', 'eryre', 'eyyye', 'eryre', 'errre', '.eee.'],
            nearBrow: ['...bbbb', 'bbbb...'],
            farBrow: ['bbb..', '..bbb'],
          },
        },
        marks: [
          { at: [34, 8], rows: ['q....', 'qq...', '.q...', '.qq..', '..qq.', '...q.', '...qq'] },
          { at: [42, 24], rows: ['qq...', '.qq..', '..q..', '..qq.', '...q.'] },
          { at: [29, 35], rows: ['..q', '.qq', '.q.', 'qq.', 'q..'] },
          { at: [45, 37], rows: ['.q', 'qq', 'q.'] },
        ],
      },
    },
    angry: {
      grid: [40, 50],
      body: { cx: 20, cy: 19, rx: 17, ryTop: 12.5, n: 2.6, bottom: 34, shadeBottom: 35, round: 0, corner: 6, hl: [13.5, 12.5] }, // 하이라이트는 눈썹 위로
      hem: [[12, 2.5, 2], [18.5, 2.5, 2], [25.5, 3, 2]],
      tentacles: { xs: [6, 12, 18, 25, 33], lens: [10, 12, 11, 8, 7], curl: [-1, -1, -1, 1, 1], amp: 1.8, wave: 6, forkBelow: 43 },
      horns: [{ x: 11, h: 8, base: 3 }, { x: 20, h: 10, base: 3 }, { x: 29, h: 8, base: 3 }],
      rim: { right: 3, below: 6 },
      face: {
        near: { at: [11, 17], rows: ['....bb', '..bbbb', 'bbbb..', '.rrrr.', 'ryyyyr', 'ryyyyr', '.rrrr.'] },
        far: { at: [3, 18], rows: ['bb..', '.bbb', '.rr.', 'ryyr', 'ryyr', '.rr.'] },
        mouth: { at: [5, 29], rows: ['kkkkkkk', 'tkkkkkt', 'tkkkkkt', '.ktktk.'] },
        charge: {
          near: [12, 20], far: [4, 21], mouth: [6, 28],
          eyes: {
            near: ['.rrrr.', 'ryyyyr', 'ryyyyr', 'ryyyyr', '.rrrr.'],
            far: ['.rr.', 'ryyr', 'ryyr', 'ryyr', '.rr.'],
          },
        },
      },
    },
    // 황금: 30×38. 왕관(보석) · 반짝이 · 웃는 입
    gold: {
      grid: [30, 38],
      body: { cx: 15, cy: 14, rx: 12.5, ryTop: 10, n: 2.2, bottom: 26, shadeBottom: 27, round: 0.2, corner: 4.5, hlR: [1.8, 1.3] },
      hem: [[8, 1.5, 1.5], [12, 2, 1.5], [18, 2.5, 1.5], [22.5, 1.5, 1.5]],
      tentacles: { xs: [5, 11, 17, 24], lens: [7, 8, 5, 4], curl: [-1, -1, 1, 1], taper: 1, amp: 1.6, wave: 7 },
      crown: { at: [11, 2], rows: ['x...x...x', 'xx.xgx.xx', 'xxxxxxxxx', 'XgXXXXXgX'] },
      face: {
        near: { at: [9, 13], rows: ['.ee.', 'eeee', 'ewee', 'eeee', '.ee.'] },
        far: { at: [3, 14], rows: ['.e.', 'eee', 'wee', 'eee', '.e.'] },
        mouth: { at: [4, 22], rows: ['k...k', '.kkk.', '..k..'] },
        cheeks: [{ at: [10, 19], rows: ['cc'] }, { at: [3, 20], rows: ['c'] }],
        charge: { near: [9, 13], far: [3, 14], mouth: [4, 21], mouthRows: CHARGE_MOUTH_5 },
        marks: [
          { at: [19, 7], rows: ['.s.', 'sss', '.s.'] },
          { at: [23, 16], rows: ['.s.', 'sss', '.s.'] },
          { at: [16, 21], rows: ['.s.', 'sss', '.s.'] },
        ],
      },
    },
  };
  const specOf = (type) => SPECS[type] || SPECS.normal;
  const gridSize = (type) => { const [cols, rows] = specOf(type).grid; return { cols, rows }; };
  const mouthCell = (type) => { const { cols, rows } = gridSize(type); return { x: MOUTH_FRAC.x * cols, y: MOUTH_FRAC.y * rows }; };

  // 치마 끝 아래로 볼록 내려온 물결 (반 타원)
  function inHem(spec, x, y) {
    const b = spec.body;
    const dy = y - (b.bottom + 1);
    if (!inBody(b, x, b.bottom + 0.5)) return false; // 둥근 아래 모서리 밖으로는 내려오지 않는다
    return (spec.hem || []).some(([lx, lw, ld]) => dy < ld && Math.abs(x - lx) <= lw * Math.sqrt(Math.max(0, 1 - Math.pow(dy / ld, 2))));
  }
  function inBody(b, x, y) {
    const dx = Math.abs(x - b.cx);
    if (y < b.cy) return Math.pow(dx / b.rx, b.n) + Math.pow((b.cy - y) / b.ryTop, b.n) <= 1;
    if (y > b.bottom + 0.5) return false;
    const t = (y - b.cy) / (b.bottom - b.cy);
    let half = b.rx * Math.sqrt(Math.max(0, 1 - Math.pow(t * b.round, 2)));
    const c = y - (b.bottom + 0.5 - b.corner);
    if (b.corner > 0 && c > 0) half -= b.corner - Math.sqrt(Math.max(0, b.corner * b.corner - c * c));
    return dx <= half;
  }
  const inShape = (spec, x, y) => inBody(spec.body, x, y) || (y > spec.body.bottom + 0.5 && inHem(spec, x, y));

  // 칸 수 d = { cols, rows } 인 빈 그림 · 안쪽인지
  const dimsOf = (spec) => ({ cols: spec.grid[0], rows: spec.grid[1] });
  const blank = (d) => Array.from({ length: d.rows }, () => Array(d.cols).fill('.'));
  const inside = (d, x, y) => x >= 0 && y >= 0 && x < d.cols && y < d.rows;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // 몸 음영: 몸을 공처럼 보고 왼쪽 위에서 빛이 온다고 계산해 빛 · 중간 · 그림자 세 덩어리로 나눈다 (띠 경계가 둥근 곡선)
  const LIGHT = (() => { const v = [-0.45, -0.35, 0.82]; const n = Math.hypot(...v); return v.map((c) => c / n); })();
  function ballNormal(b, x, y) {
    const top = b.cy - b.ryTop, half = ((b.shadeBottom ?? b.bottom) - top) / 2;
    const nx = (x - b.cx) / b.rx, ny = (y - (top + half)) / half;
    const r = Math.hypot(nx, ny), k = r > 0.98 ? 0.98 / r : 1;
    const px = nx * k, py = ny * k;
    return [px, py, Math.sqrt(Math.max(0, 1 - px * px - py * py))];
  }
  function bodyShade(b, x, y) {
    const [nx, ny, nz] = ballNormal(b, x, y);
    const i = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    return i > 0.85 ? 'l' : i > 0.3 ? 'm' : 'd';
  }
  // 하이라이트 한 덩어리 (빛이 가장 센 곳)
  function inHighlight(b, x, y) {
    const top = b.cy - b.ryTop, half = ((b.shadeBottom ?? b.bottom) - top) / 2;
    const hx = b.hl ? b.hl[0] : b.cx + LIGHT[0] * b.rx * 0.62;
    const hy = b.hl ? b.hl[1] : top + half + LIGHT[1] * half * 0.62;
    const [rx, ry] = b.hlR || [2.3, 1.6];
    return Math.pow((x - hx) / rx, 2) + Math.pow((y - hy) / ry, 2) <= 1;
  }

  // 한 칸짜리 몸 색(d·m·l)은 둘레에서 가장 많은 몸 색으로 (픽셀 잡티 없애기)
  function cleanOrphans(g, d) {
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < d.rows; y++) {
        for (let x = 0; x < d.cols; x++) {
          const ch = g[y][x];
          if (!BODY_SHADES.includes(ch)) continue;
          const near = N4.map(([dx, dy]) => (inside(d, x + dx, y + dy) ? g[y + dy][x + dx] : '.'));
          if (near.includes(ch)) continue;
          const counts = {};
          for (const n of near) if (BODY_SHADES.includes(n) || n === 'h') counts[n] = (counts[n] || 0) + 1;
          const best = Object.keys(counts).sort((a, b2) => counts[b2] - counts[a])[0];
          if (best && best !== 'h') g[y][x] = best;
        }
      }
    }
  }

  // 촉수 한 가닥이 줄마다 어디에 있는지 (뿌리 기준 칸 차이). 물결(S 곡선)을 따라가되
  //   · 한 줄에 옆으로 1칸까지만, 같은 자리에 2줄 이상 머문 뒤 옮긴다 (무릎처럼 꺾이지 않게)
  //   · 아래로 갈수록 크게 흔들리고, 끝 두 줄은 curl 쪽으로 살짝 말린다
  function tentaclePath(len, phase, amp, wave, curl) {
    const offs = [];
    let cur = 0, dwell = 0;
    for (let r = 0; r < len; r++) {
      const grow = Math.min(1, 0.45 + r / 10);
      let target = amp * grow * Math.sin(phase - (r / wave) * Math.PI * 2);
      if (r >= len - 2) target = cur + curl;
      if (dwell >= 2 && Math.abs(target - cur) >= 0.75) { cur += Math.sign(target - cur); dwell = 0; }
      offs.push(cur);
      dwell++;
    }
    return offs;
  }
  // 줄 r 의 몸 색 폭: 뿌리 2칸 → 아래 절반 1칸 (큰 가스트는 3 → 2 → 1, 아기는 늘 1, taper 면 뿌리 taper 줄만 2칸)
  function tentacleWidth(r, len, t) {
    if (t.thin) return 1;
    if (t.taper) return r < t.taper ? 2 : 1;
    if (t.thick) return r < len * 0.35 ? 3 : r < len * 0.7 ? 2 : 1;
    return r < len / 2 ? 2 : 1;
  }

  // 촉수 배치 (그리기 전 계산만): 몸 바닥(물결 아래)에서 바로 이어져 나와 가늘어지며 S 자로 흔들린다.
  // 바깥 촉수는 둥근 모서리에서 나온다. 모든 촉수가 같은 줄에서 같은 만큼 옮겨 가서(같은 물결) 촉수 사이 틈이 그대로 남는다.
  // 돌려주는 값: 촉수마다 { x0, top, len, rows: [{ y, x 기준 칸, width 몸 색 폭, tip 끝 줄 }] }
  function layoutTentacles(spec, frame, colBottom, d) {
    const t = spec.tentacles;
    const { xs, lens, curl, amp, wave } = t;
    const phase = (frame / FRAMES) * Math.PI * 2;
    const y0 = Math.min(...xs.map((x) => colBottom[x])) + 1;
    const shared = tentaclePath(d.rows - y0, phase, amp, wave, 0); // 줄(y - y0)마다 옆으로 옮긴 칸
    return xs.map((x0, i) => {
      const top = colBottom[x0] + 1;
      const len = Math.min(lens[i], d.rows - 1 - top);
      // 뿌리는 늘 몸 바로 아래(x0)에서 시작하고, 물결은 거기서부터 옮겨 간 만큼만 따른다 (몸과 촉수 사이가 끊기지 않게)
      const base = shared[top + Math.min(1, len - 1) - y0];
      const offs = Array.from({ length: len }, (_, r) => shared[top + r - y0] - base);
      // 뿌리 첫 줄이 바로 옮겨 가면(한 줄짜리) 둘째 줄 자리에 맞춘다 — 몸에서 곧게 나와 꺾이지 않게
      if (len > 1 && offs[0] !== offs[1]) offs[0] = offs[1];
      // 끝 말림: 끝(반사광 1칸 + 그 위 두 칸)을 한 칸 옆으로. 6줄 이상인 촉수가 한쪽으로만 휘었으면 반대쪽으로 말아 S 자가 되게,
      // 아니면 정한 쪽으로. 말기 바로 앞 두 줄은 같은 자리에 둔다 (줄마다 꺾이는 무릎이 생기지 않게)
      const k = len - 3;
      if (k >= 2) {
        offs[k - 1] = offs[k - 2];
        const moves = offs.slice(1, k).map((v, r) => v - offs[r]);
        const drift = moves.reduce((sum, m) => sum + m, 0);
        const oneWay = !(moves.includes(1) && moves.includes(-1));
        const dir = len >= 6 && oneWay && drift !== 0 ? -Math.sign(drift) : curl[i];
        // 6줄 이상인데 곧게만 내려왔으면 가운데를 말리는 반대쪽으로 한 칸 옮겨 S 자를 만든다
        if (len >= 6 && drift === 0 && moves.every((m) => m === 0)) for (let r = 2; r < k; r++) offs[r] -= dir;
        for (let r = k; r < len; r++) offs[r] = offs[k - 1] + dir;
      } else if (len > 2 && offs[len - 1] !== offs[len - 2]) {
        offs[len - 1] = offs[len - 2]; // 짧은 촉수: 끝 한 줄만 옮겨 가지 않게
      }
      const rows = offs.map((off, r) => ({ y: top + r, x: x0 + off, width: tentacleWidth(r, len, t), tip: r === len - 1 }));
      return { x0, top, len, rows };
    });
  }
  // 촉수 칠하기: 왼쪽 빛·오른쪽 그림자, 끝은 반사광. 분노의 긴 촉수는 끝이 두 갈래, 짧은 촉수는 뾰족하게
  function drawTentacles(g, mask, spec, frame, colBottom, d) {
    const tips = [];
    const fork = spec.tentacles.forkBelow;
    for (const t of layoutTentacles(spec, frame, colBottom, d)) {
      for (const { y, x: cx, width, tip } of t.rows) {
        const left = cx - Math.floor((width - 1) / 2);
        const cells = tip && fork && y > fork ? [left - 1, left + 1] : Array.from({ length: width }, (_, c) => left + c);
        cells.forEach((x, c) => {
          if (x < 1 || x > d.cols - 2) return;
          mask[y][x] = 'T';
          g[y][x] = tip ? 'u' : width === 3 ? 'lmd'[c] : width === 2 ? 'md'[c] : 'm';
          if (tip) tips.push([x, y]);
        });
      }
    }
    // 촉수 색 중 한 칸짜리(위아래·옆에 같은 색이 없는 칸)는 옆 촉수 칸 색으로 (잡티 없애기)
    for (let y = 0; y < d.rows; y++) {
      for (let x = 0; x < d.cols; x++) {
        if (mask[y][x] !== 'T' || !BODY_SHADES.includes(g[y][x])) continue;
        const near = N4.filter(([dx, dy]) => inside(d, x + dx, y + dy) && mask[y + dy][x + dx] === 'T' && BODY_SHADES.includes(g[y + dy][x + dx]));
        if (near.some(([dx, dy]) => g[y + dy][x + dx] === g[y][x]) || !near.length) continue;
        const [dx, dy] = near[0];
        g[y][x] = g[y + dy][x + dx];
      }
    }
    return tips;
  }

  // 분노 가스트의 뿔: 밑동이 넓고 두 줄마다 좁아진다 (몸 윗면에 2칸 박혀 있다)
  function drawHorns(g, mask, spec, d) {
    for (const hn of spec.horns || []) {
      const col = Math.round(hn.x);
      let surface = 0;
      while (surface < d.rows && mask[surface][col] !== 'B') surface++;
      const baseY = surface + 1;
      for (let i = 0; i < hn.h; i++) {
        const y = baseY - i;
        if (y < 0) break;
        const half = hn.base * Math.max(0, 1 - Math.floor(i / 2) / (Math.ceil(hn.h / 2) - 1));
        const lean = hn.x < spec.body.cx - 2 ? -Math.floor(i / 4) : hn.x > spec.body.cx + 2 ? Math.floor(i / 4) : 0;
        const l = Math.round(hn.x - half + lean), r = Math.round(hn.x + half + lean);
        for (let x = l; x <= r; x++) {
          if (!inside(d, x, y)) continue;
          mask[y][x] = 'B';
          g[y][x] = x === l ? 'X' : 'x';
        }
      }
    }
  }

  // 글자 그림(stamp)을 (x, y) 에 찍는다. '.' 은 건너뜀
  function stamp(g, mask, x0, y0, rows, opts = {}) {
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === '.') return;
      const x = x0 + c, y = y0 + r;
      if (y < 0 || x < 0 || y >= g.length || x >= g[0].length) return;
      if (opts.addToMask) mask[y][x] = 'B';
      g[y][x] = ch;
    }));
  }

  // ---------- 얼굴 (종류마다 다름) ----------
  // 왼쪽을 보는 3/4 얼굴: 가까운 눈(오른쪽, 큼) · 먼 눈(왼쪽, 좁음) · 입은 입 자리(mouthCell)
  function drawFace(g, mask, f, charge) {
    for (const m of f.marks || []) stamp(g, mask, m.at[0], m.at[1], m.rows);
    if (charge) {
      const c = f.charge;
      const eyes = { ...CHARGE_EYES, ...(c.eyes || {}) };
      stamp(g, mask, c.near[0], c.near[1], eyes.near);
      stamp(g, mask, c.far[0], c.far[1], eyes.far);
      stamp(g, mask, c.near[0], c.near[1] - 2, eyes.nearBrow);
      stamp(g, mask, c.far[0], c.far[1] - 2, eyes.farBrow);
      stamp(g, mask, c.mouth[0], c.mouth[1], c.mouthRows || CHARGE_MOUTH);
      return;
    }
    for (const ch of f.cheeks || []) stamp(g, mask, ch.at[0], ch.at[1], ch.rows);
    stamp(g, mask, f.near.at[0], f.near.at[1], f.near.rows);
    stamp(g, mask, f.far.at[0], f.far.at[1], f.far.rows);
    stamp(g, mask, f.mouth.at[0], f.mouth.at[1], f.mouth.rows);
  }

  // 그림 바깥쪽에 1칸 테두리. 몸·꾸밈은 8방향(대각선 계단에서도 끊기지 않게),
  // 촉수는 4방향(두 줄 계단이라 끊기지 않고, 촉수 사이 틈이 좁아지지 않게) + 끝 아래 3칸 마개
  function outline(g, mask, tips, d) {
    const out = g.map((row) => [...row]);
    const solid = (x, y) => inside(d, x, y) && g[y][x] !== '.';
    for (let y = 0; y < d.rows; y++) {
      for (let x = 0; x < d.cols; x++) {
        if (g[y][x] !== '.') continue;
        const edge = N4.some(([dx, dy]) => solid(x + dx, y + dy))
          || N8.some(([dx, dy]) => solid(x + dx, y + dy) && mask[y + dy][x + dx] !== 'T');
        if (edge) out[y][x] = 'o';
      }
    }
    for (const [x, y] of tips) {
      for (const dx of [-1, 0, 1]) if (inside(d, x + dx, y + 1) && out[y + 1][x + dx] === '.') out[y + 1][x + dx] = 'o';
    }
    // 한 칸짜리 테두리(촉수가 옆으로 옮겨 간 자리)는 위나 아래로 한 칸 이어 붙인다 (옆으로는 늘리지 않아 촉수 사이 틈이 그대로)
    for (let y = 0; y < d.rows; y++) {
      for (let x = 0; x < d.cols; x++) {
        if (out[y][x] !== 'o' || N4.some(([dx, dy]) => inside(d, x + dx, y + dy) && out[y + dy][x + dx] === 'o')) continue;
        for (const dy of [1, -1]) {
          if (inside(d, x, y + dy) && out[y + dy][x] === '.') { out[y + dy][x] = 'o'; break; }
        }
      }
    }
    return out;
  }

  // 몸 모양만 ('#' 몸 / '.' 밖, 뿔·왕관·촉수·테두리 없이) — 윤곽 계단을 점검하는 테스트용
  function specMask(spec) {
    const d = dimsOf(spec);
    return Array.from({ length: d.rows }, (_, y) => Array.from({ length: d.cols }, (_, x) => (x >= 1 && x < d.cols - 1 && inShape(spec, x + 0.5, y + 0.5) ? '#' : '.')).join(''));
  }
  const bodyMask = (type) => specMask(specOf(type));

  // 촉수 배치 (테스트·점검용): 몸 모양의 열마다 맨 아래 줄에서 촉수가 나온다
  function tentacles(type, frame = 0) {
    const spec = specOf(type);
    const d = dimsOf(spec);
    const mask = specMask(spec);
    const colBottom = Array.from({ length: d.cols }, (_, x) => { let y = -1; mask.forEach((row, r) => { if (row[x] === '#') y = r; }); return y; });
    return layoutTentacles(spec, ((frame % FRAMES) + FRAMES) % FRAMES, colBottom, d);
  }

  // spec 으로 가스트 그림 (글자 줄 배열) 을 만든다. frame: 촉수 흔들림 0~2, charge: 화염구 충전 얼굴 (icon-art.js 도 쓴다)
  function renderSpec(spec, opts = {}) {
    const b = spec.body;
    const d = dimsOf(spec);
    const frame = ((opts.frame || 0) % FRAMES + FRAMES) % FRAMES;
    const g = blank(d);
    const mask = blank(d);
    const colBottom = Array(d.cols).fill(-1); // 열마다 몸의 맨 아래 줄 (촉수가 여기서 이어져 나온다)
    for (let y = 0; y < d.rows; y++) {
      for (let x = 1; x < d.cols - 1; x++) {
        if (!inShape(spec, x + 0.5, y + 0.5)) continue;
        mask[y][x] = 'B';
        g[y][x] = bodyShade(b, x + 0.5, y + 0.5);
        colBottom[x] = y;
      }
    }
    cleanOrphans(g, d);
    const rim = spec.rim;
    for (let y = 0; y < d.rows; y++) {
      for (let x = 0; x < d.cols; x++) {
        if (mask[y][x] !== 'B') continue;
        if (inHighlight(b, x + 0.5, y + 0.5)) g[y][x] = 'h';
        // 분노: 위·왼쪽 윤곽 안쪽 1칸에 뜨거운 테두리 빛
        if (rim && x < b.cx + rim.right && y < b.cy + rim.below && N4.some(([dx, dy]) => !inside(d, x + dx, y + dy) || mask[y + dy][x + dx] !== 'B')) g[y][x] = 'p';
      }
    }
    drawHorns(g, mask, spec, d);
    if (spec.crown) stamp(g, mask, spec.crown.at[0], spec.crown.at[1], spec.crown.rows, { addToMask: true });
    const tips = spec.tentacles ? drawTentacles(g, mask, spec, frame, colBottom, d) : [];
    // 물결의 볼록한 아랫면에만 부드러운 반사광 (촉수가 붙은 칸은 빼서 짧게 끊긴다)
    for (let y = b.bottom + 1; y < d.rows; y++) {
      for (let x = 0; x < d.cols; x++) {
        if (mask[y][x] === 'B' && (y + 1 >= d.rows || mask[y + 1][x] === '.')) g[y][x] = 'u';
      }
    }
    drawFace(g, mask, spec.face, !!opts.charge);
    return outline(g, mask, tips, d).map((row) => row.join(''));
  }
  // type 가스트의 그림 (글자 줄 배열). 칸 수는 gridSize(type)
  const ghastGrid = (type, opts = {}) => renderSpec(specOf(type), opts);

  // 그림이 실제로 칠해진 칸의 범위 (모든 장면·충전 얼굴을 합친 것) { x0, y0, x1, y1 } — x1·y1 은 끝 칸 + 1.
  // 게임은 이 범위가 판정 상자 안에 들어가게 칸 크기를 고른다 (pixel-scale.js)
  const boxCache = new Map();
  function visibleBox(type) {
    const key = SPECS[type] ? type : 'normal';
    if (boxCache.has(key)) return boxCache.get(key);
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (let frame = 0; frame < FRAMES; frame++) {
      for (const charge of [false, true]) {
        ghastGrid(key, { frame, charge }).forEach((row, y) => [...row].forEach((ch, x) => {
          if (ch === '.') return;
          box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y);
          box.x1 = Math.max(box.x1, x + 1); box.y1 = Math.max(box.y1, y + 1);
        }));
      }
    }
    boxCache.set(key, box);
    return box;
  }

  // ---------- 나타나기 · 터지기 장면 (칸 단위로만 바뀐다 — 크기를 늘리거나 줄이지 않는다) ----------
  // 나타나기: 4×4 바이어 무늬 순서로 칸이 하나씩 켜진다. level 0 ~ 1 (1 이면 그대로)
  const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  function materialize(rows, level) {
    const on = Math.round(Math.max(0, Math.min(1, level)) * 16);
    return rows.map((row, y) => [...row].map((ch, x) => (BAYER4[y & 3][x & 3] < on ? ch : '.')).join(''));
  }
  // 같은 씨앗이면 늘 같은 난수
  function seededRandom(seed) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 터지기: 그림을 chunk×chunk 칸 조각으로 나눠 가운데에서 바깥으로 흩어 보낸다. 장면이 지날수록 조각이 줄고(1칸) 사라진다.
  // 돌려주는 값: { frames: 글자 줄 그림 배열, margin } — 그림마다 (칸 수 + 2·margin) × (줄 수 + 2·margin)
  function poofFrames(rows, opts = {}) {
    const count = opts.frames || 4, chunk = opts.chunk || 2;
    const cols = rows[0].length, h = rows.length;
    const margin = opts.margin ?? Math.ceil(cols * 0.3);
    const rnd = seededRandom(opts.seed || 20261119);
    const pieces = [];
    for (let by = 0; by < h; by += chunk) {
      for (let bx = 0; bx < cols; bx += chunk) {
        const cells = [];
        for (let y = by; y < Math.min(h, by + chunk); y++) for (let x = bx; x < Math.min(cols, bx + chunk); x++) if (rows[y][x] !== '.') cells.push([x, y, rows[y][x]]);
        if (!cells.length) continue;
        const dx = bx + chunk / 2 - cols / 2, dy = by + chunk / 2 - h / 2;
        const dist = Math.hypot(dx, dy) || 1;
        const reach = (0.18 + rnd() * 0.22) * cols; // 마지막 장면까지 날아가는 칸 수
        pieces.push({ cells, ux: dx / dist, uy: dy / dist, reach: reach * (0.5 + 0.5 * dist / (cols / 2)), life: 0.35 + rnd() * 0.65 });
      }
    }
    const frames = [];
    for (let k = 1; k <= count; k++) {
      const t = k / count;
      const g = Array.from({ length: h + margin * 2 }, () => Array(cols + margin * 2).fill('.'));
      for (const pc of pieces) {
        if (t > pc.life + 0.25) continue;                 // 조각이 차례로 사라진다
        const ox = Math.round(pc.ux * pc.reach * t);
        const oy = Math.round(pc.uy * pc.reach * t + 0.12 * cols * t * t); // 뒤로 갈수록 조금씩 떨어진다
        const cells = t > 0.5 ? pc.cells.slice(0, 1) : pc.cells; // 반이 지나면 한 칸짜리 조각
        for (const [x, y, ch] of cells) {
          const gx = x + margin + ox, gy = y + margin + oy;
          if (gy >= 0 && gx >= 0 && gy < g.length && gx < g[0].length) g[gy][gx] = ch;
        }
      }
      frames.push(g.map((row) => row.join('')));
    }
    return { frames, margin };
  }

  // ---------- 아이템 (16×16 기준, size 칸으로도 만든다) ----------
  const IW = 16;
  // fn 은 16×16 기준 좌표로 칸 색을 정한다. size 칸 그림은 같은 모양을 size 칸에 맞춰 다시 찍는다 (테두리는 늘 1칸)
  function itemFrom(fn, ring = N4, size = IW) {
    const k = IW / size;
    const g = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => fn((x + 0.5) * k, (y + 0.5) * k) || '.'));
    const out = g.map((row) => [...row]);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (g[y][x] !== '.') continue;
        if (ring.some(([dx, dy]) => g[y + dy]?.[x + dx] && g[y + dy][x + dx] !== '.')) out[y][x] = 'o';
      }
    }
    return out.map((row) => row.join(''));
  }
  // 화염구: 흰빛 중심의 불덩이를 불꽃 세 갈래가 감싼다. frame 0~2 로 불꽃이 돌아가며 깜빡인다 (3갈래라 3장이 이어진다)
  function fireballRows(frame = 0, size = IW) {
    const turn = ((frame % FRAMES) / FRAMES) * (Math.PI * 2 / 3);
    const pulse = [0, 0.35, 0.15][frame % FRAMES];
    return itemFrom((x, y) => {
      const dx = x - 8, dy = y - 8;
      const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const R = 4.6 + pulse + 2 * Math.max(0, Math.sin(3 * (a - turn) + d * 0.7));
      if (d > Math.min(R, 6.9)) return null;
      // 가운데는 동그란 흰빛·노란빛, 바깥 불꽃만 갈래 모양
      if (d < 1.6 + pulse) return 'W';
      if (d < 3 + pulse) return 'y';
      return d / R < 0.8 ? 'O' : 'r';
    }, N8, size);
  }
  // 가스트의 눈물: 위가 뾰족한 물방울, 안에 작은 거품
  function tearRows(frame = 0, size = IW) {
    return itemFrom((x, y) => {
      const cx = 8, cy = 10, R = 4.9;
      let ok;
      if (y >= cy) ok = Math.hypot(x - cx, y - cy) <= R;
      else ok = y >= 1.2 && Math.abs(x - cx) <= R * Math.pow((y - 1.2) / (cy - 1.2), 1.25);
      if (!ok) return null;
      if ((x > 5 && x < 7 && y > 7 && y < 10) || (x > 6 && x < 7 && y > 10 && y < 11)) return 'h';
      if (Math.hypot(x - 10, y - 12) < 1.3 && Math.hypot(x - 10, y - 12) > 0.6) return 'h';
      const s = -(x - cx) * 0.6 - (y - cy) * 0.5;
      return s > 1.2 ? 'l' : s > -1.6 ? 'm' : 'd';
    }, N4, size);
  }
  // 화약: 끈으로 묶은 작은 자루와 흘러나온 가루
  function gunpowderRows(frame = 0, size = IW) {
    return itemFrom((x, y) => {
      const sack = Math.pow((x - 8) / 5.6, 2) + Math.pow((y - 10.5) / 4.4, 2) <= 1;
      const neck = y >= 4 && y < 7 && Math.abs(x - 8) < 1.6 + (y - 4) * 0.3;
      const flap = y >= 2 && y < 4 && Math.abs(x - 8) < 1.2 + (4 - y) * 0.9; // 묶은 위가 부채꼴로 벌어짐
      const grains = (y > 14.6 && [2.5, 4.5, 12.5].includes(x)) || (y > 13.6 && y < 14.6 && x === 13.5);
      if (grains) return 'g';
      if (y >= 6 && y < 7 && Math.abs(x - 8) < 2.2) return 't';
      if (!(sack || neck || flap)) return null;
      const s = -(x - 8) * 0.5 - (y - 9) * 0.4;
      return s > 1.5 ? 'l' : s > -1.8 ? 'm' : 'd';
    }, N4, size);
  }
  const ITEMS = {
    fireball: { rows: fireballRows, palette: { o: '#3a0a04', r: '#d8361a', O: '#ff7a1c', y: '#ffd23a', W: '#fffbe8' } },
    tear: { rows: tearRows, palette: { o: '#1d4a66', d: '#3a9cc8', m: '#7fd6f0', l: '#c4f2ff', h: '#ffffff' } },
    gunpowder: { rows: gunpowderRows, palette: { o: '#121214', d: '#2c2c32', m: '#4a4a52', l: '#6e6e78', t: '#c9a35a', g: '#8a8a92' } },
  };
  // name: 'fireball' | 'tear' | 'gunpowder'. frame 은 화염구만 (0~2), size: 칸 수 (기본 16)
  function itemGrid(name, opts = {}) {
    const item = ITEMS[name];
    if (!item) throw new Error(`알 수 없는 아이템 그림: ${name}`);
    const size = Math.max(2, Math.round(opts.size || IW));
    return { rows: item.rows(opts.frame || 0, size), palette: { ...item.palette } };
  }

  // 글자 줄 그림 → 캔버스 (한 칸 = 1픽셀. 게임은 imageSmoothingEnabled = false 로 정수 배 늘려 그린다)
  // 칸마다 fillRect 하지 않고 픽셀 버퍼에 한 번에 쓴다 (날아오는 화염구처럼 큰 그림을 그때그때 만들어도 가볍게)
  const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  function toCanvas(rows, pal, doc) {
    const d = doc || document;
    const c = d.createElement('canvas');
    c.width = rows[0].length;
    c.height = rows.length;
    const g = c.getContext('2d');
    if (typeof g.createImageData !== 'function') {
      rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === '.' || !pal[ch]) return;
        g.fillStyle = pal[ch];
        g.fillRect(x, y, 1, 1);
      }));
      return c;
    }
    const img = g.createImageData(c.width, c.height);
    const rgb = {};
    for (const [key, value] of Object.entries(pal)) if (/^#[0-9a-f]{6}$/i.test(value)) rgb[key] = rgbOf(value);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const col = rgb[ch];
      if (ch === '.' || !col) return;
      const i = (y * c.width + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }));
    g.putImageData(img, 0, 0);
    return c;
  }

  return {
    GW, GH, MOUTH_FRAC, MOUTH_CELL, FRAMES, TYPES,
    palette, gridSize, mouthCell, specOf, ghastGrid, renderSpec, bodyMask, tentacles, visibleBox,
    materialize, poofFrames, itemGrid, toCanvas,
  };
});
