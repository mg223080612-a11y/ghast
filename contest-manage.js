// =============================================================
// 대회 관리 창 — 이름 고치기 · 기권 · 결과 저장(CSV)
//   대진표·순위표·우승 화면에서 오른쪽 위 [대회 관리] 또는 K 키로 연다.
//   진행요원용이라 마우스·키보드로만 조작한다 (form 이 아니어서 총으로는 누를 수 없고, 열려 있는 동안 총알은 무시 — game.js onTap).
//   계산은 tournament-core.js · league-core.js(renamePlayer · recordForfeit · withdraw), CSV 는 contest-csv.js.
//   기권도 결과 기록(history)에 들어가므로 대진표의 [결과 취소]로 하나씩 되돌릴 수 있다.
// =============================================================
const manageEl = document.getElementById('contest-manage');
const manageList = document.getElementById('manage-list');
const manageHint = document.getElementById('manage-hint');
const MANAGE_STATES = ['bracket', 'champion'];

const ContestManage = {
  isOpen() { return !manageEl.hidden; },
  canOpen() { return !!Tournament.data && MANAGE_STATES.includes(game.state); },
  open() {
    if (!this.canOpen()) return;
    Sound.init();
    renderManage();
    setManageHint('', false);
    manageEl.hidden = false;
    setTimeout(() => document.getElementById('manage-close').focus(), 0);
  },
  close() { manageEl.hidden = true; },
};

function setManageHint(message, isError) {
  manageHint.textContent = message;
  manageHint.classList.toggle('error', !!isError);
}

// ---------- 선수 목록 ----------
function renderManage() {
  const d = Tournament.data;
  if (!d) { ContestManage.close(); return; }
  const players = Tournament.isLeague() ? d.league.players : d.bracket.players;
  manageList.replaceChildren(...players.map((p) => manageRow(p)));
}

function manageRow(p) {
  const row = document.createElement('div');
  row.className = 'manage-row';
  const input = document.createElement('input');
  input.value = p.name;
  input.maxLength = 12;
  input.spellcheck = false;
  input.setAttribute('aria-label', `${p.name} 이름`);
  const rename = document.createElement('button');
  rename.type = 'button';
  rename.textContent = '바꾸기';
  rename.addEventListener('click', () => renamePlayer(p.id, input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); renamePlayer(p.id, input.value); }
  });
  const status = document.createElement('span');
  status.className = 'manage-status';
  const { label, canForfeit } = playerStatus(p.id);
  status.textContent = label;
  // 기권 버튼이 없는 줄도 같은 칸 수로 (줄마다 칸 너비가 어긋나지 않게)
  const quit = document.createElement(canForfeit ? 'button' : 'span');
  if (canForfeit) {
    quit.type = 'button';
    quit.className = 'danger';
    quit.textContent = '기권';
    quit.addEventListener('click', () => forfeitPlayer(p.id));
  }
  row.append(input, rename, status, quit);
  return row;
}

// 선수 상태 글자와 지금 기권할 수 있는지
function playerStatus(id) {
  const d = Tournament.data;
  if (Tournament.isLeague()) {
    const left = League.matches(d.league).filter((m) => !m.done && (m.a === id || m.b === id)).length;
    const quit = League.standings(d.league).find((r) => r.id === id)?.withdrawn;
    if (quit) return { label: '기권함', canForfeit: false };
    return { label: left ? `남은 경기 ${left}` : '경기 끝', canForfeit: left > 0 };
  }
  const t = d.bracket;
  const m = Bracket.forfeitableMatch(t, id);
  if (m) return { label: `${Bracket.matchLabel(t, m)} 앞둠`, canForfeit: true };
  const quit = Object.values(t.results).some((r) => r.forfeit === id);
  const lost = Bracket.rounds(t).flat().some((x) => !x.bye && typeof x.winner === 'number' && (x.a === id || x.b === id) && x.winner !== id);
  if (quit) return { label: '기권함', canForfeit: false };
  return { label: lost ? '탈락' : Bracket.isFinished(t) ? '끝' : '상대 기다리는 중', canForfeit: false };
}

// ---------- 이름 고치기 ----------
function renamePlayer(id, name) {
  const d = Tournament.data;
  if (!d) return;
  try {
    const contest = Tournament.isLeague()
      ? { league: League.renamePlayer(d.league, id, name) }
      : { bracket: Bracket.renamePlayer(d.bracket, id, name) };
    Tournament.set({ ...d, ...contest });
  } catch (err) {
    setManageHint(err.message, true);
    return;
  }
  Sound.tick();
  renderManage();
  setManageHint(`이름을 '${Tournament.name(id)}'(으)로 바꿨어요`, false);
}

