// =============================================================
// 총 연사 상태 읽기 (앱 전용, v3.5.0~) — 수신기 시리얼 응답에서 연사 설정을 읽는 순수 계산 (desktop/gun-mode.js 가 쓴다)
//   XLQ;  → 'XLV:<켬>,<초당 클릭>,…' 연사 설정 조회. 값이 8개로 XgunnerGUI '연사 설정' 항목 수와 같다
//          (켜기 · 초당 클릭 · 당김 한 번의 클릭 수 · 자동 오른쪽 클릭 · 그 지연 · 진동 · 반복 · 그 지연).
//          첫 값 = 켬(0 꺼짐), 둘째 값 = 초당 클릭 — 실측 'XLV:0,10,0,0,50,0,50,1'(접시 사격 M0, 연사 꺼짐·기본 10회)과
//          펌웨어 글로 본 해석이다. 실제 총으로 확인 필요 (2026-11-19)
//   XA:0; → 'XAOK:<0|1>,<초당 클릭>' (3번 옴) 자동 연사 끄기. 펌웨어 글: XA:1,n; 켜기(초당 n) · XA:0; 끄기,
//          속도와 켬/끔은 메모리에만 저장돼 총 전원을 끄면 꺼짐·초당 10회로 돌아간다
// =============================================================
const RAPID_QUERY = 'XLQ;';
const RAPID_OFF = 'XA:0;';

// 줄이 다 왔는지(숫자 뒤에 다른 글자가 왔는지) 보고 읽는다. final 이면 기다림이 끝난 것이라 있는 만큼 읽는다
const XLV_DONE = /XLV:(\d+),(\d+)((?:,\d+)*)(?=[^\d,])/g;
const XLV_ANY = /XLV:(\d+),(\d+)((?:,\d+)*)/g;
const XAOK_DONE = /XAOK:([01]),(\d+)(?=\D)/;
const XAOK_ANY = /XAOK:([01]),(\d+)/;

// 연사 설정 조회 응답 → { on, speed, raw } 또는 null (아직 안 왔거나 없음). 여러 번 왔으면 마지막 것
function readRapidState(text, { final = false } = {}) {
  const matches = [...String(text || '').matchAll(final ? XLV_ANY : XLV_DONE)];
  const m = matches.at(-1);
  if (!m) return null;
  return { on: m[1] !== '0', speed: Number(m[2]), raw: m[0] };
}

// 끄기 응답 → { on, speed, raw } 또는 null
function readRapidAck(text, { final = false } = {}) {
  const m = (final ? XAOK_ANY : XAOK_DONE).exec(String(text || ''));
  if (!m) return null;
  return { on: m[1] === '1', speed: Number(m[2]), raw: m[0] };
}

// 점검 결과: state 'off' 꺼짐 확인 · 'on' 켜져 있는데 끄지 못함 · 'noReply' 두 명령 다 답 없음(펌웨어가 모르는 명령)
//   turnedOff: 켜져 있던 것을 이번에 껐다 (화면에 알릴 때)
function rapidVerdict(before, ack) {
  if (ack) return { state: ack.on ? 'on' : 'off', turnedOff: !!before?.on && !ack.on };
  if (before) return { state: before.on ? 'on' : 'off', turnedOff: false };
  return { state: 'noReply', turnedOff: false };
}

module.exports = { RAPID_QUERY, RAPID_OFF, readRapidState, readRapidAck, rapidVerdict };
