// 실기용 기록 파일(desktop/field-log.js) 점검 — 실행: npm test
//   앱 설정 폴더 logs/ 에 날짜별 파일(play-YYYY-MM-DD.log)로 한 줄씩 남기는지,
//   이상한 값이 와도 줄이 깨지거나 앱이 멈추지 않는지, 크기·보관 기간 제한을 지키는지 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFieldLog, formatLine, fileNameFor, removeOldLogs, cleanEvent, cleanData } = require('../desktop/field-log.js');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ghast-field-log-'));
const at = (y, mo, d, h = 9, mi = 5, s = 7, ms = 30) => new Date(y, mo - 1, d, h, mi, s, ms);
const readLines = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);

test('한 줄 형식: 날짜 시각(밀리초) [출처] 사건 {자료}', () => {
  const line = formatLine(at(2026, 11, 20, 14, 3, 22, 7), '게임', '경기 시작', { 모드: '2인 대결', 시간: 40 });
  assert.equal(line, '2026-11-20 14:03:22.007 [게임] 경기 시작 {"모드":"2인 대결","시간":40}\n');
});

test('자료가 없으면 사건 이름까지만 쓴다', () => {
  assert.equal(formatLine(at(2026, 11, 20), '앱', '앱 끝'), '2026-11-20 09:05:07.030 [앱] 앱 끝\n');
  assert.equal(formatLine(at(2026, 11, 20), '앱', '앱 끝', {}), '2026-11-20 09:05:07.030 [앱] 앱 끝\n');
});

test('사건 이름의 줄바꿈·제어 문자는 빈칸으로, 길면 자른다 (한 사건 = 한 줄)', () => {
  assert.equal(cleanEvent('경기\n끝\t'), '경기 끝');
  assert.equal(cleanEvent('가'.repeat(100)).length, 40);
  assert.equal(cleanEvent(''), '알 수 없음');
  assert.equal(cleanEvent(null), '알 수 없음');
  assert.equal(cleanEvent(42), '42');
});

test('자료: 객체가 아니면 버리고, 순환 참조는 멈추지 않고 표시만, 너무 길면 자른다', () => {
  assert.equal(cleanData('문자열'), '');
  assert.equal(cleanData([1, 2]), '');
  assert.equal(cleanData(null), '');
  const loop = { a: 1 };
  loop.self = loop;
  assert.equal(cleanData(loop), '{"오류":"기록할 수 없는 값"}');
  const long = cleanData({ 내용: 'x'.repeat(5000) });
  assert.ok(long.length <= 2001, `너무 김: ${long.length}`);
  assert.ok(long.endsWith('…'));
  // JSON 안의 줄바꿈은 \n 글자로 바뀌어 한 줄이 유지된다
  assert.ok(!cleanData({ 내용: '첫 줄\n둘째 줄' }).includes('\n'));
});

test('파일 이름은 그 컴퓨터 날짜 기준 play-YYYY-MM-DD.log', () => {
  assert.equal(fileNameFor(at(2026, 1, 5)), 'play-2026-01-05.log');
});

test('write: logs 폴더를 만들고 같은 날 파일에 이어 쓴다', () => {
  const dir = path.join(tempDir(), 'logs');
  const log = createFieldLog({ dir, now: () => at(2026, 11, 20) });
  log.write('앱', '앱 시작', { 버전: '3.2.2' });
  log.write('게임', '경기 시작', { 모드: '2인 대결' });
  const lines = readLines(path.join(dir, 'play-2026-11-20.log'));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /\[앱\] 앱 시작 \{"버전":"3\.2\.2"\}$/);
  assert.match(lines[1], /\[게임\] 경기 시작/);
});

test('write: 날짜가 바뀌면 새 파일에 쓴다', () => {
  const dir = tempDir();
  let now = at(2026, 11, 20, 23, 59, 59);
  const log = createFieldLog({ dir, now: () => now });
  log.write('앱', '하나');
  now = at(2026, 11, 21, 0, 0, 1);
  log.write('앱', '둘');
  assert.equal(readLines(path.join(dir, 'play-2026-11-20.log')).length, 1);
  assert.equal(readLines(path.join(dir, 'play-2026-11-21.log')).length, 1);
});

test('write: 하루 파일이 크기 제한을 넘으면 "기록 멈춤" 한 줄만 남기고 그날은 더 쓰지 않는다', () => {
  const dir = tempDir();
  const log = createFieldLog({ dir, now: () => at(2026, 11, 20), maxBytes: 300 });
  for (let i = 0; i < 20; i += 1) log.write('게임', '방아쇠', { 번호: i });
  const lines = readLines(path.join(dir, 'play-2026-11-20.log'));
  assert.match(lines.at(-1), /기록 멈춤/);
  assert.equal(lines.filter((l) => l.includes('기록 멈춤')).length, 1);
  assert.ok(lines.length < 20);
});

test('write: 앱을 다시 켜도 그날 파일 크기를 이어서 센다', () => {
  const dir = tempDir();
  const opts = { dir, now: () => at(2026, 11, 20), maxBytes: 300 };
  const first = createFieldLog(opts);
  for (let i = 0; i < 4; i += 1) first.write('게임', '방아쇠', { 번호: i });
  const second = createFieldLog(opts);
  for (let i = 0; i < 20; i += 1) second.write('게임', '방아쇠', { 번호: i });
  const size = fs.statSync(path.join(dir, 'play-2026-11-20.log')).size;
  assert.ok(size <= 300 + 200, `크기 제한을 넘음: ${size}`);
});

test('write: 폴더를 만들 수 없어도 예외를 던지지 않는다 (게임이 멈추지 않게)', () => {
  const blocker = path.join(tempDir(), 'file');
  fs.writeFileSync(blocker, 'x');
  const errors = [];
  const log = createFieldLog({ dir: path.join(blocker, 'logs'), now: () => at(2026, 11, 20), onError: (e) => errors.push(e) });
  assert.doesNotThrow(() => { log.write('앱', '앱 시작'); log.write('앱', '또'); });
  assert.equal(errors.length, 1, '실패는 처음 한 번만 알린다');
});

test('removeOldLogs: 보관 기간(일)이 지난 play-*.log 만 지운다', () => {
  const dir = tempDir();
  for (const name of ['play-2026-10-01.log', 'play-2026-10-21.log', 'play-2026-11-20.log', 'note.txt', 'play-bad.log']) {
    fs.writeFileSync(path.join(dir, name), 'x');
  }
  const removed = removeOldLogs(dir, at(2026, 11, 20), 30);
  assert.deepEqual(removed, ['play-2026-10-01.log']);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['note.txt', 'play-2026-10-21.log', 'play-2026-11-20.log', 'play-bad.log']);
});

test('removeOldLogs: 폴더가 없으면 아무것도 하지 않는다', () => {
  assert.deepEqual(removeOldLogs(path.join(tempDir(), 'none'), at(2026, 11, 20), 30), []);
});
