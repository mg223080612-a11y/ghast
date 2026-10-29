// 가스트 사격 로컬 서버: node serve.cjs  →  http://localhost:5190
// 게임 파일만 내보냅니다. 랭킹은 Cloudflare 온라인 DB(worker.js)에 저장됩니다.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.argv[2]) || 5190;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
// 게임에 필요 없는 파일·폴더는 내보내지 않는다
const hidden = new Set(['data', '.git', '.wrangler', 'node_modules']);

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  // 이 노트북에서 연 게임에 관리자 키(data/admin-key.txt)를 알려 줘서 따로 입력하지 않아도 되게 한다.
  // 주소창의 호스트가 정확히 이 서버일 때만 응답한다 (다른 웹사이트가 몰래 읽어 가지 못하게).
  if (urlPath === '/local/admin-key') {
    const host = req.headers.host || '';
    if (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) { res.writeHead(403); res.end(); return; }
    fs.readFile(path.join(root, 'data', 'admin-key.txt'), 'utf8', (err, data) => {
      const key = err ? '' : data.trim().split(/\r?\n/).pop().trim();
      res.writeHead(key ? 200 : 404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(key);
    });
    return;
  }

  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  const first = path.relative(root, file).split(path.sep)[0];
  if (!file.startsWith(root + path.sep) || hidden.has(first)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
// 127.0.0.1 로만 열어 같은 PC 에서만 접속
}).listen(port, '127.0.0.1', () => console.log(`가스트 사격: http://localhost:${port}  (랭킹: Cloudflare 온라인 DB)`));
