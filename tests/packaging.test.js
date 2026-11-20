// 컴퓨터용 프로그램(Electron) 묶음 점검 — 실행: npm test
//   index.html 이 불러오는 파일이 프로그램 안에 빠짐없이 들어가는지(package.json 의 build.files),
//   (v2.5.0 에 v3 의 총 모드 자동 전환·연사 자동 OFF·실기 기록 파일을 옮기며 v3 시험에서 가져옴)
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

test('v2 는 v3 와 이름·appId·설정 폴더가 다르다 (같이 깔 수 있게)', () => {
  assert.equal(pkg.productName, '가스트 사격');
  assert.equal(pkg.build.appId, 'kr.gvcs.ghast-shooting');
  assert.match(read('desktop/main.js'), /app\.setPath\('userData', path\.join\(app\.getPath\('appData'\), '가스트 사격'\)\)/);
  assert.doesNotMatch(read('desktop/main.js'), /title: '가스트 사격 3'|getPath\('appData'\), '가스트 사격 3'/);
});
