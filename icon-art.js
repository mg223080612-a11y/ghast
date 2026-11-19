// =============================================================
// 처음 화면 카드용 작은 가스트 아이콘 (v3.2.0)
//   게임 그림(40×50 등)을 카드 크기로 줄이면 한 칸이 1.5px 쯤이 되어 얼굴이 뭉개진다.
//   그래서 카드에는 따로 만든 작은 그림(12×14 ~ 18×20 칸)을 정수 배로 늘려 그린다.
//   종류마다 칸 수가 달라 같은 배율로 그려도 크기 차이(아기 < 황금 < 보통·분노 < 큰)가 보인다.
//   그리는 법은 게임 그림과 같다 (ghast-art.js 의 renderSpec: 3단 음영 · 하이라이트 · 8방향 테두리 · S자 촉수).
//   게임(index.html)에서는 전역 IconArt 로, 테스트(node)에서는 require 로 쓴다.
// =============================================================
(function (root, factory) {
  const art = typeof module === 'object' && module.exports ? require('./ghast-art.js') : root.GhastArt;
  const api = factory(art);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IconArt = api;
})(typeof self !== 'undefined' ? self : this, function (GhastArt) {
  const TYPES = ['normal', 'small', 'big', 'angry', 'gold'];
  // 얼굴: 가까운 눈(오른쪽) · 먼 눈(왼쪽) · 입 — 아이콘은 충전 얼굴이 없다
  const ICON_SPECS = {
    normal: {
      grid: [16, 18],
      body: { cx: 8, cy: 6.5, rx: 7, ryTop: 5.5, n: 2.4, bottom: 11, shadeBottom: 12, round: 0, corner: 2.5, hl: [4.5, 3.2], hlR: [1.2, 0.9] },
      hem: [[4, 1.2, 1], [8.5, 1.5, 1]],
      tentacles: { xs: [3, 8, 12], lens: [4, 6, 3], curl: [-1, -1, 1], thin: true, amp: 1, wave: 5 },
      face: {
        near: { at: [6, 5], rows: ['ee', 'we', 'ee'] },
        far: { at: [2, 5], rows: ['e', 'e', 'e'] },
        mouth: { at: [2, 9], rows: ['kk', 'kk'] },
      },
    },
    small: {
      grid: [12, 14],
      body: { cx: 6, cy: 6, rx: 5, ryTop: 4.5, n: 2, bottom: 9, shadeBottom: 10, round: 0.5, corner: 0, hl: [3.5, 3.5], hlR: [1, 0.8] },
      hem: [[4, 1, 1], [8, 1, 1]],
      tentacles: { xs: [3, 6, 9], lens: [3, 4, 2], curl: [-1, -1, 1], thin: true, amp: 0.8, wave: 4 },
      crown: { at: [5, 0], rows: ['X.', '.x'] },
      face: {
        near: { at: [5, 4], rows: ['ee', 'we', 'ee'] },
        far: { at: [2, 4], rows: ['e', 'e', 'e'] },
        mouth: { at: [2, 8], rows: ['k'] },
        cheeks: [{ at: [5, 7], rows: ['c'] }],
      },
    },
    big: {
      grid: [18, 20],
      body: { cx: 9, cy: 7, rx: 8, ryTop: 5.5, n: 3.2, bottom: 13, round: 0, corner: 3.5, hlR: [1.3, 1] },
      hem: [[5, 1.2, 1], [10, 1.5, 1]],
      tentacles: { xs: [4, 8, 13], lens: [5, 4, 6], curl: [-1, -1, 1], thin: true, amp: 1, wave: 6 },
      face: {
        near: { at: [6, 6], rows: ['bbb', 'eee', '.e.'] },
        far: { at: [2, 6], rows: ['bb', 'ee'] },
        mouth: { at: [2, 10], rows: ['kkkk', 'ktkk'] },
        marks: [{ at: [12, 3], rows: ['q.', 'qq'] }, { at: [14, 8], rows: ['q', 'q'] }],
      },
    },
    angry: {
      grid: [16, 18],
      body: { cx: 8, cy: 7.5, rx: 7, ryTop: 4.5, n: 2.6, bottom: 11, shadeBottom: 12, round: 0, corner: 2.5, hl: [5, 5], hlR: [1.2, 0.8] },
      hem: [[5, 1.2, 1], [10.5, 1.5, 1]],
      tentacles: { xs: [3, 8, 12], lens: [5, 6, 3], curl: [-1, -1, 1], thin: true, amp: 1.2, wave: 4 },
      horns: [{ x: 4, h: 3, base: 0.5 }, { x: 8, h: 4, base: 0.5 }, { x: 12, h: 3, base: 0.5 }],
      face: {
        near: { at: [6, 5], rows: ['.b', 'ry', 'ry'] },
        far: { at: [2, 5], rows: ['b.', 'r', 'y'] },
        mouth: { at: [2, 9], rows: ['kkk', 't.t'] },
      },
    },
    gold: {
      grid: [14, 16],
      body: { cx: 7, cy: 7, rx: 6, ryTop: 4.5, n: 2.2, bottom: 10, shadeBottom: 11, round: 0.2, corner: 2, hlR: [1, 0.8] },
      hem: [[4.5, 1, 1], [9, 1.2, 1]],
      tentacles: { xs: [3, 7, 10], lens: [4, 5, 3], curl: [-1, -1, 1], thin: true, amp: 1, wave: 5 },
      crown: { at: [4, 0], rows: ['x.x.x', 'xxgxx', 'XXXXX'] },
      face: {
        near: { at: [6, 5], rows: ['ee', 'we', 'ee'] },
        far: { at: [2, 5], rows: ['e', 'e', 'e'] },
        mouth: { at: [2, 9], rows: ['k.k', '.k.'] },
        marks: [{ at: [9, 6], rows: ['.s.', 'sss', '.s.'] }],
      },
    },
  };
  const FIREBALL_CELLS = 14; // 화염구 아이콘 칸 수

  const iconSize = (type) => { const [cols, rows] = (ICON_SPECS[type] || ICON_SPECS.normal).grid; return { cols, rows }; };
  // type 아이콘 그림 (글자 줄 배열). 색은 게임 그림과 같다 (GhastArt.palette)
  const iconGrid = (type) => GhastArt.renderSpec(ICON_SPECS[type] || ICON_SPECS.normal, { frame: 0 });
  const iconPalette = (type) => GhastArt.palette(ICON_SPECS[type] ? type : 'normal');
  const fireballIcon = () => GhastArt.itemGrid('fireball', { size: FIREBALL_CELLS });
  // 카드 그림 높이(px)에 맞는 정수 배율 — 가장 큰 아이콘(큰 가스트) 줄 수 기준이라 모든 카드가 같은 배율
  const MAX_ROWS = Math.max(...TYPES.map((t) => iconSize(t).rows));
  const iconScale = (heightPx) => Math.max(1, Math.round(heightPx / MAX_ROWS));

  return { TYPES, FIREBALL_CELLS, iconSize, iconGrid, iconPalette, fireballIcon, iconScale };
});
