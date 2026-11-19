// 총 연사 상태 읽기(desktop/rapid-fire.js) 점검 — 실행: npm test
//   수신기 시리얼로 받은 글자에서 연사 설정(XLV)·끄기 응답(XAOK)을 읽고, 점검 결과를 정하는 순수 계산.
//   실측(접시 사격 M0, 2026-11-13): XLQ; → 'XLV:0,10,0,0,50,0,50,1' (연사 꺼짐). 응답 형식은 펌웨어 글(XA:…/XAOK:…).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readRapidState, readRapidAck, rapidVerdict, RAPID_QUERY, RAPID_OFF } = require('../desktop/rapid-fire.js');

test('보내는 명령: 연사 설정 조회 XLQ; · 자동 연사 끄기 XA:0;', () => {
  assert.equal(RAPID_QUERY, 'XLQ;');
  assert.equal(RAPID_OFF, 'XA:0;');
});

test('XLV: 첫 값 = 연사 켬(0 꺼짐), 둘째 값 = 초당 클릭 수', () => {
  assert.deepEqual(readRapidState('XLV:0,10,0,0,50,0,50,1\r\n'), { on: false, speed: 10, raw: 'XLV:0,10,0,0,50,0,50,1' });
  assert.deepEqual(readRapidState('XLV:1,15,0,0,50,0,50,1;'), { on: true, speed: 15, raw: 'XLV:1,15,0,0,50,0,50,1' });
});

test('XLV: 앞에 다른 응답이 섞여 있어도 XLV 줄만 읽는다', () => {
  assert.equal(readRapidState('XV:85,30,300,200,0,0,20,1100\r\nXLV:1,10,0,0,50,0,50,1\r\n').on, true);
});

test('XLV: 줄이 덜 왔으면(끝 글자 없음) 기다린다, 마지막 읽기(final)에서는 있는 만큼 읽는다', () => {
  assert.equal(readRapidState('XLV:1,1'), null);
  assert.deepEqual(readRapidState('XLV:1,1', { final: true }), { on: true, speed: 1, raw: 'XLV:1,1' });
});

test('XLV 가 없으면 null', () => {
  assert.equal(readRapidState('XV:85,30,300,200'), null);
  assert.equal(readRapidState('', { final: true }), null);
});

test('XAOK: 끄기 응답(3번 옴)에서 켬/끔과 속도를 읽는다', () => {
  assert.deepEqual(readRapidAck('XAOK:0,10\r\nXAOK:0,10\r\nXAOK:0,10\r\n'), { on: false, speed: 10, raw: 'XAOK:0,10' });
  assert.equal(readRapidAck('XAOK:0,1'), null, '속도 숫자가 덜 왔을 수 있다');
  assert.deepEqual(readRapidAck('XAOK:1,15', { final: true }), { on: true, speed: 15, raw: 'XAOK:1,15' });
  assert.equal(readRapidAck('XA:0;'), null);
});

test('점검 결과: 켜져 있다가 끔 → off + turnedOff', () => {
  const on = { on: true, speed: 10 }, off = { on: false, speed: 10 };
  assert.deepEqual(rapidVerdict(on, off), { state: 'off', turnedOff: true });
  assert.deepEqual(rapidVerdict(off, off), { state: 'off', turnedOff: false });
  assert.deepEqual(rapidVerdict(null, off), { state: 'off', turnedOff: false });
});

test('점검 결과: 끄기 응답이 없으면 조회 결과대로 (켜져 있으면 on = 끄지 못함)', () => {
  assert.deepEqual(rapidVerdict({ on: true, speed: 10 }, null), { state: 'on', turnedOff: false });
  assert.deepEqual(rapidVerdict({ on: false, speed: 10 }, null), { state: 'off', turnedOff: false });
});

test('점검 결과: 둘 다 응답이 없으면 noReply (펌웨어가 모르는 명령)', () => {
  assert.deepEqual(rapidVerdict(null, null), { state: 'noReply', turnedOff: false });
});

test('점검 결과: 끄기를 보냈는데 아직 켜짐이라고 답하면 on', () => {
  assert.deepEqual(rapidVerdict({ on: true, speed: 10 }, { on: true, speed: 10 }), { state: 'on', turnedOff: false });
});
