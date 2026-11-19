// 가스트 사격 — 랭킹 (Cloudflare 온라인 DB)·오래 가만히 있으면 처음 화면·총 연결 화면·총 조준 보정
// game.js 에서 기능별로 나눈 조각. index.html 이 game.js 다음에 차례로 불러오며, 이름(함수·변수)을 모두 함께 쓴다.
'use strict';
// ---------- 랭킹 (Cloudflare 온라인 DB) ----------
// 기록은 Cloudflare Worker + D1 에 저장한다 (worker.js).
// 인터넷이 끊기면 이 PC 에 잠시 보관했다가, 다시 연결되면 자동으로 올린다.
const RANK_API_ORIGIN = 'https://ghast-shooting.gcinhak.workers.dev'; // wrangler deploy 로 만든 주소
const RANK_PENDING_KEY = 'ghast-shooting-pending';   // 아직 못 올린 기록
const RANK_CACHE_KEY = 'ghast-shooting-rank-cache';  // 마지막으로 받아 온 랭킹 (오프라인일 때 보여줌)
const PLAY_SPARE_KEY = 'ghast-shooting-play-spare';  // 인터넷이 끊길 때를 대비해 미리 받아 둔 게임 시작 표
const RANK_GAME_DEFAULT = 'ghast';                   // 랭킹 서버의 기본 게임 이름 (= Normal 랭킹, 예전 기록 모두)
const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
// 오늘에서 day 일 떨어진 날의 0시 (0 오늘, -1 어제 …). 서머타임이 없어도 날짜 계산은 Date 에 맡긴다
const dayStart = (day) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + day); return d.getTime(); };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (day) => { const d = new Date(dayStart(day)); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`; };
// 제어 문자와 눈에 안 보이는 글자(폭 없는 공백·글자 방향 표시·BOM)를 지운다 → 그런 글자로만 된 이름은 빈 이름
const cleanName = (s) => String(s ?? '')
  .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, '')
  .trim().slice(0, 12);
const byRank = (a, b) => b.score - a.score || a.created_at - b.created_at;
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가 */ } };

// Cloudflare 에 올린 게임 페이지에서 열면 같은 주소의 /api, 행사 PC(localhost·파일)에서 열면 위 주소로 보낸다
function rankApi(path) {
  const sameOrigin = location.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(location.hostname);
  return `${sameOrigin ? '' : RANK_API_ORIGIN}/api/scores${path}`;
}

// 와이파이가 죽어 응답이 안 오면 이 시간 뒤 끊는다 → 인터넷 끊김과 똑같이 처리 ('랭킹 저장 중…'에 멈추지 않게)
const RANK_TIMEOUT_MS = 8000;
// 게임 시작 표의 앞자리 = 서버가 표를 만든 시각(ms). 읽을 수 없으면 NaN
const tokenIssuedAt = (t) => { const m = /^(\d{13})\./.exec(String(t ?? '')); return m ? Number(m[1]) : NaN; };
// 서버는 7일 지난 표를 안 받는다 → 미리 받아 둔 표는 5일이 지나면 버리고 새로 받는다
const SPARE_MAX_AGE = 5 * 86_400_000;

const Ranking = {
  online: null, // 마지막 요청이 성공했는지 (설정 창 표시용)

  async request(method, path, body) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (method === 'DELETE') headers['X-Admin-Key'] = settings.adminKey || '';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RANK_TIMEOUT_MS);
    let res, data;
    try {
      res = await fetch(rankApi(path), { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
      data = await res.json().catch(() => ({}));
      if (ctrl.signal.aborted) throw new Error('랭킹 서버가 응답하지 않아요'); // 받는 도중에 시간이 다 됨
    } catch (err) {
      this.online = false;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    this.online = true;
    if (!res.ok) {
      const err = new Error(data.error || `서버 오류 ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  },
  // 서버가 '이 기록은 안 받는다'고 확실히 거절한 경우 (닉네임·점수 문제).
  // 이런 기록은 다시 보내도 안 되니 보관하지 않는다.
  // 인터넷 끊김(status 없음)·너무 잦은 저장(429)·서버 고장(5xx)은 나중에 다시 보낸다.
  isRejected(err) { return err.status >= 400 && err.status < 500 && err.status !== 429; },

  pending() { return readJson(RANK_PENDING_KEY, []); },

  // 게임 시작 표: 서버가 '이 시각에 게임을 시작했다'고 서명해 준 것. 기록을 올릴 때 함께 낸다 (가짜 기록 방지).
  // 인터넷이 잠깐 끊겨도 기록을 올릴 수 있게 몇 장을 미리 받아 둔다 (예전에 받은 표일수록 시간 여유가 넉넉하다)
  // 표는 난이도(랭킹)마다 따로다. Normal 은 예전에 받아 둔 표를 그대로 쓰게 예전 이름으로 보관
  spareKey(gameId) { return gameId === RANK_GAME_DEFAULT ? PLAY_SPARE_KEY : `${PLAY_SPARE_KEY}-${gameId}`; },
  // 5일 넘은 표·읽을 수 없는 표는 빼고 돌려준다 → topUpSpares 가 새 표로 채운다 (보관 형식은 예전 그대로: 표 문자열 목록)
  spares(gameId = RANK_GAME_DEFAULT) {
    const list = readJson(this.spareKey(gameId), []);
    const oldest = Date.now() - SPARE_MAX_AGE;
    return Array.isArray(list) ? list.filter((t) => tokenIssuedAt(t) >= oldest) : [];
  },
  async fetchToken(gameId = RANK_GAME_DEFAULT, timeoutMs = 2500) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${rankApi('').replace('/api/scores', '/api/play')}?game=${gameId}`, { signal: ctrl.signal });
      if (!res.ok) return null;
      return (await res.json()).token || null;
    } catch { return null; } finally { clearTimeout(timer); }
  },
  async topUpSpares(gameId = RANK_GAME_DEFAULT) {
    if (this.spares(gameId).length >= 3) return;
    const t = await this.fetchToken(gameId);
    if (t) writeJson(this.spareKey(gameId), [...this.spares(gameId), t].slice(-3));
  },
  async topUpAllSpares() {
    for (const key of DIFF_KEYS) await this.topUpSpares(DIFFICULTIES[key].game);
  },
  // 새 표를 받고, 안 되면(오프라인) 미리 받아 둔 표를 하나 꺼낸다
  async takeToken(gameId = RANK_GAME_DEFAULT) {
    const fresh = await this.fetchToken(gameId);
    if (fresh) { this.topUpSpares(gameId); return fresh; }
    const list = this.spares(gameId);
    const t = list.shift() || null;
    writeJson(this.spareKey(gameId), list);
    return t;
  },

  // 기록 저장 → { id, rankToday, rankAll, pending } 또는 { rejected: '이유' }
  async add(entry) {
    const row = { ...entry, created_at: Date.now() };
    try {
      const r = await this.request('POST', '', { ...row, since: todayStart() });
      return { ...r, pending: false };
    } catch (err) {
      if (this.isRejected(err)) return { rejected: err.message };
      console.warn('랭킹을 올리지 못해 이 PC 에 보관합니다', err);
      const id = `p-${row.created_at}`;
      writeJson(RANK_PENDING_KEY, [...this.pending(), { ...row, id }]);
      return { id, pending: true };
    }
  },

  // 보관해 둔 기록을 올린다 (처음 켤 때, 그리고 주기적으로)
  flushing: false,
  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const drop = (id) => writeJson(RANK_PENDING_KEY, this.pending().filter((p) => p.id !== id));
      for (const row of this.pending()) {
        try {
          const r = await this.request('POST', '', { ...row, since: todayStart() });
          drop(row.id);
          if (game.lastEntryId === row.id) game.lastEntryId = r.id;
        } catch (err) {
          // 서버가 거절한 기록 하나 때문에 뒤의 기록까지 막히지 않도록 버리고 계속한다
          if (this.isRejected(err)) { console.warn('서버가 거절한 보관 기록을 버립니다', row, err.message); drop(row.id); continue; }
          break; // 아직 오프라인 등 — 다음에 다시 시도
        }
      }
    } finally {
      this.flushing = false; // 도중에 오류가 나도 다음 번에 다시 올릴 수 있게
    }
  },

  // scope: 'today' 날짜별(day: 0 오늘, -1 어제 …) | 'all' 전체 — 아직 못 올린 기록도 함께 보여준다.
  // 기록은 지우지 않고 모두 남아 있어서, 지난 날짜의 랭킹도 언제든 다시 볼 수 있다
  // gameId: 난이도별 랭킹 이름 ('ghast' Normal · 'ghasteasy' · 'ghasthard')
  async top(scope, limit = 10, day = 0, gameId = RANK_GAME_DEFAULT) {
    const daily = scope === 'today';
    const since = daily ? dayStart(day) : 0;
    const until = daily ? dayStart(day + 1) : Number.MAX_SAFE_INTEGER;
    const inRange = (r) => r.created_at >= since && r.created_at < until;
    // 서버가 준 목록(캐시)에는 game 이 없다 → 캐시는 난이도별 키로 이미 나뉘어 있으니 시간만 본다.
    // 아직 못 올린 기록은 한곳에 모여 있으니 난이도도 본다 (game 이 없는 예전 기록은 Normal)
    const sameGame = (r) => (r.game || RANK_GAME_DEFAULT) === gameId;
    const cacheKey = `${RANK_CACHE_KEY}-${scope}${daily && day ? day : ''}${gameId === RANK_GAME_DEFAULT ? '' : `-${gameId}`}`;
    await this.flush();
    let list;
    try {
      list = await this.request('GET', `?since=${since}${daily ? `&until=${until}` : ''}&limit=${limit}&game=${gameId}`);
      writeJson(cacheKey, list);
    } catch {
      list = readJson(cacheKey, []).filter(inRange);
    }
    const waiting = this.pending().filter((r) => inRange(r) && sameGame(r)).map((r) => ({ ...r, pending: true }));
    return [...list, ...waiting].sort(byRank).slice(0, limit);
  },

  async remove(id) {
    if (String(id).startsWith('p-')) {
      writeJson(RANK_PENDING_KEY, this.pending().filter((p) => p.id !== id));
      return;
    }
    return this.request('DELETE', `/${id}`);
  },
  // 그 난이도(랭킹) 기록만 모두 지운다
  async clear(gameId = RANK_GAME_DEFAULT) {
    await this.request('DELETE', `?game=${gameId}`);
    writeJson(RANK_PENDING_KEY, this.pending().filter((p) => (p.game || RANK_GAME_DEFAULT) !== gameId));
  },
};
// 보관 중인 기록은 30초마다 다시 올려 본다. 미리 받아 둔 게임 시작 표도 채워 둔다
setInterval(() => { if (Ranking.pending().length) Ranking.flush(); Ranking.topUpAllSpares(); }, 30_000);
Ranking.topUpAllSpares();

function refreshTitleTop() {
  const diff = game.diff;
  Ranking.top('today', 10, 0, rules().game)
    .then((list) => { if (game.diff === diff) game.titleTop = list; })
    .catch(() => {});
}
// 처음 화면에 머무는 동안에도 30초마다 새 기록을 반영한다
setInterval(() => { if (game.state === 'title') refreshTitleTop(); }, 30_000);

// 랭킹 화면
// '오늘' 은 TOP 10 만, '전체' 는 100명까지 쪽을 넘겨 가며 본다
const RANK_TODAY_LIMIT = 10;
const RANK_ALL_LIMIT = 100;
const rankLimit = (scope) => (scope === 'today' ? RANK_TODAY_LIMIT : RANK_ALL_LIMIT);
// 날짜별은 1년 전까지 하루씩 넘겨 본다
const RANK_DAYS_BACK = 365;
const rankView = { scope: 'today', day: 0, diff: 'normal', list: null, req: 0, page: 0, perPage: 10 };
// 게임이 끝난 뒤 랭킹: 1~5위 + ⋮ + 내 순위와 그 위아래 2명씩 (내 순위가 가까우면 1위부터 이어서)
const RANK_FOCUS = { top: 5, around: 2 };
const RANK_FOCUS_ROWS = RANK_FOCUS.top + 1 + RANK_FOCUS.around * 2 + 1; // 표에 들어가는 줄 수 (⋮ 포함)
const RANK_FOCUS_FETCH = 200;                                          // 서버가 한 번에 주는 최대 수
const rankAfterGame = () => game.rankFrom === 'result' && game.mode === 'solo';
function openRanking() {
  game.rankFrom = game.state === 'result' ? 'result' : 'title';
  game.state = 'ranking';
  rankView.day = 0; // 열 때는 항상 오늘부터
  rankView.diff = diffKeyOf(game.diff); // 방금 한 판(처음 화면이면 고른) 난이도의 랭킹부터
  rankView.cycleT = 0;                  // 게임 직후 랭킹 ↔ 설명판은 늘 랭킹부터
  setRankScope(rankView.scope);
  updateCornerButtons();
}
function setRankScope(scope) {
  rankView.scope = scope;
  rankView.list = null;
  rankView.page = 0;
  const req = ++rankView.req;
  Ranking.top(scope, rankAfterGame() ? RANK_FOCUS_FETCH : rankLimit(scope), rankView.day, DIFFICULTIES[rankView.diff].game)
    .then((list) => {
      if (req !== rankView.req) return;
      rankView.list = list;
      // 방금 한 판의 기록이 있으면 그 기록이 있는 쪽을 먼저 보여 준다
      const mine = list.findIndex((r) => r.id === game.lastEntryId);
      if (mine >= 0) rankView.page = Math.floor(mine / rankView.perPage);
    })
    .catch(() => { if (req === rankView.req) rankView.list = []; });
}
// 날짜별 랭킹: 전날 / 다음 날 (오늘보다 뒤로는 가지 않는다)
function turnRankDay(delta) {
  const day = clamp(rankView.day + delta, -RANK_DAYS_BACK, 0);
  if (day === rankView.day) return;
  rankView.day = day;
  setRankScope('today');
}
// 게임 직후 랭킹: 랭킹 10초 ↔ 가스트 설명판 6초를 버튼을 누를 때까지 번갈아 (기다리는 다음 사람에게 게임 방법을 보여 주려고)
const AFTER_GAME_CYCLE = { rank: 10, rules: 6, fade: 0.35 };
function afterGamePhase() {
  const { rank, rules: rulesSec, fade } = AFTER_GAME_CYCLE;
  const t = (rankView.cycleT || 0) % (rank + rulesSec);
  const showRules = t >= rank;
  const since = showRules ? t - rank : t;
  const alpha = rankView.cycleT < rank ? 1 : clamp(since / fade, 0, 1);
  return { rules: showRules, alpha };
}
function setRankDiff(key) {
  rankView.diff = diffKeyOf(key);
  setRankScope(rankView.scope);
}
function setRankTab(scope) {
  if (scope === 'today') rankView.day = 0;
  setRankScope(scope);
}
function rankPages() { return Math.max(1, Math.ceil((rankView.list?.length || 0) / rankView.perPage)); }
function turnRankPage(delta) { rankView.page = clamp(rankView.page + delta, 0, rankPages() - 1); }
// 이 노트북의 serve.cjs 로 열었으면 관리자 키를 자동으로 채운다 (data/admin-key.txt)
async function loadLocalAdminKey() {
  if (settings.adminKey || !['localhost', '127.0.0.1'].includes(location.hostname)) return;
  try {
    const res = await fetch('/local/admin-key', { cache: 'no-store' });
    if (!res.ok) return;
    const key = (await res.text()).trim();
    if (key) { settings.adminKey = key; saveSettings(); }
  } catch { /* 키 파일이 없으면 설정 창에서 직접 입력 */ }
}

// 결과 화면 버튼 잠금 시간(초): 게임이 끝나도 계속 쏘는 학생이 버튼을 잘못 누르지 않게
const RESULT_LOCK = 3;

// ---------- 오래 가만히 있으면 처음 화면으로 ----------
// 1인 기록전·2인 대결이 끝난 화면(결과·게임 직후 랭킹)에서 이 시간 동안 아무 입력(총·마우스·키)이 없으면
// 처음 화면으로 돌아가 다음 사람이 바로 시작할 수 있게 한다. 토너먼트는 진행요원이 넘기므로 빼고, 마지막 10초는 알려 준다
const IDLE_TO_TITLE = 60;
const IDLE_WARN = 10;
const idleWatched = () => !settingsOpen() && (game.state === 'solo' || (game.mode !== 'tournament'
  && (game.state === 'result' || (game.state === 'ranking' && rankAfterGame()))));
function noteInput() { game.idleT = 0; }
function updateIdle(dt) {
  if (!idleWatched()) { game.idleT = 0; return; }
  game.idleT = (game.idleT || 0) + dt;
  if (game.idleT >= IDLE_TO_TITLE) goTitle();
}
function drawIdleNotice() {
  if (!idleWatched() || game.idleT < IDLE_TO_TITLE - IDLE_WARN) return;
  const left = Math.ceil(IDLE_TO_TITLE - game.idleT);
  const msg = `${left}초 뒤 처음 화면으로 돌아가요`, y = H - U * 2.6;
  ctx.font = `bold ${Math.round(U * 2.6)}px ${FONT}`;
  const w = ctx.measureText(msg).width + U * 4;
  ctx.fillStyle = 'rgba(10, 2, 2, 0.9)';  // 판 테두리에 겹쳐도 읽히게 어두운 바탕
  ctx.fillRect(W / 2 - w / 2, y - U * 2, w, U * 4);
  text(msg, W / 2, y, U * 2.6, '#ffd9b0', 'center', { live: true });
}

// ---------- 총 연결 화면 (2인 대결용 1P/2P 지정) ----------
function openGunSetup() {
  // 토너먼트 대진표에서 왔으면 닫을 때 대진표로 돌아간다
  game.gunSetupFrom = game.state === 'bracket' ? 'bracket' : 'title';
  game.state = 'gunsetup';
  Guns.assigning = null;
  Guns.message = '';
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave(true));
  updateCornerButtons();
}
function closeGunSetup() {
  if (Guns.calib) { Guns.calib = null; return; } // 보정 중이면 보정만 취소하고 총 연결 화면으로
  Guns.assigning = null;
  if (game.gunSetupFrom === 'bracket' && Tournament.data) { Tournament.showBracket(); return; }
  goTitle();
}
// 두 사람이 겨루려면(2인 대결·토너먼트) 총 2대가 '게임패드(조이스틱 모드)'로 1P·2P 지정돼 있어야 한다.
// 마우스 모드면 두 총이 커서 하나를 같이 움직여 1P 만 점수가 오르므로, 시작하지 않고 총 연결 화면으로 안내한다
function ensureVersusGuns() {
  if (Guns.readyForVersus()) return true;
  openGunSetup();
  Guns.message = Guns.list().length < 2
    ? '두 사람이 겨루려면 두 총을 조이스틱 모드로 연결해야 해요 (지금은 1P 만 점수가 올라요)'
    : '1P·2P 총을 지정해 주세요';
  if (Guns.list().length >= 2) Guns.assigning = Guns.saved.p1 ? 1 : 0;
  return false;
}

// ---------- 총마다 조준 보정 ----------
// 총(수신기)마다 조금씩 위·아래로 어긋나는 걸 게임 안에서 바로잡는다.
// 표적 5개를 차례로 쏘면, 총이 알려 준 위치 → 실제 표적 위치로 옮기는 식(배율 + 이동)을 가로·세로 따로 구해 총마다 저장한다.
const CALIB_POINTS = [[0.5, 0.5], [0.15, 0.18], [0.85, 0.18], [0.85, 0.82], [0.15, 0.82]];
function calibTargets() { return CALIB_POINTS.map(([x, y]) => ({ x: x * W, y: y * H })); }
function startGunCalib(who) {
  const key = who === 0 ? Guns.saved.p1 : Guns.saved.p2;
  if (!key) { Guns.message = `먼저 ${who + 1}P 총을 지정하세요`; return; }
  Guns.assigning = null;
  Guns.calib = { who, key, raw: [] };
}
// 가장 잘 맞는 직선 (최소제곱): 실제 = a × 총 값 + b
function fitLine(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, v) => a + v, 0) / n, my = ys.reduce((a, v) => a + v, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const a = sxx > 1e-6 ? sxy / sxx : 1;
  return { a, b: my - a * mx };
}
function recordCalibShot(s) {
  const c = Guns.calib;
  const o = screenOffset();
  const t = calibTargets()[c.raw.length];
  // 화면(모니터) 전체를 0~1 로 본 값으로 저장 → 프로젝터 해상도가 바뀌어도 그대로 쓸 수 있다
  c.raw.push({ u: s.rawU, v: s.rawV, tu: (t.x + o.x) / screen.width, tv: (t.y + o.y) / screen.height });
  Sound.hit();
  if (c.raw.length < CALIB_POINTS.length) return;
  const fx = fitLine(c.raw.map((p) => p.u), c.raw.map((p) => p.tu));
  const fy = fitLine(c.raw.map((p) => p.v), c.raw.map((p) => p.tv));
  const ok = (f) => f.a > 0.4 && f.a < 2.5 && Math.abs(f.b) < 0.6;
  Guns.calib = null;
  if (!ok(fx) || !ok(fy)) { Guns.message = '보정값이 너무 이상해요. 표적 한가운데를 차례로 다시 쏴 주세요'; return; }
  Guns.saved.calib = { ...(Guns.saved.calib || {}), [c.key]: { ax: fx.a, bx: fx.b, ay: fy.a, by: fy.b } };
  Guns.save();
  Sound.bonus();
  Guns.message = `${c.who + 1}P 조준 보정 완료! 총 테스트(T)로 확인해 보세요`;
}
function clearGunCalib(who) {
  const key = who === 0 ? Guns.saved.p1 : Guns.saved.p2;
  if (Guns.saved.calib && key) { delete Guns.saved.calib[key]; Guns.save(); }
  Guns.calib = null;
  Guns.message = `${who + 1}P 조준 보정을 지웠어요`;
}
function drawGunCalib() {
  const c = Guns.calib;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, color = PLAYER_COLORS[c.who];
  const step = c.raw.length;
  text(`${c.who + 1}P 조준 보정  (${step + 1}/${CALIB_POINTS.length})`, cx, H * 0.27, U * 6, color, 'center', { live: true });
  text(`${c.who + 1}P 총으로 깜빡이는 표적의 한가운데를 정확히 겨누고 쏘세요`, cx, H * 0.27 + U * 7, U * 3.2, '#ffffff');
  text('조준점이 표적과 어긋나 있어도 괜찮아요. 총으로 표적을 겨누세요', cx, H * 0.27 + U * 11.5, U * 2.6, '#ffd9b0');
  const blink = 0.55 + 0.45 * Math.sin(performance.now() / 120);
  calibTargets().forEach((t, i) => {
    const r = U * 4.5;
    if (i < step) { // 이미 쏜 표적
      text('OK', t.x, t.y, U * 4, '#7dff7a');
      return;
    }
    ctx.globalAlpha = i === step ? blink : 0.18;
    for (const [rr, col] of [[r, '#ffffff'], [r * 0.66, '#ff3a2a'], [r * 0.33, '#ffffff']]) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(t.x, t.y, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  const has = !!Guns.saved.calib?.[c.key];
  button('취소', cx - U * 14, H * 0.66, U * 22, U * 7, () => { Guns.calib = null; });
  button('보정 지우기', cx + U * 14, H * 0.66, U * 26, U * 7, () => clearGunCalib(c.who), has);
}
// 현장에서 조준이 거꾸로 움직이면 바로 고칠 수 있게 (설정에도 저장)
function toggleGunSetting(key) {
  if (key === 'gunAxes') settings.gunAxes = { auto: '01', '01': '23', '23': 'auto' }[settings.gunAxes] || 'auto';
  else settings[key] = !settings[key];
  saveSettings();
}

