// 컴퓨터용 프로그램 만들기 (조준점은 게임 안에서 고른다: 처음 화면 버튼·V 키·이름 입력 창·설정)
//   npm run build:exe → 윈도우 설치형·휴대용 exe
//   npm run build:mac → 맥용 앱(.zip, 인텔·애플 실리콘 각각). 맥에서만 만들 수 있다 (.github/workflows/mac.yml)
// 게임 속 설정(조준점·총 보정·1P/2P 배정 등)은 앱 이름과 상관없이 같은 폴더에 저장된다 (main.js 참고).
const { build } = require('electron-builder');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const base = require('../package.json').build;

// 맥 고정 서명: 엑스거너 수신기는 키보드 기능이 있어 맥 '입력 모니터링' 권한이 있어야 열린다.
// 권한은 앱 서명에 묶이는데 임시 서명('-')은 빌드마다 달라져 새로 설치할 때마다 권한을 다시 줘야 했다.
// 그래서 늘 같은 자체 인증서(GVCS Ghast Shooting Local)로 다시 서명한다 → 지정 요구 조건이 '앱 ID + 인증서'로 고정.
// 인증서는 GitHub 비밀값(MAC_CERT_P12)에서 workflow 가 임시 키체인에 넣고 MAC_SIGN_HASH·MAC_SIGN_KEYCHAIN 을 알려 준다.
// 값이 없으면(로컬 빌드 등) 예전처럼 임시 서명 그대로.
function nativeFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) return [];
    if (e.isDirectory()) return p.endsWith('.app') || p.endsWith('.framework') ? [] : nativeFiles(p);
    return /\.(node|dylib)$/.test(e.name) ? [p] : [];
  });
}
async function fixedMacSign(context) {
  const hash = process.env.MAC_SIGN_HASH;
  if (!hash || context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const keychain = process.env.MAC_SIGN_KEYCHAIN ? ['--keychain', process.env.MAC_SIGN_KEYCHAIN] : [];
  const sign = (target, deep) => execFileSync('codesign', ['--force', ...(deep ? ['--deep'] : []), '--sign', hash, ...keychain, target], { stdio: 'inherit' });
  // 앱 안의 낱개 네이티브 파일(serialport 등)을 먼저, 그다음 앱 전체를 안쪽부터 (--deep)
  nativeFiles(path.join(app, 'Contents', 'Resources')).forEach((f) => sign(f, false));
  sign(app, true);
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  execFileSync('codesign', ['-d', '-r-', app], { stdio: 'inherit' }); // 로그에 지정 요구 조건 (인증서 해시가 빌드마다 같아야 함)
}

// 맥 앱 이름은 영어만. 앱 이름에 한글이 있으면 맥 앱이 켜지자마자 죽는다 (Electron 44, macOS 26 에서 확인):
//   electron-builder 는 Helper 앱 파일 이름의 한글을 NFD(자모를 풀어 쓴 형태)로 만드는데,
//   Electron 은 Helper 를 Info.plist 의 앱 이름(NFC 한글)으로 찾아서 둘이 어긋난다.
//   게임 안 이름(메뉴의 '…종료' 등)은 package.json 의 한글 이름(productName)이 그대로 쓰인다.
const MAC_NAME = 'Ghast Shooting';

(async () => {
  const mac = process.argv.includes('mac');
  await build({
    ...(mac ? { mac: ['zip'], x64: true, arm64: true } : { win: ['nsis', 'portable'] }),
    config: {
      ...base,
      productName: mac ? MAC_NAME : base.productName,
      publish: null, // 만든 파일을 어디에도 자동으로 올리지 않는다 (맥은 workflow 가 Releases 에 올림)
      // 맥: 애플 개발자 인증서가 없어 임시 서명('-')으로 만든 뒤, 고정 인증서가 있으면 다시 서명 (fixedMacSign)
      mac: { category: 'public.app-category.games', icon: 'desktop/icon.png', identity: '-', artifactName: `ghast-shooting-\${version}-mac-\${arch}.\${ext}` },
      afterSign: fixedMacSign,
    },
  });
})().catch((e) => { console.error(e); process.exit(1); });
