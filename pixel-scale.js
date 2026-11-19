// =============================================================
// 픽셀 크기 계산 (v3.2.0, 순수 계산 — 보이는 것만 정한다. 점수·판정과 상관없음)
//   · 화면마다 정수 한 칸 크기 P(px) 하나를 정하고, 모든 가스트·화염구·아이템·배경·효과를 이 칸 크기로 그린다
//     → 종류가 달라도 픽셀 한 칸 크기가 같다 (예전에는 40×50 그림을 2.1~5.7배로 늘려 칸이 3·4px 로 섞였다).
//   · 가스트는 종류마다 칸 수(ghast-art.js gridSize)가 다르고, 그린 크기 = 칸 수 × P 로 고정 (z 와 상관없음).
//   · 판정 상자(Ghast.w·h·hitTest, game-ghasts.js)는 예전 그대로다. 여기서는 같은 식을 따라 계산만 하고,
//     실제로 칠해진 그림(visibleBox)이 언제나 판정 상자 안에 들어가도록 P 와 흔들림 폭을 고른다.
//   게임(index.html)에서는 전역 PixelScale 로, 테스트(node)에서는 require 로 쓴다.
// =============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PixelScale = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // game-ghasts.js 의 Ghast 와 같은 값 (tests/pixel-scale.test.js 가 원본 코드와 같은지 확인한다)
  const GHAST_UNITS = 24;              // Ghast.w = U × 24 × z × 종류 크기 × (가스트 크기 % / 100)
  const GHAST_RATIO = 554 / 440;       // Ghast.h = w × GHAST_H / GHAST_W
  const Z_MIN = 0.82, Z_MAX = 0.98, Z_MEAN = (Z_MIN + Z_MAX) / 2; // Ghast.z = rand(0.82, 0.98)
  const ROUND_SLACK = 0.5;             // 그리는 자리를 정수 px 로 반올림하면 생기는 어긋남 (최대 0.5px)

  // 판정 상자 크기 (Ghast.w · h 와 같은 식). scalePct = ghastScaleNow() (= 설정 % × 난이도 크기)
  function hitSize({ U, z, size, scalePct }) {
    const w = U * GHAST_UNITS * z * size * (scalePct / 100);
    return { w, h: w * GHAST_RATIO };
  }
  // 판정 상자 반 너비·반 높이 (Ghast.hitTest 와 같은 식). padPct = hitPaddingNow()
  function hitHalf({ w, h, padPct }) {
    const pad = padPct / 100;
    return { hw: w * (0.5 + pad), hh: h * (0.5 + pad) };
  }
  // 그림 가운데에서 칠해진 칸 끝까지의 칸 수 (좌우 뒤집기도 생각해 왼쪽·오른쪽 중 큰 쪽)
  function extentCells(cols, rows, box) {
    return {
      x: Math.max(cols / 2 - box.x0, box.x1 - cols / 2),
      y: Math.max(rows / 2 - box.y0, box.y1 - rows / 2),
    };
  }

  // 한 칸 크기 P 고르기.
  //   types: [{ size 종류 크기 배수, cols, rows, box 칠해진 칸 범위, ref 기준(보통 가스트) }]
  //   ① 기준: 보통 가스트의 평균 판정 폭(z 평균)에 칸 수를 맞춘 값 (반올림)
  //   ② 상한: 가장 작은 판정 상자(z 최소)에도 모든 종류의 칠해진 그림이 들어가는 가장 큰 정수 (반올림 어긋남 포함)
  function pickTexel({ U, scalePct, padPct, types }) {
    const ref = types.find((t) => t.ref) || types[0];
    const mean = hitSize({ U, z: Z_MEAN, size: ref.size, scalePct }).w;
    const ideal = Math.round(mean / ref.cols);
    let max = Infinity;
    for (const t of types) {
      const { hw, hh } = hitHalf({ ...hitSize({ U, z: Z_MIN, size: t.size, scalePct }), padPct });
      const ext = extentCells(t.cols, t.rows, t.box);
      max = Math.min(max, Math.floor((hw - ROUND_SLACK) / ext.x), Math.floor((hh - ROUND_SLACK) / ext.y));
    }
    return Math.max(1, Math.min(ideal, max));
  }

  // 가스트 그림을 놓을 자리 (정수 px). cols·rows 는 짝수라 가운데가 정수로 떨어진다.
  //   jx·jy: 흔들림 (P 의 정수 배). 돌려주는 값: { cx, cy 그림 가운데, x, y 왼쪽 위, w, h }
  function placeSprite({ cx, cy, P, cols, rows, jx = 0, jy = 0 }) {
    const w = cols * P, h = rows * P;
    const gx = Math.round(cx) + jx, gy = Math.round(cy) + jy;
    return { cx: gx, cy: gy, x: gx - w / 2, y: gy - h / 2, w, h };
  }
  // 놓은 그림에서 실제로 칠해진 범위 (px). flip = -1 이면 좌우가 뒤집힌다
  function visibleRect(place, box, P, flip = 1) {
    const cols = place.w / P;
    const x0 = flip < 0 ? cols - box.x1 : box.x0, x1 = flip < 0 ? cols - box.x0 : box.x1;
    return { left: place.x + x0 * P, right: place.x + x1 * P, top: place.y + box.y0 * P, bottom: place.y + box.y1 * P };
  }
  // 충전 중 옆으로 떨림: 판정 상자 안에 남는 여유가 한 칸(P) 이상일 때만 1칸, 아니면 떨지 않는다
  function shakeCells({ P, hw, cols, box }) {
    const room = hw - ROUND_SLACK - Math.max(cols / 2 - box.x0, box.x1 - cols / 2) * P;
    return room >= P ? 1 : 0;
  }
  // px 크기에 가장 가까운 짝수 칸 수 (가운데가 정수 px 에 오게 짝수, 최소 min)
  const evenCells = (px, P, min = 2) => Math.max(min, 2 * Math.round(px / (2 * P)));

  return { GHAST_UNITS, GHAST_RATIO, Z_MIN, Z_MAX, Z_MEAN, ROUND_SLACK, hitSize, hitHalf, extentCells, pickTexel, placeSprite, visibleRect, shakeCells, evenCells };
});
