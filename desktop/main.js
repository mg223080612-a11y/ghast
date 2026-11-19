// 가스트 사격 — 컴퓨터용 프로그램(Electron)
// 게임 파일(index.html·game.js·assets…)을 프로그램 안에 넣어 두고 app://ghast/ 주소로 연다.
//  - 인터넷이 없어도 게임은 돌아간다 (랭킹만 온라인이 될 때 저장되고, 안 되면 모아 뒀다가 다시 보낸다)
//  - 주소가 늘 같아서 설정·대기 중인 랭킹(localStorage)이 껐다 켜도 남는다
//  - 전체화면 끄기/켜기: F (또는 오른쪽 위 ⛶ 전체화면 버튼, F11)
//  - 종료: Alt+F4 (맥은 Cmd+Q)
const { app, BrowserWindow, protocol, net, shell, Menu, ipcMain, session, powerSaveBlocker } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const { pathToFileURL } = require('url');
// 엑스거너 총 모드 자동 전환: 게임과 따로 도는 작은 프로세스(desktop/gun-mode-worker.js)에서.
// 시리얼 부품 오류로 그 프로세스가 죽어도 게임은 그대로이고, 3초 뒤 다시 띄운다 (1분에 5번까지)
let gunWorker = null;
const gunWorkerStarts = [];
const GUN_WORKER_RESTART_MS = 3000;
const GUN_WORKER_STUCK_RESTART_MS = 20000; // 수신기 시리얼이 멈춰 스스로 끝냈을 때 (그동안 '수신기 다시 꽂기' 안내 유지)
let gunWorkerDelay = GUN_WORKER_RESTART_MS;
let lastGunStatus = [];
function sendToGame(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }
function startGunWorker() {
  const now = Date.now();
  while (gunWorkerStarts.length && now - gunWorkerStarts[0] > 60_000) gunWorkerStarts.shift();
  if (gunWorkerStarts.length >= 5 && gunWorkerDelay === GUN_WORKER_RESTART_MS) { console.error('[가스트 사격] 총 모드 자동 전환이 1분 안에 너무 자주 멈춰서 다시 켜지 않습니다'); return; }
  gunWorkerStarts.push(now);
  try {
    // 앱 실행 파일을 일반 Node 로 띄운다 (ELECTRON_RUN_AS_NODE). 묶음(asar) 안의 파일·풀린 네이티브 부품도 그대로 읽는다
    gunWorker = fork(path.join(__dirname, 'gun-mode-worker.js'), [], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
  } catch (err) {
    console.error('[가스트 사격] 총 모드 자동 전환을 쓸 수 없습니다:', err.message);
    return;
  }
  gunWorker.send({ type: 'enabled', on: gunAutoMode });
  gunWorker.send({ type: 'confirmed', list: [...gunsConfirmed] });
  gunWorker.on('message', (msg) => {
    if (msg?.type === 'status') { lastGunStatus = msg.list; sendToGame('gun-status', msg.list); }
    else if (msg?.type === 'restart-later') gunWorkerDelay = GUN_WORKER_STUCK_RESTART_MS;
    else if (msg?.type === 'switch') sendToGame('gun-mode-switched', msg.player);
    else if (msg?.type === 'log') console.log(`[가스트 사격] ${msg.msg}`);
  });
  gunWorker.on('error', (err) => console.error('[가스트 사격] 총 모드 자동 전환 프로세스 오류:', err.message));
  gunWorker.on('exit', (code, signal) => {
    gunWorker = null;
    if (quitting) return;
    console.error(`[가스트 사격] 총 모드 자동 전환 프로세스가 멈춤 (코드 ${code}${signal ? ` ${signal}` : ''}) — 잠시 뒤 다시 켭니다`);
    const delay = gunWorkerDelay;
    gunWorkerDelay = GUN_WORKER_RESTART_MS;
    // 기다리는 동안에도 게임에 마지막 상태('응답 없음' 등)를 계속 알려 안내 띠가 사라지지 않게
    const keep = setInterval(() => sendToGame('gun-status', lastGunStatus), 3000);
    setTimeout(() => { clearInterval(keep); startGunWorker(); }, delay);
  });
}
let quitting = false;
app.on('before-quit', () => { quitting = true; gunWorker?.kill(); });
let gunAutoMode = true; // 게임 설정 '총 모드 자동 전환' (game.js 가 알려 줌)
let gunsConfirmed = new Set(); // 게임에 게임패드 신호가 들어오고 있는 자리 (1·2, game.js 가 알려 줌)

const isMac = process.platform === 'darwin';

// 딜레이 줄이기: 창이 뒤에 있어도 느려지지 않게, 화면 그리기는 바로 바로
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// 설정·총 보정·명단은 앱 이름(윈도우 '가스트 사격 3', 맥 'Ghast Shooting 3')과 상관없이 늘 이 폴더에 저장한다.
// v3 는 운영 중인 v2.2.7('가스트 사격' 폴더)과 따로 저장해서, 두 앱을 같이 깔아도 서로 설정을 덮어쓰지 않는다.
// (같은 프로그램 두 번 켜기 막기도 이 폴더 기준이라 아래 requestSingleInstanceLock 보다 먼저 정해야 한다)
app.setPath('userData', path.join(app.getPath('appData'), '가스트 사격 3'));

// 같은 프로그램을 두 번 켜면 새 창 대신 이미 켜진 창을 앞으로 (아래 'second-instance').
// 두 번째로 켠 쪽은 app.quit() 만으로는 아래 코드(창 만들기 등)가 계속 돌아서 바로 끝낸다
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const root = path.join(__dirname, '..');
let win = null;

const CRASH_RELOAD_LIMIT = 3;        // 화면이 죽어서 다시 여는 것은 1분에 이만큼까지 (계속 죽는 고장이면 멈춘다)
const CRASH_RELOAD_WINDOW_MS = 60_000;
let crashReloads = [];               // 최근에 다시 연 시각들

// 화면(렌더러)이 죽으면(그래픽 고장·메모리 부족 등) 저절로 다시 연다.
// 대회 진행 상황·설정은 localStorage 에 있어서 다시 열어도 이어진다
function reloadAfterCrash(details) {
  console.error('[가스트 사격] 화면 프로세스가 멈춤:', details.reason, details.exitCode);
  if (!win || win.isDestroyed() || details.reason === 'clean-exit') return;
  const now = Date.now();
  crashReloads = [...crashReloads.filter((t) => now - t < CRASH_RELOAD_WINDOW_MS), now];
  if (crashReloads.length > CRASH_RELOAD_LIMIT) {
    console.error('[가스트 사격] 1분 안에 너무 자주 멈춰서 다시 열지 않습니다');
    return;
  }
  win.reload();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: !isMac,        // 켜자마자 프로젝터에 꽉 차게 (맥은 아래에서 setFull 로)
    backgroundColor: '#140303',
    autoHideMenuBar: true,
    title: '가스트 사격 3',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  if (isMac) setFull(true);
  win.loadURL('app://ghast/index.html');
  // F11 도 전체화면 끄기/켜기
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { e.preventDefault(); toggleFullScreen(); }
  });
  // 게임 밖 링크는 프로그램 안이 아니라 보통 브라우저로 (http·https 주소만. 파일·다른 프로그램 실행 주소는 열지 않는다)
  const openOutside = (url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); openOutside(url); } });
  win.webContents.on('render-process-gone', (e, details) => reloadAfterCrash(details));
}

