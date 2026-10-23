// 가스트 사격 로컬 서버: node serve.cjs  →  http://localhost:5190
// - 게임 파일을 내보내고
// - 랭킹을 data/ranking.db (SQLite) 에 저장합니다.
//   Node 22.13 이상에 들어 있는 node:sqlite 를 써서 따로 설치할 것이 없습니다.
// (index.html 을 그냥 더블클릭해도 게임은 되지만, 그때 랭킹은 그 브라우저에만 저장됩니다.)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const root = __dirname;
const dataDir = path.join(root, 'data');
const port = Number(process.argv[2]) || 5190;

// ---------- DB ----------
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'ranking.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    score      INTEGER NOT NULL,
    kills      INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL           -- 밀리초 (Date.now())
  );
  CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (score DESC, created_at);
`);
const q = {
  top: db.prepare('SELECT id, name, score, kills, created_at FROM scores WHERE created_at >= ? ORDER BY score DESC, created_at ASC LIMIT ?'),
  insert: db.prepare('INSERT INTO scores (name, score, kills, created_at) VALUES (?, ?, ?, ?)'),
  // 나보다 점수가 높은 기록 수 + 1 = 내 순위
  rank: db.prepare('SELECT COUNT(*) AS n FROM scores WHERE created_at >= ? AND score > ?'),
  remove: db.prepare('DELETE FROM scores WHERE id = ?'),
  clear: db.prepare('DELETE FROM scores'),
};

// 닉네임 정리: 앞뒤 공백·제어문자 제거, 최대 12자
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
const toInt = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10_000) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  // 기록 목록: /api/scores?since=<ms>&limit=10
  if (req.method === 'GET' && url.pathname === '/api/scores') {
    const since = toInt(url.searchParams.get('since'), 0, Number.MAX_SAFE_INTEGER);
    const limit = toInt(url.searchParams.get('limit') ?? 10, 1, 200);
    return sendJson(res, 200, q.top.all(since, limit));
  }
  // 기록 저장: { name, score, kills, since(오늘 0시) } → { id, rankToday, rankAll }
  if (req.method === 'POST' && url.pathname === '/api/scores') {
    const body = await readJson(req);
    const name = cleanName(body.name);
    if (!name) return sendJson(res, 400, { error: '닉네임이 비어 있습니다' });
    const score = toInt(body.score, 0, 100000);
    const kills = toInt(body.kills, 0, 100000);
    const since = toInt(body.since, 0, Number.MAX_SAFE_INTEGER);
    const { lastInsertRowid } = q.insert.run(name, score, kills, Date.now());
    return sendJson(res, 200, {
      id: Number(lastInsertRowid),
      rankToday: q.rank.get(since, score).n + 1,
      rankAll: q.rank.get(0, score).n + 1,
    });
  }
  // 기록 하나 삭제: DELETE /api/scores/12
  const m = url.pathname.match(/^\/api\/scores\/(\d+)$/);
  if (req.method === 'DELETE' && m) {
    q.remove.run(Number(m[1]));
    return sendJson(res, 200, { ok: true });
  }
  // 전체 삭제: DELETE /api/scores
  if (req.method === 'DELETE' && url.pathname === '/api/scores') {
    q.clear.run();
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'not found' });
}

// ---------- 정적 파일 ----------
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};
function serveFile(res, urlPath) {
  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  // 게임 폴더 밖, 그리고 DB 폴더는 내보내지 않는다
  if (!file.startsWith(root + path.sep) || file.startsWith(dataDir)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveFile(res, decodeURIComponent(url.pathname));
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: '서버 오류' });
  }
// 127.0.0.1 로만 열어 같은 PC 에서만 접속 (다른 기기가 랭킹을 지우지 못하게)
}).listen(port, '127.0.0.1', () => console.log(`가스트 사격: http://localhost:${port}  (랭킹 DB: data/ranking.db)`));
