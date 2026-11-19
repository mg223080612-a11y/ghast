// =============================================================
// 실기용 기록 파일 (앱 전용, v3.2.2~)
//   행사장에서 무슨 일이 있었는지 나중에 볼 수 있게, 앱 설정 폴더의 logs/ 에 날짜별 파일로 한 줄씩 남긴다.
//     맥:     ~/Library/Application Support/가스트 사격 3/logs/play-YYYY-MM-DD.log
//     윈도우: %APPDATA%\가스트 사격 3\logs\play-YYYY-MM-DD.log
//   한 줄 = '날짜 시각.밀리초 [출처] 사건 {자료 JSON}'. 출처는 '앱'(desktop/main.js) 또는 '게임'(게임 화면).
//   이름(닉네임·명단)은 적지 않는다 — 부르는 쪽이 이름 없는 자료만 넘긴다.
//   기록이 실패해도 게임은 멈추지 않는다(처음 실패 한 번만 알림). 하루 5MB 를 넘으면 그날은 그만 적고,
//   30일 지난 파일은 앱을 켤 때 지운다.
// =============================================================
const fs = require('fs');
const path = require('path');

const MAX_BYTES_PER_DAY = 5 * 1024 * 1024;
const KEEP_DAYS = 30;
const MAX_EVENT_CHARS = 40;
const MAX_DATA_CHARS = 2000;
const LOG_FILE = /^play-(\d{4}-\d{2}-\d{2})\.log$/;
// 줄을 나누는 글자(줄바꿈·탭 등 제어 문자, 유니코드 줄·문단 구분)
const LINE_BREAKERS = /[\u0000-\u001f\u007f\u2028\u2029]+/g;

const pad = (n, width = 2) => String(n).padStart(width, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
const firstChars = (text, n) => [...text].slice(0, n).join('');

// 사건 이름: 한 줄 안에 들어가게 제어 문자는 빈칸으로, 40글자까지
function cleanEvent(event) {
  const text = String(event ?? '').replace(LINE_BREAKERS, ' ').trim();
  return text ? firstChars(text, MAX_EVENT_CHARS) : '알 수 없음';
}

// 자료: 평범한 객체만 JSON 으로 (배열·글자·null 은 버림). 바꿀 수 없는 값(순환 참조 등)은 표시만 하고, 2000글자까지
function cleanData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  let json;
  try {
    json = JSON.stringify(data);
  } catch {
    return '{"오류":"기록할 수 없는 값"}';
  }
  if (!json || json === '{}') return '';
  const oneLine = json.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return [...oneLine].length > MAX_DATA_CHARS ? `${firstChars(oneLine, MAX_DATA_CHARS)}…` : oneLine;
}

function formatLine(date, source, event, data) {
  const json = cleanData(data);
  return `${localDate(date)} ${localTime(date)} [${cleanEvent(source)}] ${cleanEvent(event)}${json ? ` ${json}` : ''}\n`;
}

const fileNameFor = (date) => `play-${localDate(date)}.log`;

// 보관 기간이 지난 기록 파일(play-YYYY-MM-DD.log)만 지운다. 지운 파일 이름 목록을 돌려준다
function removeOldLogs(dir, now = new Date(), keepDays = KEEP_DAYS, onError = () => {}) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    if (err.code !== 'ENOENT') onError(err);
    return [];
  }
  const oldest = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - keepDays));
  const old = names.filter((name) => {
    const m = LOG_FILE.exec(name);
    return m && m[1] < oldest;
  }).sort();
  return old.filter((name) => {
    try {
      fs.unlinkSync(path.join(dir, name));
      return true;
    } catch (err) {
      onError(err);
      return false;
    }
  });
}

const reportToConsole = (err) => console.error('[가스트 사격] 실기 기록 파일을 쓰지 못함:', err.message);

// write(출처, 사건, 자료) — 지금 날짜의 파일에 한 줄 덧붙인다. 예외를 던지지 않는다
function createFieldLog({ dir, now = () => new Date(), maxBytes = MAX_BYTES_PER_DAY, onError = reportToConsole }) {
  let failed = false;
  let current = null; // 지금 쓰는 파일 { name, bytes, capped }

  const report = (err) => {
    if (failed) return;
    failed = true;
    onError(err);
  };
  // 앱을 다시 켰을 때도 그날 파일 크기를 이어서 센다
  const stateFor = (name) => {
    if (current?.name === name) return current;
    let bytes = 0;
    try {
      bytes = fs.statSync(path.join(dir, name)).size;
    } catch {
      bytes = 0; // 아직 없는 파일
    }
    return { name, bytes, capped: bytes >= maxBytes };
  };
  const append = (state, line) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, state.name), line, 'utf8');
    return { ...state, bytes: state.bytes + Buffer.byteLength(line) };
  };

  function write(source, event, data) {
    try {
      const date = now();
      const state = stateFor(fileNameFor(date));
      if (state.capped) {
        current = state;
        return;
      }
      const line = formatLine(date, source, event, data);
      if (state.bytes + Buffer.byteLength(line) <= maxBytes) {
        current = append(state, line);
        return;
      }
      const note = formatLine(date, '앱', '기록 멈춤', { 이유: `오늘 기록이 ${Math.round(maxBytes / 1024)}KB 를 넘어 이날은 더 적지 않음` });
      current = { ...append(state, note), capped: true };
    } catch (err) {
      report(err);
    }
  }

  return { write, dir };
}

module.exports = { createFieldLog, formatLine, fileNameFor, removeOldLogs, cleanEvent, cleanData, KEEP_DAYS };
