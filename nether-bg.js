// =============================================================
// 네더 배경 (v3.2.0, 순수 계산 — 보이는 것만, 점수·판정과 상관없음)
//   · 배경은 가스트와 같은 한 칸(텍셀) 크기 P 로 그린다: 텍셀 해상도(화면 ÷ P)의 픽셀 버퍼를 만들고, 게임이 P 배로 늘려 찍는다.
//   · 네더랙은 손으로 그린 8×8 타일 6가지(금·혹·이음매·구멍·덩어리·갈래 금)를 씨앗 난수로 골라 뒤집어 깐다 (매번 같은 배경).
//   · 깊이 세 겹: 먼 동굴 벽(어둡고 흐리고 대비 낮음) → 가운데 기둥·언덕 → 가까운 천장·바닥(대비 높음).
//   · 빛(발광석·용암 웅덩이·용암 폭포)과 가장자리 어둡게는 4×4 바이어 무늬로 계단지게 섞는다 (부드러운 그라데이션 대신 픽셀 그림처럼).
//   · 움직이는 용암(폭포·웅덩이)은 lavaLevel 무늬를 게임이 매 프레임 한 칸씩 밀어 그린다.
//   게임(index.html)에서는 전역 NetherBg 로, 테스트(node)에서는 require 로 쓴다.
// =============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NetherBg = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const TILE = 8;          // 타일 한 변 (텍셀)
  const LAVA_PERIOD = 16;  // 용암 무늬가 되풀이되는 줄 수
  const FALL_W = 6;        // 용암 폭포 폭 (텍셀)
  const POOL_DEPTH = 6;    // 용암 웅덩이 깊이 (텍셀)

  // 네더랙 타일: 0 금·틈(가장 어둠) · 1 그림자 · 2 바탕 · 3 밝은 면 · 4 혹 꼭대기
  const ROCK_TILES = [
    // 혹 (밝은 혹 아래·오른쪽에 그림자)
    ['22332221', '23443122', '22311222', '22222332', '12222431', '22332211', '23431222', '11211121'],
    // 비스듬한 금
    ['22222101', '22322012', '23420122', '22201222', '22012232', '20122341', '21222211', '11121111'],
    // 이음매 (가로로 갈라진 턱: 위는 밝은 모서리, 아래는 틈)
    ['22322221', '22223221', '33333333', '00100010', '12212221', '22222321', '23222222', '11121111'],
    // 구멍 (움푹 팬 자리 둘)
    ['22222221', '21022221', '20132222', '22322121', '22221031', '23222322', '22222221', '11211111'],
    // 덩어리 (왼쪽 위가 튀어나온 돌)
    ['33322221', '34433221', '34333122', '23331122', '21111223', '22222342', '22222111', '11211111'],
    // 갈래 금
    ['22202221', '23201221', '22210022', '22001101', '23122210', '22232221', '23222321', '11121111'],
  ];
  // 발광석 타일: 0 어두운 호박색 · 1 중간 · 2 밝음 · 3 가장 밝음
  const GLOW_TILE = ['12210121', '23321232', '23210121', '12101220', '01012331', '12123321', '23212210', '12101101'];

  // 겹마다 색 (0 ~ 4). 먼 벽은 어둡고 서로 비슷하게(대비 낮음), 가까울수록 밝고 대비가 크다
  const PALETTES = {
    far: ['#1f0d0b', '#25100e', '#2b1210', '#301512', '#361714'],
    hill: ['#250c0a', '#2e0f0c', '#37120e', '#401611', '#491a14'],
    mid: ['#2a0b09', '#36100c', '#431510', '#521b15', '#60221a'],
    ceil: ['#1a0706', '#331210', '#471a16', '#5c231d', '#712e25'],
    near: ['#260a09', '#481916', '#66231f', '#853129', '#a54337'],
    glow: ['#8a5a24', '#c9963c', '#f6d77e', '#fff1a8'],
  };
  // 용암 (어두운 주황 → 흰 노랑)
  const LAVA = ['#b83c10', '#e0601a', '#ff8a1c', '#ff9e2c', '#ffb23a', '#ffd25a', '#fff3b0'];
  const LIGHTS = { glow: [255, 210, 120], pool: [255, 120, 30], fall: [255, 110, 20] };
  const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

  // ---------- 난수 ----------
  function rng(seed) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 정수 두 개 + 씨앗 → 0 ~ 1 (같은 값이면 늘 같다)
  function hash2(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // 부드럽게 오르내리는 1차원 노이즈 (지형 높이용)
  function makeNoise(r) {
    const pts = Array.from({ length: 512 }, () => r());
    return (x) => {
      const i = Math.floor(x), f = x - i;
      const a = pts[((i % 512) + 512) % 512], b = pts[(((i + 1) % 512) + 512) % 512];
      return a + (b - a) * (1 - Math.cos(f * Math.PI)) / 2;
    };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const RGB = Object.fromEntries(Object.entries(PALETTES).map(([k, list]) => [k, list.map(hex)]));
  const LAVA_RGB = LAVA.map(hex);

  // ---------- 타일 ----------
  // 타일 칸 (col, row) 에 깔 타일: 종류 · 좌우·위아래 뒤집기 (겹마다 다르게)
  const LAYER_SALT = { far: 11, hill: 23, mid: 37, ceil: 53, near: 71 };
  function rockTile(col, row, layer, seed) {
    const h = hash2(col, row, seed + (LAYER_SALT[layer] || 0));
    const index = Math.floor(h * ROCK_TILES.length);
    const f = hash2(row, col, seed + 97);
    return { index, flipX: f < 0.5, flipY: f > 0.25 && f < 0.5 }; // 위아래 뒤집기는 가끔만 (밝은 면이 늘 위에 오게)
  }
  // 텍셀 (tx, ty) 의 밝기 단계 0 ~ 4
  function rockLevel(tx, ty, layer, seed) {
    const col = Math.floor(tx / TILE), row = Math.floor(ty / TILE);
    const t = rockTile(col, row, layer, seed);
    let x = tx - col * TILE, y = ty - row * TILE;
    if (t.flipX) x = TILE - 1 - x;
    if (t.flipY) y = TILE - 1 - y;
    return Number(ROCK_TILES[t.index][y][x]);
  }
  // 용암 무늬: 폭 w 의 열 x, 줄 y (LAVA_PERIOD 줄마다 되풀이) → LAVA 번호. 가운데가 밝고 가장자리가 어둡고, 밝은 줄무늬가 섞인다
  function lavaLevel(x, y, w, salt = 0) {
    const yy = ((y % LAVA_PERIOD) + LAVA_PERIOD) % LAVA_PERIOD;
    const edge = Math.min(x, w - 1 - x);
    const base = edge === 0 ? 1 : edge === 1 ? 2 : 3;
    const h = hash2(x + salt * 31, Math.floor(yy / 2), 4242);
    const streak = h > 0.82 ? 2 : h > 0.6 ? 1 : h < 0.12 ? -1 : 0;
    return Math.max(0, Math.min(LAVA.length - 1, base + streak + (edge >= 2 && yy % 8 === (x * 3) % 8 ? 2 : 0)));
  }

  // ---------- 배치 ----------
  // tw·th: 텍셀 수, groundRow: 바닥 줄 (게임의 groundY ÷ P). 돌려주는 값은 모두 텍셀 단위
  function layout({ tw, th, groundRow, seed = 20261016 }) {
    const r = rng(seed);
    const n1 = makeNoise(r), n2 = makeNoise(r), n3 = makeNoise(r), n4 = makeNoise(r);
    const cols = Math.ceil(tw / TILE) + 1;
    // 천장: 타일 열마다 깊이 1 ~ 4 타일
    const ceil = Array.from({ length: cols }, (_, c) => TILE * (1 + Math.floor(n3(c * 0.3) * 3.99)));
    // 바닥: 타일 열마다 바닥 줄 또는 반 타일 아래
    // 가운데 언덕 (텍셀 열마다 높이)
    const hillTop = Array.from({ length: tw }, (_, x) => Math.round(th * 0.66 - n1(x * 0.025) * th * 0.12));
    // 가운데 기둥 3개: 화면 한가운데(가스트가 많이 나는 곳)는 비워 둔다
    const pillars = [[0.07, 0.13], [0.26, 0.32], [0.69, 0.77]].map(([a, b]) => {
      const c0 = Math.floor(lerp(a, b, r()) * cols), w = 2 + Math.floor(r() * 2);
      return { x0: c0 * TILE, x1: (c0 + w) * TILE };
    });
    // 발광석: 천장 아래 매달린 덩어리 (타일 2~3 폭, 1~2 높이)
    const glows = [];
    for (let c = 2; c < cols - 4; c++) {
      if (n4(c * 0.6) > 0.7 && r() < 0.6) {
        const w = 2 + Math.floor(r() * 2), h = 1 + Math.floor(r() * 2);
        glows.push({ c0: c, w, h });
        c += w + 5;
      }
    }
    // 용암 웅덩이 (타일 열 범위) — 웅덩이 자리 바닥은 반 타일 내려가 평평하다
    const poolStart = Math.floor(cols * lerp(0.55, 0.7, r()));
    const pool = { c0: poolStart, c1: poolStart + Math.max(3, Math.floor(cols * 0.12)) };
    const floorTop = Array.from({ length: cols }, (_, c) => groundRow + (c >= pool.c0 && c < pool.c1 ? TILE / 2 : n2(c * 0.3 + 30) > 0.55 ? TILE / 2 : 0));
    // 용암 폭포 2개
    const falls = [0.18, 0.83].map((p) => {
      const c = Math.max(0, Math.min(cols - 1, Math.floor(cols * (p + (r() - 0.5) * 0.08))));
      return { x: c * TILE + 1, w: FALL_W, top: ceil[c], bottom: floorTop[c] + TILE / 2, col: c };
    });
    // 바닥 불 (웅덩이·폭포 자리는 빼고)
    const fires = [];
    for (let c = 0; c < cols; c++) {
      if (c >= pool.c0 - 1 && c < pool.c1 + 1) continue;
      if (falls.some((f) => Math.abs(f.col - c) <= 1)) continue;
      if (r() < 0.09) fires.push({ x: c * TILE + 3, y: floorTop[c], phase: r() * 10 });
    }
    return { tw, th, cols, ceil, floorTop, hillTop, pillars, glows, pool, falls, fires, seed };
  }

  // ---------- 칠하기 ----------
  // 텍셀 (x, y) 이 어느 겹의 몇 단계인지 → [팔레트 이름, 단계] (용암은 ['lava', 번호])
  function texelAt(L, x, y) {
    const c = Math.floor(x / TILE);
    const floorTop = L.floorTop[c], ceil = L.ceil[c];
    if (y >= floorTop) {
      if (c >= L.pool.c0 && c < L.pool.c1 && y < floorTop + POOL_DEPTH) return ['lava', lavaLevel(y - floorTop, x, POOL_DEPTH, 7)]; // 웅덩이는 옆으로 흐른다
      const lv = rockLevel(x, y, 'near', L.seed);
      return ['near', y === floorTop ? Math.min(4, lv + 2) : y === floorTop + 1 ? Math.min(4, lv + 1) : lv]; // 위쪽 가장자리는 용암 빛을 받아 밝게
    }
    if (y < ceil) {
      const lv = rockLevel(x, y, 'ceil', L.seed);
      return ['ceil', y === ceil - 1 ? Math.min(4, lv + 1) : lv]; // 아래 가장자리는 아래(용암)에서 오는 빛
    }
    const g = L.glows.find((gl) => c >= gl.c0 && c < gl.c0 + gl.w && y < L.ceil[c] + gl.h * TILE);
    if (g) {
      const gx = x % TILE, gy = (y - L.ceil[c]) % TILE;
      return ['glow', Number(GLOW_TILE[gy][gx])];
    }
    const p = L.pillars.find((pl) => x >= pl.x0 && x < pl.x1);
    if (p && y < L.hillTop[Math.min(x, L.tw - 1)] + TILE) {
      const lv = rockLevel(x, y, 'mid', L.seed);
      return ['mid', x === p.x0 ? Math.min(4, lv + 1) : x >= p.x1 - 2 ? Math.max(0, lv - 1) : lv]; // 왼쪽 모서리 밝게 · 오른쪽 그늘
    }
    if (y >= L.hillTop[Math.min(x, L.tw - 1)]) {
      const lv = rockLevel(x, y, 'hill', L.seed);
      return ['hill', y === L.hillTop[x] ? Math.min(4, lv + 1) : lv];
    }
    return ['far', rockLevel(x, y, 'far', L.seed)];
  }

  // 빛 세기 0 ~ 1 → 바이어 무늬로 STEPS 단계에 맞춘다 (계단진 빛)
  const LIGHT_STEPS = 10;
  const dither = (a, x, y, steps = LIGHT_STEPS) => Math.floor(clamp01(a) * steps + (BAYER4[y & 3][x & 3] + 0.5) / 16) / steps;

  // 텍셀 (x, y) 에 비치는 빛 [[색, 세기], ...]
  function lightsAt(L, x, y) {
    const out = [];
    const R = L.tw;
    for (const g of L.glows) {
      const gx = (g.c0 + g.w / 2) * TILE, gy = L.ceil[g.c0] + TILE * 2;
      const d = Math.hypot(x - gx, y - gy) / (R * 0.12);
      if (d < 1) out.push([LIGHTS.glow, 0.28 * Math.pow(1 - d, 1.6)]);
    }
    const px = ((L.pool.c0 + L.pool.c1) / 2) * TILE, py = L.floorTop[L.pool.c0];
    const dp = Math.hypot(x - px, y - py) / (R * 0.2);
    if (dp < 1) out.push([LIGHTS.pool, 0.32 * Math.pow(1 - dp, 1.4)]);
    for (const f of L.falls) {
      if (y < f.top || y > f.bottom) continue;
      const d = Math.abs(x - (f.x + f.w / 2)) / (R * 0.09);
      if (d < 1) out.push([LIGHTS.fall, 0.24 * (1 - d)]);
    }
    return out;
  }

  // 배경 전체를 텍셀 버퍼(RGBA)로. 용암 폭포는 비워 두고(게임이 매 프레임 그림) 웅덩이는 처음 모습으로 칠한다
  function paint(L) {
    const { tw, th } = L;
    const data = new Uint8ClampedArray(tw * th * 4);
    const r0 = Math.min(tw, th) * 0.35, r1 = Math.max(tw, th) * 0.75;
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const [layer, lv] = texelAt(L, x, y);
        let [r, g, b] = layer === 'lava' ? LAVA_RGB[lv] : RGB[layer][lv];
        if (layer !== 'lava' && layer !== 'glow') {
          for (const [col, a0] of lightsAt(L, x, y)) {
            const a = dither(a0, x, y);
            r += (col[0] - r) * a; g += (col[1] - g) * a; b += (col[2] - b) * a;
          }
        }
        // 가장자리 어둡게 (화면 가운데에서 멀수록, 계단지게)
        const d = Math.hypot(x - tw / 2, y - th / 2);
        const v = 1 - 0.6 * dither((d - r0) / (r1 - r0), x, y, 16);
        const i = (y * tw + x) * 4;
        data[i] = r * v; data[i + 1] = g * v; data[i + 2] = b * v; data[i + 3] = 255;
      }
    }
    return data;
  }

  // 움직이는 용암 무늬 한 장 (폭 w, 높이 h) → RGBA 버퍼. sideways: 웅덩이처럼 옆으로 흐르는 무늬 (위·아래 가장자리가 어둡다)
  function lavaStrip(w, h, salt = 0, sideways = false) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = LAVA_RGB[sideways ? lavaLevel(y, x, h, salt) : lavaLevel(x, y, w, salt)];
        const i = (y * w + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
    return data;
  }

  return { TILE, LAVA_PERIOD, FALL_W, POOL_DEPTH, ROCK_TILES, GLOW_TILE, PALETTES, LAVA, hash2, rockTile, rockLevel, lavaLevel, layout, texelAt, paint, lavaStrip };
});
