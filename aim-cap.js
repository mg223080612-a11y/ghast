// =============================================================
// 2인 대결·토너먼트 조준 위치 속도 제한 (화면과 상관없는 순수 계산)
//   총마다 조준 위치를 새로 받는 횟수가 다르다 (예: 1P 약 130번/초, 2P 약 40번/초).
//   빠른 총은 조준점이 덜 늦게 따라와서 유리하므로, 총마다 '새 위치를 받은 뒤 gapMs 가 지나야
//   다음 위치를 받는다'. 이미 느린 총은 거의 그대로이고, 빠른 총만 느린 총 수준으로 내려간다.
//   (두 총에 같은 박자를 새로 씌우면 원래 느린 총이 한 번 더 늦어져 오히려 불공평해진다)
//   게임(index.html)에서는 전역 AimCap 으로, 테스트(node)에서는 require 로 쓴다.
// =============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AimCap = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // 하드웨어가 보내는 간격의 흔들림과 게임이 총을 읽는 간격(약 4ms)을 감안한 여유.
  // 여유가 없으면 이미 40번/초인 총도 받는 시점이 한 번씩 밀려 36번/초로 떨어진다 (테스트로 확인)
  const SLACK_MS = 2;
  // 1초에 약 hz 번 → 최소 간격(ms). 0 이하·숫자가 아니면 0 (제한 없음)
  function gapForHz(hz) {
    const n = Number(hz);
    return Number.isFinite(n) && n > 0 ? Math.max(1, 1000 / n - SLACK_MS) : 0;
  }

  // prev: { x, y, at } 지금 쓰는 위치와 그 위치를 받은 시각. 원래 객체는 바꾸지 않고 새 객체를 돌려준다
  function nextCappedAim(prev, rawX, rawY, now, gapMs) {
    const same = prev.x === rawX && prev.y === rawY;
    if (same) return { ...prev };
    if (gapMs > 0 && now - prev.at < gapMs) return { ...prev };
    return { x: rawX, y: rawY, at: now };
  }

  return { gapForHz, nextCappedAim };
});
