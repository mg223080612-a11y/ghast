// =============================================================
// 연사 차단 (화면과 상관없는 순수 계산)
//   엑스거너의 연사(Rapid Fire)는 방아쇠 한 번에 클릭을 사람 손으로는 불가능한 속도로 여러 번 보낸다.
//   총(입력)마다 클릭 간격을 보고, 기계처럼 빠른 클릭은 점수 없이 버린다.
//    · 0.08초 안에 또 들어온 클릭 → 연사
//    · 0.14초 안쪽 간격으로 세 번째가 들어오면 → 연사
//   연사가 감지되면 그 총은 1.5초 동안 잠긴다. 잠긴 동안 또 기계처럼 빠른 클릭이 오면(연사를 계속 당김)
//   잠금이 계속 늘어나 한 발도 들어가지 않는다. 연사를 끄고 보통 속도로 쏘면 잠금이 늘지 않아 곧 다시 쏠 수 있다.
//   사람이 빠르게 연타하는 정도(0.15초 이상 간격)는 처음부터 연사로 보지 않는다.
//   lockStarted: 이번 발로 잠금이 '새로' 시작됨 → 게임은 이때 한 번만 '연사 차단' 을 알린다
//   게임(index.html)에서는 전역 FireGate 로, 테스트(node)에서는 require 로 쓴다.
// =============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FireGate = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_GAP_MS = 80, STREAK_GAP_MS = 140, LOCK_MS = 1500;

  const initial = () => ({ last: -1e9, quick: 0, lockUntil: 0 });

  // state: { last, quick, lockUntil }. 원래 객체는 바꾸지 않고 { state, allowed, lockStarted } 를 돌려준다
  function next(state, now) {
    const gap = now - state.last;
    const machineFast = gap < STREAK_GAP_MS;
    const base = { ...state, last: now };
    const lock = () => ({ state: { ...base, lockUntil: now + LOCK_MS, quick: 0 }, allowed: false, lockStarted: true });
    if (now < state.lockUntil) {
      // 잠긴 동안 또 기계처럼 빠른 클릭 → 잠금 연장 (알림은 다시 하지 않음)
      const s = machineFast ? { ...base, lockUntil: now + LOCK_MS } : base;
      return { state: s, allowed: false, lockStarted: false };
    }
    if (gap < MIN_GAP_MS) return lock();
    if (!machineFast) return { state: { ...base, quick: 0 }, allowed: true, lockStarted: false };
    const quick = base.quick + 1;
    if (quick >= 2) return lock();
    return { state: { ...base, quick }, allowed: true, lockStarted: false };
  }

  return { initial, next, LOCK_MS };
});
