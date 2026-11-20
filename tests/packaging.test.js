// 컴퓨터용 프로그램(Electron) 묶음 점검 — 실행: npm test
//   index.html 이 불러오는 파일이 프로그램 안에 빠짐없이 들어가는지(package.json 의 build.files),
//   v3 가 운영 중인 v2.2.7 과 이름·appId·설정 폴더가 겹치지 않는지(같이 깔 수 있게) 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const pkg = JSON.parse(read('package.json'));
const files = pkg.build.files;

// 'assets/**' → assets 폴더 아래 전부, '*' → 폴더 구분(/) 없는 아무 글자
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*\*|\*/g, (m) => (m === '**' ? '.*' : '[^/]*'));
  return new RegExp(`^${pattern}$`);
}
const isGlob = (entry) => entry.includes('*');
const isPackaged = (rel) => files.some((entry) => entry === rel || (isGlob(entry) && globToRegExp(entry).test(rel)));

// index.html 의 <script src> · <link rel="stylesheet" href> 중 이 컴퓨터 안 파일 (http·https·// 주소, data: 는 뺀다)
function localAssets(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]);
  const styles = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /\brel=["']?stylesheet\b/i.test(tag))
    .map((tag) => (tag.match(/\bhref=["']([^"']+)["']/i) || [])[1])
    .filter(Boolean);
  return [...scripts, ...styles]
    .filter((src) => !/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(src) && !/^data:/i.test(src))
    .map((src) => src.split(/[?#]/)[0].replace(/^\.?\//, ''));
}

test('index.html 이 불러오는 스크립트·스타일 파일이 있고, 프로그램 묶음(build.files)에 들어간다', () => {
  const assets = localAssets(read('index.html'));
  assert.ok(assets.includes('game.js') && assets.includes('style.css'), `index.html 에서 game.js·style.css 를 못 찾음: ${assets}`);
  for (const rel of assets) {
    assert.ok(exists(rel), `${rel} 파일이 없습니다`);
    assert.ok(isPackaged(rel), `${rel} 이 package.json 의 build.files 에 없습니다 → 프로그램에서 빠집니다`);
  }
});

test('build.files 에 적은 파일(글롭 제외)은 모두 실제로 있다', () => {
  for (const entry of files.filter((e) => !isGlob(e))) assert.ok(exists(entry), `build.files 의 ${entry} 파일이 없습니다`);
});

test('프로그램 시작 파일(desktop/main.js·preload.js)이 묶음에 들어가고 아이콘이 있다', () => {
  assert.equal(pkg.main, 'desktop/main.js');
  for (const rel of ['desktop/main.js', 'desktop/preload.js', 'desktop/gun-mode.js', 'desktop/gun-mode-worker.js', 'desktop/smoke-check.js', 'desktop/field-log.js']) {
    assert.ok(files.includes(rel), `${rel} 이 build.files 에 없습니다`);
    assert.ok(exists(rel), `${rel} 파일이 없습니다`);
  }
  assert.ok(exists('desktop/icon.png'), 'desktop/icon.png 가 없습니다');
});

test('v3 는 운영 중인 v2.2.7 과 이름·appId·설정 폴더가 겹치지 않는다 (같이 깔 수 있게)', () => {
  const OLD = { name: '가스트 사격', appId: 'kr.gvcs.ghast-shooting', macName: 'Ghast Shooting' };
  assert.notEqual(pkg.productName, OLD.name);
  assert.notEqual(pkg.build.productName, OLD.name);
  assert.notEqual(pkg.build.appId, OLD.appId);
  assert.notEqual(pkg.build.nsis.shortcutName, OLD.name);
  const macName = (read('desktop/build.js').match(/MAC_NAME\s*=\s*'([^']+)'/) || [])[1];
  assert.ok(macName && macName !== OLD.macName, `맥 앱 이름(desktop/build.js 의 MAC_NAME)이 옛 앱과 같습니다: ${macName}`);
  const userData = (read('desktop/main.js').match(/setPath\('userData',\s*path\.join\(app\.getPath\('appData'\),\s*'([^']+)'\)\)/) || [])[1];
  assert.ok(userData && userData !== OLD.name, `설정 폴더(desktop/main.js 의 userData)가 옛 앱과 같습니다: ${userData}`);
});

test('앱 켜 보기(smoke-check): 처음 화면·그림 5종·오류 0·버전이 있어야 정상', () => {
  const { judge } = require('../desktop/smoke-check.js');
  const good = { state: 'title', errors: 0, art: true, version: '3.2.1' };
  assert.equal(judge(good), true);
  assert.equal(judge({ ...good, state: 'play' }), false);
  assert.equal(judge({ ...good, errors: 1 }), false);
  assert.equal(judge({ ...good, art: false }), false);
  assert.equal(judge({ ...good, version: '' }), false);
  assert.equal(judge(null), false);
});

test('워크플로: 빌드 뒤 맥·윈도우에서 앱을 켜 보고, Node 20 액션(@v4 등)을 쓰지 않는다', () => {
  const yml = read('.github/workflows/release.yml');
  assert.match(yml, /앱 켜 보기 \(맥/);
  assert.match(yml, /앱 켜 보기 \(윈도우\)/);
  assert.match(yml, /GHAST_SMOKE_OUT/);
  assert.doesNotMatch(yml, /actions\/(checkout|setup-node|upload-artifact|download-artifact)@v4\b/);
});