// ---------- 기권 ----------
async function forfeitPlayer(id) {
  const d = Tournament.data;
  if (!d) return;
  const name = Tournament.name(id);
  const message = Tournament.isLeague()
    ? `${name} 선수를 기권 처리할까요?\n남은 경기는 모두 ${name} 0점, 상대는 지금까지의 한 판 평균 점수를 받아요.`
    : forfeitMessage(d.bracket, id, name);
  const ok = await askConfirm(message, { ok: '기권 처리', danger: true });
  // 창이 열린 사이에 대회가 바뀌었으면 그만둔다
  if (!ok || Tournament.data !== d || !ContestManage.isOpen()) return;
  try {
    const { contest, ids } = forfeitResult(d, id);
    Tournament.set({ ...d, ...contest, current: null, last: null, history: [...Tournament.history(), ...ids] });
  } catch (err) {
    setManageHint(err.message, true);
    return;
  }
  Sound.tick();
  ContestManage.close();
  if (!Tournament.isLeague() && Tournament.finished()) Tournament.showChampion();
  else Tournament.showBracket();
}

function forfeitMessage(t, id, name) {
  const m = Bracket.forfeitableMatch(t, id);
  const other = m ? Tournament.name(m.a === id ? m.b : m.a) : '';
  return `${name} 선수를 기권 처리할까요?\n${m ? Bracket.matchLabel(t, m) : ''} — ${other} 선수가 경기 없이 올라가요.`;
}

function forfeitResult(d, id) {
  if (Tournament.isLeague()) {
    const { league, ids } = League.withdraw(d.league, id);
    return { contest: { league }, ids };
  }
  const m = Bracket.forfeitableMatch(d.bracket, id);
  if (!m) throw new Error('지금 기권할 수 있는 경기가 없어요');
  return { contest: { bracket: Bracket.recordForfeit(d.bracket, m.id, id) }, ids: [m.id] };
}

// ---------- 결과 취소 묶음 (tournament.js undoLast) ----------
// 되돌릴 결과 id 들: 보통은 마지막 하나. 마지막이 리그 기권이면 같은 사람의 기권 결과를 뒤에서부터 모두
function undoGroup(tour) {
  const history = tour.history();
  const last = history.at(-1);
  if (!last || !tour.isLeague()) return last ? [last] : [];
  const quitter = tour.data.league.results[last]?.forfeit;
  if (quitter === undefined) return [last];
  const sameQuit = (id) => tour.data.league.results[id]?.forfeit === quitter;
  const start = history.length - [...history].reverse().findIndex((id) => !sameQuit(id));
  return history.slice(start === history.length + 1 ? 0 : start);
}
function undoGroupLabel(tour, ids) {
  if (ids.length === 1 && !(tour.isLeague() && tour.data.league.results[ids[0]]?.forfeit !== undefined)) return tour.undoLabel(ids[0]);
  const quitter = tour.data.league.results[ids[0]].forfeit;
  return `${tour.name(quitter)} 선수 기권 · ${ids.length}경기`;
}

// ---------- 결과 저장 (CSV) ----------
// 브라우저·앱 모두 다운로드로 저장한다 (앱은 저장 위치를 묻는다)
function localDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function saveContestCsv() {
  const d = Tournament.data;
  if (!d) return;
  const date = localDate();
  const kind = Tournament.isLeague() ? '리그전' : '토너먼트';
  const title = `가스트 사격 ${kind}`;
  try {
    const csv = Tournament.isLeague()
      ? ContestCsv.leagueCsv(d.league, { title, date })
      : ContestCsv.bracketCsv(d.bracket, { title, date });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title} 결과 ${date}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setManageHint(`'${a.download}' 로 저장했어요 (엑셀에서 열 수 있어요)`, false);
  } catch (err) {
    reportError(err);
    setManageHint('결과 파일을 만들지 못했어요', true);
  }
}

document.getElementById('manage-close').addEventListener('click', () => ContestManage.close());
document.getElementById('manage-save').addEventListener('click', saveContestCsv);
document.getElementById('btn-manage').addEventListener('click', (e) => {
  e.currentTarget.blur();
  ContestManage.open();
});
// 창 바깥(어두운 곳)을 누르면 닫는다
manageEl.addEventListener('click', (e) => { if (e.target === manageEl) ContestManage.close(); });
