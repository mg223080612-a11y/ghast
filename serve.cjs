// 간단한 로컬 서버: node serve.cjs  →  http://localhost:5190
// (index.html 을 그냥 더블클릭해도 게임은 돌아갑니다. 이 서버는 테스트용입니다.)
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.argv[2]) || 5190;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`가스트 사격: http://localhost:${port}`));
