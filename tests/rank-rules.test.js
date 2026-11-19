// 랭킹 규칙(rank-rules.js) 테스트 — 실행: npm test
//   서버(worker.js)와 게임(game.js)이 함께 쓰는 순수 계산: 이름 정리 · 점수 상한 · 익명 경기 기록 정리 · 규칙 바꾼 판 확인
const test = require('node:test');
const assert = require('node:assert/strict');
const RankRules = require('../rank-rules.js');
const LIMITS = require('../limits.json');

test('이름: 제어문자·안 보이는 글자를 빼고 12자까지', () => {
  assert.equal(RankRules.cleanName('  판다​곰  '), '판다곰');
  assert.equal(RankRules.cleanName('‮‍﻿'), '');
  assert.equal(RankRules.cleanName('가'.repeat(20)), '가'.repeat(12));
  assert.equal(RankRules.cleanName(null), '');
});

test('점수 상한: 걸린 시간에 비례하지만 maxPlaySec 를 넘지 않는다 (오래 묵힌 표로 큰 점수 막기)', () => {
  const lim = { pointsPerSec: 40, killsPerSec: 12, baseAllow: 100, baseKills: 20, maxPlaySec: 600 };
  assert.deepEqual(RankRules.scoreLimit(lim, 60_000), { maxScore: 100 + 60 * 40, maxKills: 20 + 60 * 12 });
  const week = RankRules.scoreLimit(lim, 7 * 86_400_000);
  assert.deepEqual(week, { maxScore: 100 + 600 * 40, maxKills: 20 + 600 * 12 });
});

test('점수 상한: maxPlaySec 가 없으면(null) 걸린 시간 그대로', () => {
  const lim = { pointsPerSec: 40, killsPerSec: 12, baseAllow: 100, baseKills: 20, maxPlaySec: null };
  assert.equal(RankRules.scoreLimit(lim, 1_000_000).maxScore, 100 + 1000 * 40);
});

test('limits.json: 가스트 세 난이도 모두 한 판 최대 600초', () => {
  for (const key of ['ghast', 'ghasteasy', 'ghasthard']) assert.equal(LIMITS[key].maxPlaySec, 600, key);
});

test('익명 기록: 숫자 칸은 0 이상 정수로, 범위를 넘으면 잘라 내고, 모르는 칸·이름은 버린다', () => {
  const stats = RankRules.cleanStats({
    seconds: 61.6, shots: 120, kills: 40, deflects: 9, hitsTaken: 3, misses: 12, escapes: 5, level: 4,
    input: 'gun', client: 'app 2.2.10', name: '판다', extra: 1,
  });
  assert.deepEqual(stats, {
    seconds: 62, shots: 120, kills: 40, deflects: 9, hits_taken: 3, misses: 12, escapes: 5, level: 4,
    input: 'gun', client: 'app 2.2.10',
  });
  assert.equal(RankRules.cleanStats({ seconds: 99_999 }).seconds, 3600);
  assert.equal(RankRules.cleanStats({ shots: -5 }).shots, 0);
});

test('익명 기록: 처치 수는 서버가 받은 기록의 값, 판 길이는 표를 받은 뒤 지난 시간을 넘지 않음, 쏜 수 ≥ 처치 수', () => {
  const s = RankRules.cleanStats({ seconds: 3000, shots: 1, kills: 999 }, { kills: 40, maxSeconds: 75.4 });
  assert.equal(s.kills, 40);
  assert.equal(s.seconds, 75);
  assert.equal(s.shots, 40);
});

test('익명 기록 시각: 랭킹 기록과 바로 이어지지 않게 1시간 단위로 내림', () => {
  assert.equal(RankRules.playHour(Date.UTC(2026, 10, 19, 5, 42, 13, 507)), Date.UTC(2026, 10, 19, 5));
});

test('익명 기록: 모르는 입력 방식은 other, client 는 영문·숫자·공백·점만 20자', () => {
  const s = RankRules.cleanStats({ input: '<script>', client: 'web<b>🙂'.repeat(5) });
  assert.equal(s.input, 'other');
  assert.match(s.client, /^[A-Za-z0-9 .]{0,20}$/);
});

test('익명 기록: 객체가 아니면 null (기록은 그대로 받고 통계만 안 남김)', () => {
  assert.equal(RankRules.cleanStats(undefined), null);
  assert.equal(RankRules.cleanStats('x'), null);
  assert.equal(RankRules.cleanStats([1, 2]), null);
});

test('규칙 바꾼 판: 점수에 영향을 주는 설정이 기본값과 다르면 그 이름들을 돌려준다', () => {
  const defaults = { gameSeconds: 40, bonusGaps: '30, 50, 70', killPoints: 2, volume: 0.8, hitPadding: 15 };
  assert.deepEqual(RankRules.changedRules({ ...defaults }, defaults), []);
  assert.deepEqual(RankRules.changedRules({ ...defaults, volume: 0.2 }, defaults), []);
  assert.deepEqual(RankRules.changedRules({ ...defaults, gameSeconds: 90, hitPadding: 40 }, defaults), ['gameSeconds', 'hitPadding']);
});

test('규칙 바꾼 판: 숫자를 글자로 저장했어도 같은 값이면 바뀐 것이 아니다', () => {
  const defaults = { gameSeconds: 40, bonusGaps: '30, 50, 70' };
  assert.deepEqual(RankRules.changedRules({ gameSeconds: '40', bonusGaps: '30,50,70' }, defaults), []);
});
