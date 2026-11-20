// 화면·소리 효과 계산(fx-core.js) 테스트 — 실행: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Fx = require('../fx-core.js');

test('결과 점수는 0 에서 시작해 1초 뒤 실제 점수가 되고, 중간에는 넘치지 않고 늘기만 한다', () => {
  assert.equal(Fx.countUpValue(120, 0), 0);
  assert.equal(Fx.countUpValue(120, Fx.COUNT_UP_SEC), 120);
  assert.equal(Fx.countUpValue(120, 5), 120);
  let prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const v = Fx.countUpValue(120, t);
    assert.ok(Number.isInteger(v) && v >= prev && v <= 120, `t=${t} → ${v}`);
    prev = v;
  }
});

test('0점·음수·이상한 값은 올라가지 않고 그대로', () => {
  assert.equal(Fx.countUpValue(0, 0.3), 0);
  assert.equal(Fx.countUpValue(-3, 0.3), -3);
  assert.equal(Fx.countUpValue(50, 0.3, 0), 50);
});

test('연속 명중: 맞히면 +1, 빈 곳·피격이면 0, 그 밖은 그대로. 3번부터 글자', () => {
  let n = 0;
  for (let i = 0; i < 3; i++) n = Fx.comboAfter(n, 'hit');
  assert.equal(n, 3);
  assert.equal(Fx.comboLabel(n), '3연속!');
  assert.equal(Fx.comboLabel(2), '');
  assert.equal(Fx.comboAfter(n, 'late'), 3);
  assert.equal(Fx.comboAfter(n, 'miss'), 0);
  assert.equal(Fx.comboAfter(n, 'hurt'), 0);
});

test('연속일수록 맞히는 소리가 조금 높아지고 10번에서 멈춘다', () => {
  assert.equal(Fx.comboPitch(0), 1);
  assert.ok(Fx.comboPitch(5) > Fx.comboPitch(1));
  assert.equal(Fx.comboPitch(10), Fx.comboPitch(30));
  assert.ok(Fx.comboPitch(30) < 1.5);
});

test('배경 달아오름: Lv.1 은 0, Lv.4 이상 1, 목표로 천천히 다가간다', () => {
  assert.equal(Fx.heatOf(1), 0);
  assert.equal(Fx.heatOf(undefined), 0);
  assert.ok(Fx.heatOf(2) > 0 && Fx.heatOf(2) < Fx.heatOf(3));
  assert.equal(Fx.heatOf(4), 1);
  assert.equal(Fx.heatOf(9), 1);
  assert.equal(Fx.approach(0, 1, 0.1, 0.5), 0.05);
  assert.equal(Fx.approach(0.98, 1, 1, 0.5), 1);
  assert.equal(Fx.approach(1, 0, 0.5, 0.5), 0.75);
});

test('화염구 떨어질 자리 고리: 처음엔 안 보이고, 가까워질수록 진하고 커진다', () => {
  assert.equal(Fx.impactRing(0).alpha, 0);
  assert.equal(Fx.impactRing(0.1).alpha, 0);
  const mid = Fx.impactRing(0.6), end = Fx.impactRing(1);
  assert.ok(mid.alpha > 0 && mid.alpha < end.alpha);
  assert.ok(mid.scale < end.scale);
  assert.equal(end.scale, 1);
});

test('시간이 다 됐을 때: 토너먼트 동점만 바로 연장전, 나머지는 TIME UP', () => {
  assert.equal(Fx.timeUpPlan('tournament', true), 'overtime');
  assert.equal(Fx.timeUpPlan('tournament', false), 'timeup');
  assert.equal(Fx.timeUpPlan('versus', true), 'timeup');
  assert.equal(Fx.timeUpPlan('solo', false), 'timeup');
});

test('픽셀 효과 한 칸은 U 의 절반(반올림), 최소 2px', () => {
  assert.equal(Fx.pixelCell(10.8), 5);
  assert.equal(Fx.pixelCell(7.2), 4);
  assert.equal(Fx.pixelCell(2), 2);
});

test('계단식 직선(브레젠험): 끝 칸 포함, 칸마다 한 칸씩만 이동', () => {
  assert.deepEqual(Fx.gridLine(0, 0, 3, 0), [[0, 0], [1, 0], [2, 0], [3, 0]]);
  assert.deepEqual(Fx.gridLine(0, 0, 0, 0), [[0, 0]]);
  const line = Fx.gridLine(0, 0, 7, -3);
  assert.deepEqual(line[0], [0, 0]);
  assert.deepEqual(line.at(-1), [7, -3]);
  line.slice(1).forEach(([x, y], i) => {
    assert.ok(Math.abs(x - line[i][0]) <= 1 && Math.abs(y - line[i][1]) <= 1);
  });
  assert.equal(line.length, 8); // 긴 쪽 칸 수 + 1
});

test('격자 원: 겹치는 칸 없이, 모든 칸이 반지름에서 1칸 안쪽', () => {
  for (const r of [1, 3, 10, 25]) {
    const pts = Fx.gridCircle(r);
    assert.equal(new Set(pts.map((p) => p.join(','))).size, pts.length);
    for (const [x, y] of pts) assert.ok(Math.abs(Math.hypot(x, y) - r) < 1, `r=${r} (${x},${y})`);
    assert.ok(pts.some(([x, y]) => x === r && y === 0) && pts.some(([x, y]) => x === 0 && y === -r));
  }
  assert.deepEqual(Fx.gridCircle(0), [[0, 0]]);
});

test('충전 꺾쇠 색: 처음부터 밝은 빨강, 중간 노랑, 끝은 거의 흰색', () => {
  assert.equal(Fx.chargeCueColor(0), '#ff5a3a');
  assert.equal(Fx.chargeCueColor(0.6), '#ffd23a');
  assert.equal(Fx.chargeCueColor(1), '#fff8dc');
  assert.equal(Fx.chargeCueColor(-1), '#ff5a3a');
  assert.equal(Fx.chargeCueColor(2), '#fff8dc');
  assert.match(Fx.chargeCueColor(0.3), /^#[0-9a-f]{6}$/);
});

// 1P·2P 총소리 구분 (v3.6.0, 11-20 TV 실기 교사: "1P,2P의 총 소리가 똑같아서 헷갈린다")
test('1P·2P 총소리 음색이 다르다 (높이·파형·잡음 대역)', () => {
  const p1 = Fx.shotVoice(0), p2 = Fx.shotVoice(1);
  assert.notEqual(p1.pitch, p2.pitch);
  assert.notEqual(p1.wave, p2.wave);
  assert.notEqual(p1.noiseFreq, p2.noiseFreq);
  assert.ok(p2.pitch < p1.pitch * 0.75, '2P 는 1P 보다 확실히 낮게 (반음 몇 개가 아니라 귀로 바로 구분되게)');
});

test('1P 총소리는 예전 소리 그대로 (1인 기록전·메뉴도 1P 소리)', () => {
  assert.deepEqual(Fx.shotVoice(0), { pitch: 1, wave: 'square', noiseFreq: 2000 });
});

test('자리를 모르면 1P 소리, 돌려준 값을 바꿔도 다음 값은 그대로', () => {
  assert.deepEqual(Fx.shotVoice(undefined), Fx.shotVoice(0));
  assert.deepEqual(Fx.shotVoice(7), Fx.shotVoice(0));
  assert.deepEqual(Fx.shotVoice(-1), Fx.shotVoice(0));
  const v = Fx.shotVoice(1);
  v.pitch = 99;
  assert.notEqual(Fx.shotVoice(1).pitch, 99);
});
