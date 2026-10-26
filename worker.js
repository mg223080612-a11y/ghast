// =============================================================
// 가스트 사격 랭킹 API — Cloudflare Worker + D1
//
//   GET    /api/scores?since=<ms>&limit=10   기록 목록 (점수 높은 순)
//   POST   /api/scores                        기록 저장 → { id, rankToday, rankAll }
//   DELETE /api/scores/<id>                   기록 하나 삭제   (X-Admin-Key 필요)
//   DELETE /api/scores                        전체 삭제        (X-Admin-Key 필요)
//
// 게임 파일(index.html 등)은 같은 Worker 의 정적 자산으로 함께 배포됩니다.
// 삭제용 관리자 키는 코드에 두지 않고 Cloudflare 시크릿으로 넣습니다:
//   npx wrangler secret put ADMIN_KEY
// 시크릿이 없으면 아무도 삭제할 수 없습니다 (fail-closed).
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

// 부적절한 닉네임 거르기 (game.js 에도 같은 목록이 있어 입력할 때 바로 알려 줌)
// 띄어쓰기·숫자·기호를 지운 뒤 검사해서 "씨 1 발" 같은 변형도 잡는다.
const BAD_WORDS = [
  '시발', '씨발', '씨바', 'ㅅㅂ', 'ㅆㅂ', '병신', '븅신', 'ㅂㅅ', '좆', '존나', '졸라', 'ㅈㄴ',
  '개새', '새끼', '쌔끼', '지랄', 'ㅈㄹ', '미친', '닥쳐', '꺼져', '엠창', '느금', '니애미', '니엄마',
  '애미', '애비', '섹스', '보지', '자지', '찐따', 'fuck', 'fuk', 'shit', 'bitch', 'sex', 'porn',
  'dick', 'pussy', 'nigg',
];
const normalizeName = (s) => String(s).toLowerCase().normalize('NFC')
  .replace(/[\s\d_.\-~!@#$%^&*()+=|\\/?<>,;:'"`[\]{}·•]+/g, '');
const isBadName = (s) => { const n = normalizeName(s); return BAD_WORDS.some((w) => n.includes(w)); };
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

async function handle(request, env, url) {
  const db = env.DB;

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
    if (env.SAVE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.SAVE_LIMITER.limit({ key: ip });
      if (!success) return json(429, { error: '너무 자주 저장하고 있어요. 잠시 후 다시 시도하세요' });
    }

    let body;
    try { body = await request.json(); } catch { return json(400, { error: 'JSON 형식이 아닙니다' }); }
    const name = cleanName(body.name);
    if (!name) return json(400, { error: '닉네임이 비어 있습니다' });
    if (isBadName(name)) return json(400, { error: '사용할 수 없는 닉네임입니다' });

    // 40초 게임에서 나올 수 없는 점수는 받지 않는다 (가짜 기록 방지). 한도는 wrangler.toml 의 MAX_SCORE
    const maxScore = toInt(env.MAX_SCORE, 1, 1_000_000, 500);
    if (Number(body.score) > maxScore || Number(body.kills) > maxScore) {
      return json(400, { error: `점수가 너무 높아 저장하지 않았습니다 (최대 ${maxScore}점)` });
    }
    const score = toInt(body.score, 0, maxScore);
    const kills = toInt(body.kills, 0, maxScore);
    const since = toInt(body.since, 0, Number.MAX_SAFE_INTEGER, 0);
    // 인터넷이 끊겼을 때 PC 에 보관했다가 나중에 올리는 기록은 원래 플레이한 시각을 쓴다.
    // (미래 시각이나 일주일보다 오래된 시각은 받지 않고 지금 시각으로)
    const now = Date.now();
    const played = Number(body.created_at);
    const createdAt = Number.isFinite(played) && played <= now + 5 * 60_000 && played >= now - 7 * 86_400_000
      ? Math.round(played) : now;

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
