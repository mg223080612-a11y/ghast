// =============================================================
// 랭킹 규칙 (화면·서버와 상관없는 순수 계산) — 서버(worker.js)와 게임(game.js)이 함께 쓴다
//   · cleanName    닉네임 정리 (제어문자·안 보이는 글자 제거, 12자)
//   · scoreLimit   게임 시작 표부터 걸린 시간으로 받을 수 있는 최대 점수 (한 판 최대 길이 maxPlaySec 를 넘지 않게)
//   · cleanStats   1인 기록전 익명 경기 기록(밸런스 조정용) 정리. 이름은 받지 않는다
//   · changedRules 점수에 영향을 주는 설정 중 기본값과 다른 것 (공개 웹판에서는 이런 판을 랭킹에 올리지 않는다)
//   게임(index.html)에서는 전역 RankRules 로, 서버는 import 로, 테스트(node)는 require 로 쓴다.
// =============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RankRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const NAME_MAX = 12;
  // 제어문자·폭 없는 공백·글자 방향 표시·BOM 등 (roster-core.js 의 cleanCell 과 같은 글자)
  const INVISIBLE = /[\u0000-\u001f\u007f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
  const cleanName = (s) => String(s ?? '').replace(INVISIBLE, '').trim().slice(0, NAME_MAX);

  // lim: limits.json 한 줄 { pointsPerSec, killsPerSec, baseAllow, baseKills, maxPlaySec }
  function scoreLimit(lim, playedMs) {
    const elapsed = Math.max(0, playedMs) / 1000;
    const sec = lim.maxPlaySec ? Math.min(elapsed, lim.maxPlaySec) : elapsed;
    return { maxScore: lim.baseAllow + sec * lim.pointsPerSec, maxKills: lim.baseKills + sec * lim.killsPerSec };
  }

  // 익명 경기 기록: 게임이 보내는 이름 → DB 칸 이름, 최댓값
  const STAT_FIELDS = [
    ['seconds', 'seconds', 3600],
    ['shots', 'shots', 100000],
    ['kills', 'kills', 100000],
    ['deflects', 'deflects', 100000],
    ['hitsTaken', 'hits_taken', 100000],
    ['misses', 'misses', 100000],
    ['escapes', 'escapes', 100000],
    ['level', 'level', 1000],
  ];
  const INPUTS = ['gun', 'touch', 'mouse'];
  const toCount = (v, max) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
  };
  // known: 서버가 확인한 값으로 맞춘다 (통계만 따로 부풀리지 못하게)
  //   kills = 받은 기록의 처치 수, maxSeconds = 표를 받은 뒤 지난 시간(초) — 판 길이는 그보다 길 수 없다
  function cleanStats(raw, known = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const counts = Object.fromEntries(STAT_FIELDS.map(([from, to, max]) => [to, toCount(raw[from], max)]));
    const kills = Number.isFinite(known.kills) ? toCount(known.kills, 100000) : counts.kills;
    const seconds = Number.isFinite(known.maxSeconds) ? Math.min(counts.seconds, toCount(known.maxSeconds, 3600)) : counts.seconds;
    const input = INPUTS.includes(raw.input) ? raw.input : 'other';
    const client = String(raw.client ?? '').replace(/[^A-Za-z0-9 .]/g, '').slice(0, 20);
    return { ...counts, kills, seconds, shots: Math.max(counts.shots, kills), input, client };
  }

  // 익명 기록의 시각은 1시간 단위로 내린다 (같은 점수·같은 밀리초로 랭킹 기록과 바로 이어지지 않게)
  const HOUR_MS = 3_600_000;
  const playHour = (ms) => Math.floor(ms / HOUR_MS) * HOUR_MS;

  // 점수(랭킹)에 영향을 주는 설정. 소리·화질·조준점 모양 같은 것은 넣지 않는다
  const RANKED_RULES = [
    'gameSeconds', 'bonusGaps', 'bonusSeconds', 'killPoints', 'deflectPoints',
    'hitPenalty', 'missPenalty', 'escapePenalty', 'levelSpeedUp', 'difficulty', 'hitPadding', 'ghastScale',
  ];
  // 글자로 저장된 숫자('40')·띄어쓰기만 다른 목록('30,50,70')은 같은 값으로 본다
  const sameValue = (a, b) => {
    if (typeof b === 'number') return Number(a) === b;
    return String(a ?? '').replace(/\s+/g, '') === String(b ?? '').replace(/\s+/g, '');
  };
  function changedRules(settings, defaults) {
    return RANKED_RULES.filter((key) => key in defaults && !sameValue(settings[key], defaults[key]));
  }

  return { cleanName, scoreLimit, cleanStats, playHour, changedRules, RANKED_RULES };
});
