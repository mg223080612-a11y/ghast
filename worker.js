// =============================================================
// 가스트 사격 랭킹 API — Cloudflare Worker + D1
//
//   GET    /api/scores?since=<ms>&limit=10   기록 목록 (점수 높은 순)
//   GET    /api/play                          게임 시작 표(token) 받기 → { token }
//   POST   /api/scores                        기록 저장 (표 필요) → { id, rankToday, rankAll }
//   DELETE /api/scores/<id>                   기록 하나 삭제   (X-Admin-Key 필요)
//   DELETE /api/scores                        전체 삭제        (X-Admin-Key 필요)
//
// 게임 파일(index.html 등)은 같은 Worker 의 정적 자산으로 함께 배포됩니다.
// 삭제용 관리자 키는 코드에 두지 않고 Cloudflare 시크릿으로 넣습니다:
//   npx wrangler secret put ADMIN_KEY
// 시크릿이 없으면 아무도 삭제할 수 없습니다 (fail-closed).
//
// 가짜 기록 막기: 게임을 시작할 때 서버가 '언제 시작했는지'를 서명한 표(token)를 주고,
// 기록을 올릴 때 그 표를 함께 내야 한다. 서버는
//   ① 서명이 맞는지 (PLAY_SECRET 시크릿으로 HMAC) ② 이미 쓴 표가 아닌지 (한 번만)
//   ③ 시작부터 걸린 시간에 비해 점수가 말이 되는지 를 확인한다.
// 주소만 알고 점수를 마음대로 올리는 것을 막는다. 서명 키: npx wrangler secret put PLAY_SECRET
// =============================================================

const CORS = {
  // 행사 PC 에서는 localhost(serve.cjs) 나 파일로 게임을 열기 때문에 모든 출처를 허용한다.
  // 읽기·쓰기는 누구나 가능한 랭킹이고, 삭제는 관리자 키로 막는다.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
  'Access-Control-Max-Age': '86400',
};

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
});

