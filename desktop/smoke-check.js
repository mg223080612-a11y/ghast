// =============================================================
// 빌드 확인용 '앱 켜 보기' (GitHub Actions 가 빌드 직후 실제 앱을 켜서 확인한다)
//   환경 변수 GHAST_SMOKE_OUT=<결과 파일> 로 켰을 때만 동작한다 (평소 실행에는 아무 일도 하지 않음).
//   게임이 처음 화면까지 뜨고, 가스트 그림이 만들어지고, 게임 오류가 0건인지 확인해
//   결과를 JSON 으로 파일에 쓰고 앱을 끈다. 종료 코드: 0 정상 · 1 확인 실패 · 2 시간 초과 · 3 화면 프로세스 죽음 · 4 확인 중 오류
//   예전에 '빌드는 성공했는데 맥 앱이 켜지자마자 꺼지던' 문제(제작 기록 6.1)를 다시 놓치지 않으려고.
// =============================================================
const fs = require('fs');

const SETTLE_MS = 5000;   // 처음 화면이 뜬 뒤 잠깐 기다렸다가 확인 (그림 만들기·첫 프레임)
const LIMIT_MS = 45000;   // 이 안에 확인이 끝나지 않으면 실패

// 게임 화면 안에서 읽는 값 (게임 코드의 전역 이름. 없으면 null·-1)
const PROBE = `({
  state: typeof game !== 'undefined' ? game.state : null,
  errors: typeof errorLog !== 'undefined' ? errorLog.count : -1,
  version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
  art: typeof GV !== 'undefined' && !!GV.normal && !!GV.angry && !!GV.gold, // v2 그림: 보통·분노·황금
})`;

// 확인 결과가 정상인지 (순수 함수 — 테스트용으로도 내보냄)
function judge(r) {
  return !!r && r.state === 'title' && r.errors === 0 && r.art === true && typeof r.version === 'string' && r.version.length > 0;
}

function startSmokeCheck(win, app, outFile, cleanup = () => {}) {
  let done = false;
  const finish = (result, code) => {
    if (done) return;
    done = true;
    clearTimeout(limit);
    try { fs.writeFileSync(outFile, JSON.stringify(result)); } catch (err) { console.error('[가스트 사격] 앱 켜 보기 결과를 쓰지 못함:', err.message); }
    try { cleanup(); } catch { /* 이미 꺼진 프로세스 */ }
    app.exit(code);
  };
  const limit = setTimeout(() => finish({ ok: false, reason: 'timeout' }, 2), LIMIT_MS);
  win.webContents.on('render-process-gone', (e, details) => finish({ ok: false, reason: 'render-process-gone', details: details?.reason }, 3));
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const r = await win.webContents.executeJavaScript(PROBE);
        const ok = judge(r);
        finish({ ok, ...r }, ok ? 0 : 1);
      } catch (err) {
        finish({ ok: false, reason: String(err?.message || err) }, 4);
      }
    }, SETTLE_MS);
  });
}

module.exports = { startSmokeCheck, judge };
