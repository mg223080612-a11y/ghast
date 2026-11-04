// 가스트 사격 — 컴퓨터용 프로그램(Electron)
// 게임 파일(index.html·game.js·assets…)을 프로그램 안에 넣어 두고 app://ghast/ 주소로 연다.
//  - 인터넷이 없어도 게임은 돌아간다 (랭킹만 온라인이 될 때 저장되고, 안 되면 모아 뒀다가 다시 보낸다)
//  - 주소가 늘 같아서 설정·대기 중인 랭킹(localStorage)이 껐다 켜도 남는다
//  - 전체화면 끄기/켜기: F (또는 오른쪽 위 ⛶ 전체화면 버튼, F11)
//  - 종료: Alt+F4 (맥은 Cmd+Q)
const { app, BrowserWindow, protocol, net, shell, Menu, ipcMain, session, powerSaveBlocker } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const isMac = process.platform === 'darwin';

// 딜레이 줄이기: 창이 뒤에 있어도 느려지지 않게, 화면 그리기는 바로 바로
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// 조준점 있는/없는 버전(desktop/build.js)은 이름이 달라도 설정·총 보정을 같은 폴더에 저장해 같이 쓴다
app.setPath('userData', path.join(app.getPath('appData'), '가스트 사격'));

// 같은 프로그램을 두 번 켜면 새 창 대신 이미 켜진 창을 앞으로
if (!app.requestSingleInstanceLock()) app.quit();

const root = path.join(__dirname, '..');
// 이 exe 의 조준점 버전: 'big' 있음 / 'hidden' 없음 (build.js 가 package.json 에 적어 둔다. 없으면 게임 설정대로)
const aimMode = require('../package.json').ghastAim || null;
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: !isMac,        // 켜자마자 프로젝터에 꽉 차게 (맥은 아래에서 setFull 로)
    backgroundColor: '#140303',
    autoHideMenuBar: true,
    title: '가스트 사격',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: aimMode ? [`--ghast-aim=${aimMode}`] : [],
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
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root + path.sep)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