// 닉네임 정리: 앞뒤 공백·제어문자 제거, 최대 12자
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
const toInt = (v, min, max, fallback = min) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// 관리자 키 비교 (길이·내용을 한 글자씩 모두 비교해 시간 차로 추측하지 못하게)
function isAdmin(request, env) {
  const expected = env.ADMIN_KEY || '';
  const given = request.headers.get('X-Admin-Key') || '';
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// ---------- 게임 시작 표 (서명된 시작 시각) ----------
const PLAY_MAX_AGE = 7 * 86_400_000;  // 인터넷이 끊긴 PC 에 보관한 기록도 일주일 안이면 받는다
const PLAY_MIN_MS = 8_000;            // 시작하자마자 올리는 기록은 받지 않음 (가장 짧은 판도 10초 이상)
const MAX_POINTS_PER_SEC = 40;        // 아무리 잘해도 1초에 40점은 못 넘는다 (실제 최고 수준의 몇 배로 넉넉히)
const MAX_KILLS_PER_SEC = 12;
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}
async function makePlayToken(env) {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const body = `${Date.now()}.${nonce}`;
  return `${body}.${await hmac(env.PLAY_SECRET, body)}`;
}
// 맞는 표면 { t: 시작 시각, nonce }, 아니면 null
async function readPlayToken(env, token) {
  const m = /^(\d{13})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/.exec(String(token || ''));
  if (!m) return null;
  const sig = await hmac(env.PLAY_SECRET, `${m[1]}.${m[2]}`);
  if (sig.length !== m[3].length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ m[3].charCodeAt(i);
  return diff === 0 ? { t: Number(m[1]), nonce: m[2] } : null;
}
async function limited(env, key) {
  if (!env.SAVE_LIMITER) return false;
  const { success } = await env.SAVE_LIMITER.limit({ key });
  return !success;
}

async function handle(request, env, url) {
  const db = env.DB;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  if (url.pathname === '/api/play' && request.method === 'GET') {
    if (!env.PLAY_SECRET) return json(503, { error: '서버에 PLAY_SECRET 이 설정되지 않았습니다' });
    if (await limited(env, `play:${ip}`)) return json(429, { error: '너무 자주 요청하고 있어요' });
    return json(200, { token: await makePlayToken(env) });
  }

  if (url.pathname === '/api/scores' && request.method === 'GET') {
    const since = toInt(url.searchParams.get('since'), 0, Number.MAX_SAFE_INTEGER, 0);
    const limit = toInt(url.searchParams.get('limit'), 1, 200, 10);
    const { results } = await db
      .prepare('SELECT id, name, score, kills, created_at FROM scores WHERE created_at >= ? ORDER BY score DESC, created_at ASC LIMIT ?')
      .bind(since, limit)
      .all();
    return json(200, results);
  }

  if (url.pathname === '/api/scores' && request.method === 'POST') {
    // 같은 곳(IP)에서 1분에 10번 넘게 저장하면 막는다.
    // 한 판이 40초 이상이라 정상 플레이로는 넘을 수 없고, 오프라인 기록을 몰아 올릴 여유는 남긴다.
    if (await limited(env, ip)) return json(429, { error: '너무 자주 저장하고 있어요. 잠시 후 다시 시도하세요' });

    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'JSON 형식이 아닙니다' }); }
    const name = cleanName(body.name);
    if (!name) return json(400, { error: '닉네임이 비어 있습니다' });

    // 점수 상한: wrangler.toml 에 MAX_SCORE 를 적으면 그보다 높은 점수는 받지 않는다 (가짜 기록 방지).
    // 지금은 상한 없이 운영 — 값이 없으면 검사하지 않는다.
    const maxScore = env.MAX_SCORE ? toInt(env.MAX_SCORE, 1, 1_000_000_000) : 0;
    if (maxScore && (Number(body.score) > maxScore || Number(body.kills) > maxScore)) {
      return json(400, { error: `점수가 너무 높아 저장하지 않았습니다 (최대 ${maxScore}점)` });
    }
    const score = toInt(body.score, 0, 1_000_000_000);
    const kills = toInt(body.kills, 0, 1_000_000_000);
    const since = toInt(body.since, 0, Number.MAX_SAFE_INTEGER, 0);
    // 인터넷이 끊겼을 때 PC 에 보관했다가 나중에 올리는 기록은 원래 플레이한 시각을 쓴다.
    // (미래 시각이나 일주일보다 오래된 시각은 받지 않고 지금 시각으로)
    const now = Date.now();
    const played = Number(body.created_at);
    const createdAt = Number.isFinite(played) && played <= now + 5 * 60_000 && played >= now - 7 * 86_400_000
      ? Math.round(played) : now;

    // 게임 시작 표 확인: 서명 → 시간 → 점수가 말이 되는지 → 한 번만
    // (PLAY_SECRET 시크릿을 넣기 전에는 검사하지 않고 예전처럼 받는다. 넣는 순간부터 가짜 기록이 막힌다)
    if (env.PLAY_SECRET) {
      const play = await readPlayToken(env, body.token);
      if (!play) return json(403, { error: '게임에서 나온 기록이 아니에요' });
      const playedMs = Math.min(createdAt, now) - play.t;
      if (playedMs < PLAY_MIN_MS || play.t < now - PLAY_MAX_AGE) return json(403, { error: '게임 시간이 맞지 않아요' });
      const sec = playedMs / 1000;
      if (score > 100 + sec * MAX_POINTS_PER_SEC || kills > 20 + sec * MAX_KILLS_PER_SEC) {
        return json(403, { error: '게임 시간에 비해 점수가 너무 높아요' });
      }
      const used = await db.prepare('INSERT OR IGNORE INTO used_tokens (nonce, used_at) VALUES (?, ?)').bind(play.nonce, now).run();
      if (!used.meta.changes) return json(409, { error: '이미 올린 기록이에요' });
    }

    const { meta } = await db
      .prepare('INSERT INTO scores (name, score, kills, created_at) VALUES (?, ?, ?, ?)')
      .bind(name, score, kills, createdAt)
      .run();
    // 나보다 점수가 높은 기록 수 + 1 = 내 순위
    const rankStmt = db.prepare('SELECT COUNT(*) AS n FROM scores WHERE created_at >= ? AND score > ?');
    const [today, all] = await db.batch([rankStmt.bind(since, score), rankStmt.bind(0, score)]);
    return json(200, {
      id: meta.last_row_id,
      rankToday: today.results[0].n + 1,
      rankAll: all.results[0].n + 1,
    });
  }

  if (request.method === 'DELETE' && url.pathname.startsWith('/api/scores')) {
    if (!isAdmin(request, env)) return json(403, { error: '관리자 키가 맞지 않습니다' });
    const m = url.pathname.match(/^\/api\/scores\/(\d+)$/);
    if (m) {
      await db.prepare('DELETE FROM scores WHERE id = ?').bind(Number(m[1])).run();
      return json(200, { ok: true });
    }
    if (url.pathname === '/api/scores') {
      await db.prepare('DELETE FROM scores').run();
      // 일주일 넘은 '쓴 표' 기록도 함께 정리 (그보다 오래된 표는 어차피 받지 않는다)
      await db.prepare('DELETE FROM used_tokens WHERE used_at < ?').bind(Date.now() - PLAY_MAX_AGE).run();
      return json(200, { ok: true });
    }
  }

  return json(404, { error: 'not found' });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // /api/ 가 아닌 주소는 정적 자산(게임 파일)이 먼저 응답하고, 없는 파일만 여기로 온다
    if (!url.pathname.startsWith('/api/')) return new Response('not found', { status: 404 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      return await handle(request, env, url);
    } catch (err) {
      console.error(err);
      return json(500, { error: '서버 오류' });
    }
  },
};
