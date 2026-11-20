// =============================================================
// 연사 ON 알아보기 (화면과 상관없는 순수 계산, v3.5.1)
//   총의 연사가 ON 이면 방아쇠를 꾹 당기고 있는 동안 게임패드 방아쇠 신호가 1초에 약 10번 눌림·뗌을 되풀이한다
//   (2026-11-20 실측: 5+스페이스+E 로 켜고 1초씩 당기면 당길 때마다 10~16번).
//   최근 PRESSES 번 누른 시간이 SPAN_MS 안이면(평균 간격 약 112ms 이하, 1초에 약 9번 이상) 연사로 본다.
//   사람이 아주 빨리 당겨도 1초에 7~8번이라 걸리지 않는다. 알아보면 알림을 띄우고 앱에 바로 OFF 를 부탁할 뿐,
//   사격 판정은 바꾸지 않는다 (막는 장치가 아님).
//   게임(index.html)에서는 전역 RapidDetect 로, 테스트(node)에서는 require 로 쓴다.
// =============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RapidDetect = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const PRESSES = 5;
  const SPAN_MS = 450;

  // history: 최근 누른 시각들(ms, 오래된 것부터), now: 이번에 누른 시각 → { history(새 배열), rapid, spanMs }
  function notePress(history, now) {
    const prev = Array.isArray(history) ? history : [];
    if (!Number.isFinite(now)) return { history: prev, rapid: false, spanMs: 0 };
    const next = [...prev, now].slice(-PRESSES);
    const spanMs = next.length >= PRESSES ? now - next[0] : 0;
    const rapid = next.length >= PRESSES && spanMs <= SPAN_MS;
    return { history: next, rapid, spanMs: rapid ? spanMs : 0 };
  }

  return { PRESSES, SPAN_MS, notePress };
});