// 맥은 '단순 전체화면'(simpleFullScreen)을 쓴다.
//  - 맥의 보통 전체화면은 노치 있는 맥북에서 노치 아래만 써서, 프로젝터 화면 위에 검은 띠가 생기고
//    총 조준이 그 높이만큼 어긋난다. 단순 전체화면은 화면 맨 위까지 꽉 채운다.
//  - 새 데스크톱(Space)으로 넘어가는 애니메이션이 없어 바로 바뀌고, 풀자마자 최대화도 된다
//    (보통 전체화면은 애니메이션 중이라 maximize 가 무시되어 작은 창이 된다)
const isFull = () => (isMac ? win.isSimpleFullScreen() : win.isFullScreen());
const setFull = (on) => (isMac ? win.setSimpleFullScreen(on) : win.setFullScreen(on));

// 전체화면을 풀면 화면 크기에 맞춘 최대화 창으로 (작은 창으로 돌아가지 않게)
function toggleFullScreen() {
  if (!win) return;
  const next = !isFull();
  setFull(next);
  if (!next) win.maximize();
}
// 게임의 F 키·⛶ 전체화면 버튼 → preload.js → 여기
ipcMain.on('toggle-fullscreen', (e) => { if (win && e.sender === win.webContents) toggleFullScreen(); });
// 앱 버전 (package.json 의 version) → preload.js → 게임 처음 화면 구석의 'v2.0.0'
ipcMain.on('app-version', (e) => { e.returnValue = app.getVersion(); });
ipcMain.on('gun-auto-mode', (e, on) => { if (win && e.sender === win.webContents) { gunAutoMode = !!on; if (gunWorker?.connected) gunWorker.send({ type: 'enabled', on: gunAutoMode }); } });
ipcMain.on('guns-confirmed', (e, list) => {
  if (!win || e.sender !== win.webContents || !Array.isArray(list)) return;
  gunsConfirmed = new Set(list.map(Number));
  if (gunWorker?.connected) gunWorker.send({ type: 'confirmed', list: [...gunsConfirmed] });
});

app.whenReady().then(() => {
  // 메뉴 막대는 숨긴다. 맥은 메뉴가 없으면 Cmd+Q(종료)·복사/붙여넣기가 안 돼서 기본 메뉴만 남긴다
  Menu.setApplicationMenu(process.platform === 'darwin'
    ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }])
    : null);
  // 게임은 카메라·마이크·위치·알림 같은 권한이 필요 없다 → 전부 거절 (게임패드·소리는 권한 없이 동작)
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(permission === 'fullscreen'));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'fullscreen');
  // 게임이 켜져 있는 동안 화면이 꺼지거나 잠기지 않게.
  // 총을 조이스틱 모드로 쓰면 키보드·마우스 입력이 없어서 컴퓨터가 '쉬는 중'으로 보고 화면을 끌 수 있다
  // (맥북은 배터리로 쓰면 기본 2분 만에 화면이 꺼진다)
  powerSaveBlocker.start('prevent-display-sleep');
  // app://ghast/… → 프로그램 안 게임 파일. 게임 폴더 밖은 열지 않는다
  // '.' 으로 시작하는 이름(.git·.github·.env 같은 숨김 파일·폴더, '..')이 경로에 하나라도 있으면 없는 파일로 답한다
  protocol.handle('app', (req) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    } catch {
      return new Response('bad request', { status: 400 });
    }
    if (rel.split(/[\\/]/).some((seg) => seg.startsWith('.'))) return new Response('not found', { status: 404 });
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root + path.sep)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  // 빌드 확인용 '앱 켜 보기' (GHAST_SMOKE_OUT 이 있을 때만 — desktop/smoke-check.js)
  if (process.env.GHAST_SMOKE_OUT) {
    require('./smoke-check.js').startSmokeCheck(win, app, process.env.GHAST_SMOKE_OUT, () => gunWorker?.kill());
  }
  // 3초마다 수신기를 확인해 마우스 모드인 총을 게임패드 모드로 (게임과 따로 도는 프로세스)
  startGunWorker();
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
