// exe 두 가지 만들기: 조준점(과녁) 있는 버전 / 없는 버전
//   npm run build:exe        → 두 버전 모두
//   npm run build:exe -- aim → 조준점 있는 버전만 ('noaim' 은 없는 버전만)
//   npm run build:mac        → 맥용 앱(.zip, 인텔·애플 실리콘 각각). 'aim'·'noaim' 을 붙이면 그 버전만
// 두 버전은 이름·설치 위치가 달라 한 컴퓨터에 같이 설치할 수 있다.
// 게임 속 설정(총 보정·1P/2P 배정 등)은 두 버전이 같이 쓴다 (main.js 참고).
const { build } = require('electron-builder');
const base = require('../package.json').build;

const VARIANTS = {
  aim:   { aimMode: 'big',    label: '조준점 있음', id: 'aim' },
  noaim: { aimMode: 'hidden', label: '조준점 없음', id: 'noaim' },
};

(async () => {
  const mac = process.argv.includes('mac');
  const pick = process.argv.slice(2).filter((k) => VARIANTS[k]);
  for (const key of pick.length ? pick : Object.keys(VARIANTS)) {
    const v = VARIANTS[key];
    const name = `${base.productName} (${v.label})`;
    console.log(`\n=== ${name} 만드는 중 ===`);
    await build({
      ...(mac ? { mac: ['zip'], x64: true, arm64: true } : { win: ['nsis', 'portable'] }),
      config: {
        ...base,
        appId: `${base.appId}.${v.id}`,
        productName: name,
        publish: null, // 만든 파일을 어디에도 자동으로 올리지 않는다 (맥은 workflow 가 Releases 에 올림)
        // 프로그램 안 package.json 에 적혀서 main.js 가 읽는다
        extraMetadata: { productName: name, ghastAim: v.aimMode },
        nsis: { ...base.nsis, shortcutName: name, artifactName: `ghast-shooting-\${version}-${v.id}-setup.\${ext}` },
        portable: { ...base.portable, artifactName: `ghast-shooting-\${version}-${v.id}-portable.\${ext}` },
        // 맥: 애플 개발자 인증서가 없어 임시 서명('-')으로 만든다. 맥에서만 만들 수 있다 (.github/workflows/mac.yml)
        mac: { category: 'public.app-category.games', icon: 'desktop/icon.png', identity: '-', artifactName: `ghast-shooting-\${version}-${v.id}-mac-\${arch}.\${ext}` },
      },
    });
  }
})().catch((e) => { console.error(e); process.exit(1); });
