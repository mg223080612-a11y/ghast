// 컴퓨터용 프로그램 만들기 (조준점은 게임 안에서 고른다: 처음 화면 버튼·V 키·이름 입력 창·설정)
//   npm run build:exe → 윈도우 설치형·휴대용 exe
//   npm run build:mac → 맥용 앱(.zip, 인텔·애플 실리콘 각각). 맥에서만 만들 수 있다 (.github/workflows/mac.yml)
// 게임 속 설정(조준점·총 보정·1P/2P 배정 등)은 앱 이름과 상관없이 같은 폴더에 저장된다 (main.js 참고).
const { build } = require('electron-builder');
const base = require('../package.json').build;

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
      // 맥: 애플 개발자 인증서가 없어 임시 서명('-')으로 만든다
      mac: { category: 'public.app-category.games', icon: 'desktop/icon.png', identity: '-', artifactName: `ghast-shooting-\${version}-mac-\${arch}.\${ext}` },
    },
  });
})().catch((e) => { console.error(e); process.exit(1); });
