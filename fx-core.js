// =============================================================
// 화면·소리 효과용 순수 계산 (점수·판정과 상관없음 — 보이는 것과 들리는 것만 정한다)
//   · 결과 점수 올라가기(count-up): 0 → 실제 점수까지 보이는 숫자만 바뀐다 (저장되는 점수는 그대로)
//   · 연속 명중(콤보): 'N연속!' 글자와 맞히는 소리 높이만. 점수는 주지 않는다
//   · 레벨에 따라 배경이 달아오르는 정도 (0 ~ 1)
//   · 화염구가 떨어질 자리 표시 고리 (가까워질수록 커지고 진해짐)
//   · 시간이 다 됐을 때: 토너먼트 동점이면 바로 연장전(예전과 같음), 아니면 'TIME UP!' 을 보여 준 뒤 끝낸다
//   · 1P·2P 총소리 음색 (shotVoice)
//   게임(index.html)에서는 전역 FxCore 로, 테스트(node)에서는 require 로 쓴다.
// =============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FxCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const COUNT_UP_SEC = 1;      // 결과 점수가 올라가는 시간
  const TIME_UP_SEC = 1.2;     // 'TIME UP!' 을 보여 주는 시간
  const COMBO_SHOW_FROM = 3;   // 이 수부터 'N연속!' 을 띄운다
  const COMBO_PITCH_MAX = 10;  // 이 수부터는 소리가 더 높아지지 않는다
  const HEAT_MAX_LEVEL = 4;    // 이 레벨에서 배경이 가장 달아오른다

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // t 초 뒤에 보여 줄 점수 (0 에서 final 까지 빠르게 올라가다 천천히 멈춤). 0 이하 점수는 그대로
  function countUpValue(final, t, dur = COUNT_UP_SEC) {
    if (!(final > 0)) return final;
    if (!(dur > 0) || t >= dur) return final;
    return Math.min(final, Math.round(final * easeOutCubic(clamp01(t / dur))));
  }

  // 연속 명중 수: 'hit'(가스트 처치·화염구 반사) → +1, 'miss'(빈 곳)·'hurt'(화염구에 맞음) → 0, 그 밖은 그대로
  function comboAfter(streak, event) {
    if (event === 'hit') return streak + 1;
    if (event === 'miss' || event === 'hurt') return 0;
    return streak;
  }
  const comboLabel = (streak) => (streak >= COMBO_SHOW_FROM ? `${streak}연속!` : '');
  // 맞히는 소리 높이 배수: 연속일수록 조금씩 (최대 약 1.35배)
  const comboPitch = (streak) => 1 + Math.min(Math.max(0, streak), COMBO_PITCH_MAX) * 0.035;

  // 레벨 → 배경 달아오름 0 ~ 1 (Lv.1 은 0, Lv.4 이상은 1)
  const heatOf = (level) => clamp01(((level || 1) - 1) / (HEAT_MAX_LEVEL - 1));
  // 지금 값을 목표 값으로 부드럽게 (1초에 rate 만큼)
  function approach(current, target, dt, rate = 0.5) {
    const step = rate * dt;
    return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
  }

  // 화염구가 날아간 정도 p (0 ~ 1) → 떨어질 자리 고리의 { alpha, scale }. 처음 15% 동안은 안 보인다
  function impactRing(p) {
    const k = clamp01((p - 0.15) / 0.85);
    return { alpha: 0.75 * Math.pow(k, 1.4), scale: 0.45 + 0.55 * k };
  }

  // 시간이 다 됐을 때 할 일: 'overtime' 바로 연장전 / 'timeup' TIME UP! 을 보여 준 뒤 끝냄
  const timeUpPlan = (mode, tied) => (mode === 'tournament' && tied ? 'overtime' : 'timeup');

  // ---------- 픽셀 효과용 격자 ----------
  // 효과(금·고리·그을음·꺾쇠)를 그리는 한 칸 크기 (px). 화면 단위 U 의 절반, 최소 2px
  const pixelCell = (U) => Math.max(2, Math.round(U * 0.5));
  // 두 칸 사이의 계단식 직선 (브레젠험). 끝 칸 포함, 칸마다 [x, y]
  function gridLine(x0, y0, x1, y1) {
    const pts = [];
    let x = Math.round(x0), y = Math.round(y0);
    const tx = Math.round(x1), ty = Math.round(y1);
    const dx = Math.abs(tx - x), dy = -Math.abs(ty - y);
    const sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      pts.push([x, y]);
      if (x === tx && y === ty) return pts;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  // 반지름 r 칸 원의 둘레 칸 (가운데 0,0 기준, 겹치는 칸 없이). 중점 원 알고리즘
  function gridCircle(r) {
    const R = Math.max(0, Math.round(r));
    if (R === 0) return [[0, 0]];
    const seen = new Set(), pts = [];
    const add = (x, y) => { const k = `${x},${y}`; if (!seen.has(k)) { seen.add(k); pts.push([x, y]); } };
    let x = R, y = 0, d = 1 - R;
    while (y <= x) {
      for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) add(a, b);
      y++;
      if (d < 0) d += 2 * y + 1;
      else { x--; d += 2 * (y - x) + 1; }
    }
    return pts;
  }
  // 충전 경고 꺾쇠 색: 처음부터 밝은 빨강 → 노랑 → 끝에 거의 흰색 (p 0 ~ 1)
  const CUE_STOPS = [[0, [255, 90, 58]], [0.6, [255, 210, 58]], [1, [255, 248, 220]]];
  function chargeCueColor(p) {
    const t = clamp01(p);
    const i = t <= CUE_STOPS[1][0] ? 0 : 1;
    const [t0, c0] = CUE_STOPS[i], [t1, c1] = CUE_STOPS[i + 1];
    const k = (t - t0) / (t1 - t0);
    return `#${c0.map((v, j) => Math.round(v + (c1[j] - v) * k).toString(16).padStart(2, '0')).join('')}`;
  }

  // 1P·2P 총소리(맞힘·빗나감·반사) 음색 (v3.6.0). 2P 는 낮고(×0.6) 거친 톱니파·낮은 잡음으로 1P 와 귀로 바로 구분되게.
  //   1P 는 예전 소리 그대로. 자리를 모르면 1P. 늘 새 객체를 돌려준다
  const SHOT_VOICES = [
    { pitch: 1, wave: 'square', noiseFreq: 2000 },
    { pitch: 0.6, wave: 'sawtooth', noiseFreq: 800 },
  ];
  function shotVoice(who) {
    return { ...(SHOT_VOICES[who] || SHOT_VOICES[0]) };
  }

  return {
    COUNT_UP_SEC, TIME_UP_SEC, COMBO_SHOW_FROM,
    countUpValue, comboAfter, comboLabel, comboPitch, heatOf, approach, impactRing, timeUpPlan,
    pixelCell, gridLine, gridCircle, chargeCueColor, shotVoice,
  };
});
