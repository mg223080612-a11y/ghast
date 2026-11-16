// 토너먼트 명단 파일 읽기 테스트 — 실행: npm test
// (진짜 학생 이름은 넣지 않는다. 가짜 이름만 쓴다)
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../roster-core.js');

test('한 줄에 한 이름: 빈 줄·앞뒤 공백은 버린다', () => {
  assert.deepEqual(R.parseRoster('판다\n\n  여우 \r\n토끼\n'), ['판다', '여우', '토끼']);
});

test('엑셀 CSV: 첫 줄의 "이름" 칸만 읽고, 맨 앞 BOM 도 지운다', () => {
  const csv = '﻿번호,학년,이름,성별\r\n1,초6,판다,여\r\n2,중2,여우,남\r\n';
  assert.deepEqual(R.parseRoster(csv), ['판다', '여우']);
});

test('엑셀에서 표를 복사해 붙여넣기(탭으로 나뉨)도 "이름" 칸을 찾는다', () => {
  const pasted = '번호\t이름\n1\t판다\n2\t여우';
  assert.deepEqual(R.parseRoster(pasted), ['판다', '여우']);
});

test('이름 칸 하나만 복사하면 첫 줄 "이름" 은 건너뛴다', () => {
  assert.deepEqual(R.parseRoster('이름\n판다\n여우'), ['판다', '여우']);
});

test('따옴표로 감싼 칸도 읽는다', () => {
  assert.deepEqual(R.parseRoster('"번호","이름"\n"1","판다"'), ['판다']);
});

test('이름은 12자까지 자르고, 이름 칸이 빈 줄은 버린다', () => {
  const csv = '이름,메모\n가나다라마바사아자차카타파하,x\n,빈칸\n여우,';
  assert.deepEqual(R.parseRoster(csv), ['가나다라마바사아자차카타', '여우']);
});

test('칸이 여러 개인데 "이름" 칸이 없으면 알려 준다', () => {
  assert.throws(() => R.parseRoster('1,초6,판다\n2,중2,여우'), /이름/);
});

test('이름이 하나도 없으면 알려 준다', () => {
  assert.throws(() => R.parseRoster('\n \n'), /이름이 없어요/);
  assert.throws(() => R.parseRoster('이름\n'), /이름이 없어요/);
});

test('파일 이름에서 명단 제목을 만든다 (확장자 빼고 _ 는 띄어쓰기)', () => {
  assert.equal(R.titleFromFileName('2026-2_캠프_명단.csv'), '2026-2 캠프 명단');
  assert.equal(R.titleFromFileName('반.txt'), '반');
  assert.equal(R.titleFromFileName('.csv'), '명단');
});

test('명단 저장: 새 명단이 맨 앞, 같은 제목은 바꾸고, 원래 목록은 그대로', () => {
  const before = Object.freeze([{ title: 'A', names: ['가'] }, { title: 'B', names: ['나'] }]);
  const after = R.upsertRoster(before, { title: 'B', names: ['다', '라'] });
  assert.deepEqual(after.map((r) => r.title), ['B', 'A']);
  assert.deepEqual(after[0].names, ['다', '라']);
  assert.equal(before[1].names[0], '나');
});

test('명단은 최대 개수까지만 남긴다 (오래된 것부터 빠짐)', () => {
  const list = Array.from({ length: R.MAX_ROSTERS }, (_, i) => ({ title: `T${i}`, names: ['가'] }));
  const after = R.upsertRoster(list, { title: 'new', names: ['나'] });
  assert.equal(after.length, R.MAX_ROSTERS);
  assert.equal(after[0].title, 'new');
  assert.ok(!after.some((r) => r.title === `T${R.MAX_ROSTERS - 1}`));
});

test('명단 지우기는 그 제목만 뺀 새 목록을 돌려준다', () => {
  const list = [{ title: 'A', names: ['가'] }, { title: 'B', names: ['나'] }];
  assert.deepEqual(R.removeRoster(list, 'A'), [{ title: 'B', names: ['나'] }]);
  assert.equal(list.length, 2);
});

test('저장된 데이터가 망가졌으면 올바른 명단만 남긴다', () => {
  assert.deepEqual(R.sanitizeRosters(null), []);
  assert.deepEqual(R.sanitizeRosters('x'), []);
  const raw = [{ title: 'ok', names: ['가', 3, '나'] }, { title: '', names: ['가'] }, { title: 'empty', names: [] }, null];
  assert.deepEqual(R.sanitizeRosters(raw), [{ title: 'ok', names: ['가', '나'] }]);
});

test('따옴표 안의 쉼표·줄바꿈은 한 칸으로 읽는다 (엑셀 CSV)', () => {
  const csv = '번호,주소,이름,메모\n1,"서울, 강남",판다,"첫 줄\n둘째 줄"\n2,"부산",여우,"따옴표 ""안"""';
  assert.deepEqual(R.parseRoster(csv), ['판다', '여우']);
});

test('이름 칸 제목이 "학생 이름"·"이름(한글)" 이어도 찾는다', () => {
  assert.deepEqual(R.parseRoster('학생 이름\n판다\n여우'), ['판다', '여우']);
  assert.deepEqual(R.parseRoster('번호,이름(한글)\n1,판다'), ['판다']);
});
