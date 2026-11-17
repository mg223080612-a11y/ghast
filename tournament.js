// =============================================================
// 토너먼트 모드 — 참가자 입력 창 · 대진표 화면 · 경기 진행 · 우승 발표
//   대진표 계산은 tournament-core.js(전역 Bracket), 그리기·점수·경기는 game.js 의 함수를 그대로 쓴다.
//   경기는 2인 대결과 같은 방식(총 2대, 위쪽 자리 = 1P)이고, 시간은 고정(보너스 시간 없음)이다.
//   비기면 15초 연장전을 승부가 날 때까지 반복한다.
//   진행 상황은 이 PC(localStorage)에 저장되어, 프로그램을 껐다 켜도 처음 화면 [토너먼트 이어하기] 로 이어진다.
// =============================================================
const TOURNAMENT_KEY = 'ghast-shooting-tournament';
const TOURNAMENT = {
  overtime: 15,      // 동점이면 이만큼 연장 (초)
  lock: 1.5,         // 대진표가 뜬 뒤 버튼 잠금 (경기 끝까지 쏘던 총알이 '경기 시작'을 누르지 않게)
  defaultCount: 8,   // 처음 열 때 참가 인원
  defaultSeconds: 40,
  minSeconds: 10,
  maxSeconds: 600,
};

const tEntry = document.getElementById('tournament-entry');
const tForm = document.getElementById('tournament-form');
const tNames = document.getElementById('t-names');
const tHint = document.getElementById('t-hint');
const tCount = tForm.elements.count;
const T_HINT = tHint.textContent;
// 명단: 파일로 연 명단은 이 PC 에만 저장 (roster-core.js 의 전역 Roster)
const ROSTER_KEY = 'ghast-shooting-rosters';
const ROSTER_MAX_BYTES = 200 * 1024;
const tRosterList = document.getElementById('t-roster-list');
const tRosterInput = document.getElementById('t-roster-input');
const tRosterDel = document.getElementById('t-roster-del');
// 대회 방식: 토너먼트 | 리그 (한 사람당 정해진 판 수, 점수 합계 순위)
const LEAGUE_FORM = { maxGames: 6 };
const tKindHint = document.getElementById('t-kind-hint');
const tPick = document.getElementById('contest-pick');
const tTitle = document.getElementById('t-title');
let formKind = 'tournament';

// 저장 모양: 토너먼트 { bracket, seconds, diff, current: { id } | null, last: { id, winner, scores, overtime } | null }
//          리그     { league, seconds, diff, current, last: { id, scores, prevRanks } | null }  (league-core.js)
function loadTournament() {
  const d = readJson(TOURNAMENT_KEY, null);
  if (!d) return null;
  const seconds = clamp(Math.round(Number(d.seconds)) || TOURNAMENT.defaultSeconds, TOURNAMENT.minSeconds, TOURNAMENT.maxSeconds);
  const common = { seconds, diff: diffKeyOf(d.diff), current: d.current ?? null, last: d.last ?? null };
  if (League.isValid(d.league)) return { league: d.league, ...common };
  if (Bracket.isValid(d.bracket)) return { bracket: d.bracket, ...common };
  return null;
}

// 경기장에 남은 가스트·화염구를 치우고 메뉴 화면으로
function leaveField() {
  game.paused = false;
  game.confirmHome = false;
  banner = null;
  fireballs = [];
  ghasts.forEach((g) => g.hittable() && g.leave(true));
}

const Tournament = {
  data: loadTournament(),

  set(next) {
    this.data = next;
    if (next) writeJson(TOURNAMENT_KEY, next);
    else { try { localStorage.removeItem(TOURNAMENT_KEY); } catch { /* 저장 불가 환경 */ } }
  },
  bracket() { return this.data?.bracket; },
  isLeague() { return !!this.data?.league; },
  name(id) { return this.isLeague() ? League.playerName(this.data.league, id) : Bracket.playerName(this.bracket(), id); },
  finished() {
    if (!this.data) return false;
    return this.isLeague() ? League.isFinished(this.data.league) : Bracket.isFinished(this.data.bracket);
  },
  inProgress() { return !!this.data && !this.finished(); },
  nextMatch() {
    if (!this.data) return null;
    return this.isLeague() ? League.nextMatch(this.data.league) : Bracket.nextMatch(this.data.bracket);
  },
  findMatch(id) {
    if (!this.data || !id) return null;
    return this.isLeague() ? League.findMatch(this.data.league, id) : Bracket.findMatch(this.data.bracket, id);
  },
  // 처음 화면 버튼 글자
  titleLabel() { return this.inProgress() ? '대회 이어하기' : '대회 모드'; },

  // 처음 화면 [대회 모드] · 3 키: 진행 중이면 대진표·순위표로, 아니면 방식 고르기(토너먼트 · 리그전)
  open() {
    Sound.init();
    if (this.inProgress()) this.showBracket();
    else this.openPick();
  },
  pickOpen() { return !tPick.hidden; },
  openPick() {
    Sound.init();
    if (nameOpen()) closeNameEntry();
    if (game.state !== 'title') goTitle();
    tEntry.hidden = true;
    tPick.hidden = false;
    setTimeout(() => tPick.querySelector(`.contest-opt[data-kind="${settings.contestKind === 'league' ? 'league' : 'tournament'}"]`)?.focus(), 0);
  },
  closePick() { tPick.hidden = true; },

  // ---------- 참가자 입력 창 ----------
  formOpen() { return !tEntry.hidden || !tPick.hidden; },
  openForm() {
    Sound.init();
    if (nameOpen()) closeNameEntry();
    if (game.state !== 'title') goTitle();
    tForm.elements.seconds.value = settings.tournamentSeconds;
    tForm.elements.third.checked = settings.tournamentThird;
    tForm.elements.games.value = String(clamp(Math.round(Number(settings.leagueGames)) || League.DEFAULT_GAMES, 1, LEAGUE_FORM.maxGames));
    // 새 대회는 빈 칸으로 시작한다 (같은 명단은 명단 목록에서 고르면 된다)
    tNames.replaceChildren();
    setNameCount(TOURNAMENT.defaultCount);
    renderRosterList();
    setFormKind(settings.contestKind);
    showHint(T_HINT, false);
    updateDiffButtons();
    tEntry.hidden = false;
    setTimeout(() => nameInputs()[0]?.focus(), 0);
  },
  closeForm() { tEntry.hidden = true; tPick.hidden = true; },

  create(names, opts) {
    const common = { seconds: opts.seconds, diff: opts.diff, current: null, last: null };
    if (opts.kind === 'league') this.set({ league: League.createLeague(names, { games: opts.games }), ...common });
    else this.set({ bracket: Bracket.createBracket(names, { thirdPlace: opts.third }), ...common });
    Sound.bonus();
    this.showBracket();
  },
  // 첫 경기 전에만: 같은 참가자로 대진을 다시 뽑는다
  reshuffle() {
    if (!this.data) return;
    if (this.isLeague()) this.set({ ...this.data, league: League.reshuffle(this.data.league) });
    else this.set({ ...this.data, bracket: Bracket.reshuffle(this.data.bracket) });
    Sound.tick();
  },
  // 진행 중인 대회를 버리고 새로 (진행요원 확인)
  async startOver() {
    if (this.inProgress()) {
      const what = this.isLeague() ? '리그전' : '토너먼트';
      const ok = await askConfirm(`진행 중인 ${what}를 끝내고 새 대회를 만들까요?\n지금 ${this.isLeague() ? '순위표' : '대진표'}는 사라집니다.`, { ok: '새 대회 만들기', danger: true });
      if (!ok) return;
    }
    this.openPick();
  },

  // ---------- 화면 이동 ----------
  // reveal: 경기 직후에 열면 리그 순위표가 1위부터 차례로 나타난다
  showBracket(reveal = false) {
    leaveField();
    this.reveal = reveal && this.isLeague();
    game.state = 'bracket';
    game.resultTime = 0;
    updateCornerButtons();
  },
  showChampion() {
    leaveField();
    game.state = 'champion';
    game.resultTime = 0;
    Sound.reward();
    updateCornerButtons();
  },
  // 경기 결과 화면 → 대진표 (마지막 경기였으면 우승 발표)
  // 리그는 마지막 경기여도 순위표를 먼저 보여 주고, 거기서 [최종 순위 발표]
  afterResult() {
    if (this.isLeague()) this.showBracket(true);
    else if (this.finished()) this.showChampion();
    else this.showBracket();
  },
  // 결과 화면에서 매 프레임 (game.js): 리그는 잠깐 뒤 저절로 순위표로
  tickResult() {
    if (this.isLeague() && game.resultTime > LEAGUE.resultHold) this.afterResult();
  },

  // ---------- 경기 ----------
  startNextIfReady() {
    if (game.resultTime > TOURNAMENT.lock && (!this.isLeague() || leagueRevealDone(this))) this.startNext();
  },
  startNext() {
    const m = this.nextMatch();
    if (!m) { this.showChampion(); return; }
    if (!ensureVersusGuns()) return; // 총 2대가 1P·2P 로 지정돼 있어야 한다 (아니면 총 연결 화면으로)
    this.set({ ...this.data, current: { id: m.id } });
    startGame('tournament', [this.name(m.a), this.name(m.b)], { seconds: this.data.seconds, diff: this.data.diff });
  },
  currentMatch() { return this.findMatch(this.data?.current?.id); },
  // 동점이면 연장전 (토너먼트만. 리그는 점수 합계라 비겨도 그대로 끝)
  tied() {
    if (this.isLeague()) return false;
    const [a, b] = game.players;
    return !!a && !!b && a.score === b.score;
  },
  startOvertime() {
    game.overtime += 1;
    game.timeLeft = TOURNAMENT.overtime;
    Sound.bonus();
    showBanner('연장전!', `동점이라 ${TOURNAMENT.overtime}초 더 — 끝날 때 앞선 사람이 승리`, '#ff8a7a', 2.6);
  },
  // 경기가 끝나면 (endGame) 승자를 대진표에 넣고 저장한다
  finishMatch() {
    const m = this.currentMatch();
    if (!m) return; // 대진표가 바뀌었으면(새 토너먼트 등) 결과를 넣지 않는다
    banner = null; // 경기 막판의 '연장전!'·'레벨 UP!' 안내가 결과 화면에 겹치지 않게
    const scores = game.players.map((p) => p.score);
    if (this.isLeague()) { this.finishLeagueMatch(m, scores); return; }
    const winner = scores[0] > scores[1] ? m.a : m.b;
    try {
      const bracket = Bracket.recordResult(this.data.bracket, m.id, winner, scores);
      this.set({ ...this.data, bracket, current: null, last: { id: m.id, winner, scores, overtime: game.overtime } });
    } catch (err) {
      reportError(err);
    }
  },

  // 리그: 점수를 넣고, 순위표에 ▲▼ 를 그리려고 경기 전 순위를 함께 남긴다
  finishLeagueMatch(m, scores) {
    try {
      const before = League.standings(this.data.league);
      const prevRanks = Object.fromEntries(before.map((r) => [r.id, r.rank]));
      const league = League.recordResult(this.data.league, m.id, scores);
      this.set({ ...this.data, league, current: null, last: { id: m.id, scores, prevRanks } });
    } catch (err) {
      reportError(err);
    }
  },

  // ---------- 경기 결과 화면 (game.js 의 2인 대결 결과 화면 안에서 부른다) ----------
  lastMatch() { return this.findMatch(this.data?.last?.id); },
  resultHeading() {
    if (this.isLeague()) return leagueResultHeading(this);
    const m = this.lastMatch();
    return m ? `${Bracket.matchLabel(this.data.bracket, m)} 종료!` : '경기 종료!';
  },
  resultNote() {
    if (this.isLeague()) return leagueResultNote(this);
    const m = this.lastMatch();
    if (!m) return '';
    const t = this.data.bracket;
    const finalRound = Bracket.roundCount(t) - 1;
    const what = m.id === 'THIRD' ? '3위 확정!'
      : m.round === finalRound ? '토너먼트 우승!'
      : advanceNote(t, m);
    const ot = this.data.last.overtime;
    return `${this.name(m.winner)} ${what}${ot ? `  (연장 ${ot}번)` : ''}`;
  },
  drawResultButtons(cx, by, ready) {
    if (this.isLeague()) { drawLeagueResultButtons(this, cx, by, ready); return; }
    if (this.finished()) {
      button('우승 발표 ▶', cx - U * 20, by, U * 36, U * 9, () => this.showChampion(), ready, true);
      button('대진표 보기', cx + U * 20, by, U * 36, U * 9, () => this.showBracket(), ready);
      return;
    }
    button('대진표 보기 ▶', cx, by, U * 50, U * 9, () => this.showBracket(), ready, true);
  },

  drawBracketScreen(time) {
    if (this.isLeague()) drawLeagueScreen(this, time);
    else drawBracketScreen(this, time);
  },
  drawChampion(time) {
    if (this.isLeague()) drawLeagueChampion(this, time);
    else drawChampionScreen(this, time);
  },
};

// 이긴 사람이 다음 라운드에서 쉬고(부전승) 올라가면 그다음 라운드까지 알려 준다
function advanceNote(t, m) {
  const all = Bracket.rounds(t);
  const next = all[m.round + 1]?.find((x) => x.src.includes(m.index));
  if (next?.bye) return `${Bracket.roundName(t, m.round + 2)} 진출! (${Bracket.roundName(t, m.round + 1)} 부전승)`;
  return `${Bracket.roundName(t, m.round + 1)} 진출!`;
}

// ---------- 참가자 입력 창 도우미 ----------
function nameInputs() { return [...tNames.querySelectorAll('input')]; }
function showHint(message, isError) {
  tHint.textContent = message;
  tHint.classList.toggle('error', isError);
}
// 인원 수만큼 이름 칸을 만든다 (이미 쓴 이름은 남긴다)
function setNameCount(n) {
  const count = clamp(Math.round(Number(n)) || TOURNAMENT.defaultCount, Bracket.MIN_PLAYERS, Bracket.MAX_PLAYERS);
  const keep = nameInputs().map((i) => i.value);
  tCount.value = count;
  const labels = Array.from({ length: count }, (_, i) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.maxLength = 12;
    input.spellcheck = false;
    input.placeholder = '빈 칸: 랜덤';
    input.value = keep[i] ?? '';
    label.append(`${i + 1}`, input);
    return label;
  });
  tNames.replaceChildren(...labels);
  updateKindHint();
}

// ---------- 대회 방식 (토너먼트 · 리그) ----------
function setFormKind(kind) {
  formKind = kind === 'league' ? 'league' : 'tournament';
  document.querySelectorAll('.kind-btn').forEach((b) => b.classList.toggle('on', b.dataset.kind === formKind));
  tForm.querySelector('.t-games').hidden = formKind !== 'league';
  tForm.querySelector('.t-third').hidden = formKind === 'league';
  tTitle.textContent = `${formKind === 'league' ? '리그전' : '토너먼트'} — 참가자를 입력하세요`;
  tForm.querySelector('button[type=submit]').textContent = formKind === 'league' ? '리그 대진 만들기' : '대진표 만들기';
  updateKindHint();
}
// 방식 고르기 창: 고르면 그 방식으로 참가자 입력 창
tPick.querySelectorAll('.contest-opt').forEach((b) => b.addEventListener('click', () => {
  settings = { ...settings, contestKind: b.dataset.kind };
  saveSettings();
  Sound.tick();
  tPick.hidden = true;
  Tournament.openForm();
}));
document.getElementById('contest-cancel').addEventListener('click', () => Tournament.closePick());
// 방식 설명. 리그는 지금 인원·판 수로 짤 수 있는지 함께 알려 준다
function updateKindHint() {
  if (formKind !== 'league') {
    tKindHint.textContent = '지면 탈락 · 이긴 사람이 올라가 우승을 가려요';
    tKindHint.classList.remove('error');
    return;
  }
  const check = League.checkGames(nameInputs().length, tForm.elements.games.value);
  tKindHint.textContent = check.ok ? `${check.message} · 모두 서로 다른 상대 · 점수 합계로 순위` : check.message;
  tKindHint.classList.toggle('error', !check.ok);
}
document.querySelectorAll('.kind-btn').forEach((b) => b.addEventListener('click', () => { setFormKind(b.dataset.kind); Sound.tick(); }));
tForm.elements.games.addEventListener('change', updateKindHint);
// 같은 이름이 있으면 뒤에 숫자를 붙인다 (판다 → 판다2). 12자를 넘지 않게
function uniqueName(base, used) {
  if (!used.includes(base)) return base;
  for (let k = 2; k <= Bracket.MAX_PLAYERS + 1; k++) {
    const candidate = `${base.slice(0, 12 - String(k).length)}${k}`;
    if (!used.includes(candidate)) return candidate;
  }
  return base;
}
// ---------- 명단 (파일 열기 · 저장된 명단 고르기 · 붙여넣기) ----------
const savedRosters = () => Roster.sanitizeRosters(readJson(ROSTER_KEY, []));
function renderRosterList(selected = '') {
  const list = savedRosters();
  const placeholder = new Option(list.length ? '저장된 명단 고르기 ▾' : '저장된 명단 없음', '');
  const options = list.map((r) => new Option(`${r.title} (${r.names.length}명)`, r.title));
  tRosterList.replaceChildren(placeholder, ...options);
  tRosterList.value = list.some((r) => r.title === selected) ? selected : '';
  tRosterDel.disabled = !tRosterList.value;
}
// 이름 배열로 칸을 새로 채운다. 32명이 넘으면 채우지 않는다
function fillNames(names, label) {
  if (names.length > Bracket.MAX_PLAYERS) {
    showHint(`${label} ${names.length}명 — 대회는 ${Bracket.MAX_PLAYERS}명까지예요`, true);
    return false;
  }
  tNames.replaceChildren();
  setNameCount(names.length);
  nameInputs().forEach((input, i) => { input.value = names[i] ?? ''; });
  const fewer = names.length < Bracket.MIN_PLAYERS ? ' · 모자란 칸은 랜덤 닉네임' : '';
  showHint(`${label} ${names.length}명을 넣었어요${fewer} · 대진은 아래 만들기 버튼을 누르면 무작위로 짜요`, false);
  return true;
}
// 한글 윈도우 엑셀의 기본 CSV 는 UTF-8 이 아니라 EUC-KR 이라서 둘 다 읽는다.
// 엑셀 '유니코드 텍스트'(UTF-16, 앞에 BOM)는 BOM 을 보고 UTF-16 으로 읽는다
async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  const [b0, b1] = new Uint8Array(buf.slice(0, 2));
  if (b0 === 0xff && b1 === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (b0 === 0xfe && b1 === 0xff) return new TextDecoder('utf-16be').decode(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('euc-kr').decode(buf); }
}
async function openRosterFile(file) {
  if (/\.xlsx?$/i.test(file.name)) throw new Error("엑셀 파일은 '다른 이름으로 저장 → CSV' 로 바꿔서 열어 주세요");
  if (file.size > ROSTER_MAX_BYTES) throw new Error('파일이 너무 커요 (명단 파일이 맞나요?)');
  const names = Roster.parseRoster(await readTextFile(file));
  const title = Roster.titleFromFileName(file.name);
  if (!fillNames(names, `'${title}'`)) return;
  writeJson(ROSTER_KEY, Roster.upsertRoster(savedRosters(), { title, names }));
  renderRosterList(title);
  // writeJson 은 저장이 안 돼도 조용히 넘어가므로, 다시 읽어서 확인한다
  if (!savedRosters().some((r) => r.title === title)) {
    showHint(`'${title}' ${names.length}명을 넣었지만 이 PC 에 저장하지 못했어요 (이번만 쓰고, 다음에는 파일을 다시 열어 주세요)`, true);
  }
  Sound.tick();
}

document.getElementById('t-roster-file').addEventListener('click', () => tRosterInput.click());
tRosterInput.addEventListener('change', () => {
  const file = tRosterInput.files?.[0];
  tRosterInput.value = ''; // 같은 파일을 다시 골라도 열리게
  if (!file) return;
  openRosterFile(file).catch((err) => showHint(`명단을 읽지 못했어요: ${err.message}`, true));
});
tRosterList.addEventListener('change', () => {
  const roster = savedRosters().find((r) => r.title === tRosterList.value);
  tRosterDel.disabled = !roster;
  if (roster) fillNames(roster.names, `'${roster.title}'`);
});
tRosterDel.addEventListener('click', async () => {
  const title = tRosterList.value;
  if (!title) return;
  if (!(await askConfirm(`'${title}' 명단을 이 PC 에서 지울까요?\n(명단 파일은 그대로 남아요)`, { ok: '지우기', danger: true }))) return;
  writeJson(ROSTER_KEY, Roster.removeRoster(savedRosters(), title));
  renderRosterList();
  showHint(`'${title}' 명단을 이 PC 에서 지웠어요`, false);
});
// 엑셀에서 여러 줄을 복사해 이름 칸에 붙여넣으면 명단으로 채운다 (지금 칸은 모두 바뀜). 한 줄은 보통 붙여넣기
tNames.addEventListener('paste', (e) => {
  const text = e.clipboardData?.getData('text') ?? '';
  if (!/[\r\n]/.test(text.trim())) return;
  e.preventDefault();
  try { fillNames(Roster.parseRoster(text), '붙여넣은 명단'); }
  catch (err) { showHint(`붙여넣기: ${err.message}`, true); }
});

// 칸의 이름을 정리해서 돌려준다. 빈 칸은 랜덤 닉네임
function collectNames() {
  return nameInputs().reduce((used, input) => {
    const typed = cleanName(input.value);
    return [...used, uniqueName(typed || randomNickname(...used), used)];
  }, []);
}

tCount.addEventListener('change', () => setNameCount(tCount.value));
tCount.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  setNameCount(tCount.value);
  nameInputs()[0]?.focus();
});
document.getElementById('t-minus').addEventListener('click', () => setNameCount(Number(tCount.value) - 1));
document.getElementById('t-plus').addEventListener('click', () => setNameCount(Number(tCount.value) + 1));
// 이름 칸에서 Enter: 다음 칸으로, 마지막 칸이면 대진표 만들기
tNames.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || e.target.tagName !== 'INPUT') return;
  e.preventDefault();
  const inputs = nameInputs();
  const next = inputs[inputs.indexOf(e.target) + 1];
  if (next) next.focus();
  else tForm.requestSubmit();
});
document.getElementById('t-random').addEventListener('click', () => {
  const inputs = nameInputs();
  const typed = inputs.map((i) => cleanName(i.value)).filter(Boolean);
  inputs.filter((i) => !cleanName(i.value)).reduce((used, input) => {
    const name = uniqueName(randomNickname(...used), used);
    input.value = name;
    return [...used, name];
  }, typed);
  Sound.tick();
});
document.getElementById('t-cancel').addEventListener('click', () => Tournament.closeForm());
// 이름 칸을 모두 비운다 (인원 수는 그대로)
document.getElementById('t-clear').addEventListener('click', () => {
  nameInputs().forEach((input) => { input.value = ''; });
  tRosterList.value = '';
  tRosterDel.disabled = true;
  showHint('이름 칸을 모두 비웠어요', false);
  Sound.tick();
  nameInputs()[0]?.focus();
});
tForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const seconds = clamp(Math.round(Number(tForm.elements.seconds.value)) || TOURNAMENT.defaultSeconds, TOURNAMENT.minSeconds, TOURNAMENT.maxSeconds);
  const third = tForm.elements.third.checked;
  const games = clamp(Math.round(Number(tForm.elements.games.value)) || League.DEFAULT_GAMES, 1, LEAGUE_FORM.maxGames);
  settings = { ...settings, tournamentSeconds: seconds, tournamentThird: third, contestKind: formKind, leagueGames: games };
  saveSettings();
  try {
    const names = collectNames();
    if (formKind === 'league') {
      const check = League.checkGames(names.length, games);
      if (!check.ok) { showHint(check.message, true); return; }
    }
    Tournament.closeForm();
    Tournament.create(names, { kind: formKind, seconds, third, games, diff: settings.diffLevel });
  } catch (err) {
    showHint(err.message, true);
  }
});

// ---------- 대진표 그리기 ----------
// 왼쪽 절반은 왼쪽에서, 오른쪽 절반은 오른쪽에서 가운데 결승(우승 자리)으로 모인다.
// 자리(r, k) = r 라운드의 k 번째 참가 자리. 결승의 두 자리에서 거꾸로 내려가며 왼쪽·오른쪽을 정하고,
// 1라운드 자리는 쪽마다 위에서부터 한 줄씩, 그다음 라운드 자리는 올라온 자리들의 가운데 높이에 둔다.
// 부전승(쉬고 올라감)은 같은 높이로 곧게 이어진다.
function seatCounts(t, all) {
  return [t.order.length, ...all.map((list) => list.length)];
}
function seatSides(all) {
  const R = all.length;
  const sides = Array.from({ length: R + 1 }, () => []);
  sides[R] = [0];
  for (let r = R - 1; r >= 0; r--) {
    all[r].forEach((m, i) => m.src.forEach((k) => { sides[r][k] = r === R - 1 ? (k === 0 ? -1 : 1) : sides[r + 1][i]; }));
  }
  return sides;
}
// 1라운드 자리 수: 왼쪽·오른쪽과 둘 중 많은 쪽(= 줄 수)
function sideCounts(sides) {
  const counts = { '-1': sides[0].filter((s) => s < 0).length, 1: sides[0].filter((s) => s > 0).length };
  return { counts, rows: Math.max(counts[-1], counts[1]) };
}
function seatRows(all, sides, top, rowH) {
  const { counts, rows } = sideCounts(sides);
  const seen = { '-1': 0, 1: 0 };
  const first = sides[0].map((side) => {
    const j = seen[side];
    seen[side] = j + 1;
    return top + rowH * ((rows - counts[side]) / 2 + j + 0.5);
  });
  return all.reduce((ys, list) => [...ys, list.map((m) => m.src.reduce((sum, k) => sum + ys[ys.length - 1][k], 0) / m.src.length)], [first]);
}
// 자리마다 그 자리를 쓰는 경기와 위치(0 = 위쪽 1P, 1 = 아래쪽 2P)
function seatConsumers(all) {
  return all.map((list) => list.reduce((acc, m) => {
    m.src.forEach((k, pos) => { acc[k] = { m, pos }; });
    return acc;
  }, []));
}
function bracketLayout(t, all) {
  const R = all.length;
  const px = U * 3, py = U * 2, pw = W - U * 6, ph = H - U * 4;
  // 위쪽은 오른쪽 위 운영 버튼(크게 보임)과 제목이 겹치지 않게 조금 비운다
  const top = py + U * 19, bottom = py + ph - U * 24.5;
  const colW = (pw - U * 4) / (2 * R + 1);
  const sides = seatSides(all);
  const rowH = (bottom - top) / sideCounts(sides).rows;
  return {
    R, px, py, pw, ph, top, bottom, colW, rowH, sides,
    ys: seatRows(all, sides, top, rowH),
    consumers: seatConsumers(all),
    counts: seatCounts(t, all),
    left: px + U * 2,
    boxW: colW - U * 3,
    boxH: Math.min(rowH * 0.78, U * 6.5),
    champW: colW - U * 3, // 양옆 결승 진출자 칸과 겹치지 않게 같은 넓이
  };
}
// 자리의 화면 위치. side: -1 왼쪽 · 1 오른쪽 · 0 가운데(우승)
function seatPos(L, r, k) {
  if (r === L.R) return { x: L.left + L.colW * (L.R + 0.5), y: (L.top + L.bottom) / 2, side: 0 };
  const side = L.sides[r][k];
  const col = side > 0 ? 2 * L.R - r : r;
  return { x: L.left + L.colW * (col + 0.5), y: L.ys[r][k], side };
}
// 그 자리에 앉은 사람 (1라운드는 처음 배정, 그다음부터는 앞 경기의 승자)
function seatOccupant(t, all, r, k) {
  return r === 0 ? t.order[k] : all[r - 1][k].winner;
}

// 자리 → 다음 라운드 자리를 잇는 ㄱ자 선. 이긴 쪽은 금색
function drawConnector(L, from, to, won) {
  const fromEdge = from.x - from.side * L.boxW / 2;  // 가운데 쪽 모서리
  const toEdge = to.side === 0 ? to.x + from.side * L.champW / 2 : to.x + to.side * L.boxW / 2;
  const midX = (fromEdge + toEdge) / 2;
  ctx.strokeStyle = won ? '#ffd84a' : 'rgba(255, 170, 120, 0.4)';
  ctx.lineWidth = Math.max(2, U * (won ? 0.55 : 0.3));
  ctx.beginPath();
  ctx.moveTo(fromEdge, from.y);
  ctx.lineTo(midX, from.y);
  ctx.lineTo(midX, to.y);
  ctx.lineTo(toEdge, to.y);
  ctx.stroke();
}

const SEAT_TEXT = { tbd: '#8a7a74', lost: '#7a6a66', won: '#ffffff', plain: '#ffd9b0' };
// 이름 칸 하나. state: 'tbd' 미정 · 'lost' 탈락 · 'won' 이긴 경기 · 'next' 다음 경기(1P/2P 색) · 'plain' 아직 안 함
function drawSeatBox(x, y, w, h, seat, time) {
  const { name, score, state, who } = seat;
  const blink = state === 'next' && Math.sin(time * 6) > 0;
  ctx.fillStyle = state === 'next' ? 'rgba(255, 225, 74, 0.16)' : state === 'won' ? 'rgba(255, 216, 74, 0.12)' : 'rgba(255, 220, 190, 0.07)';
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeStyle = state === 'next' ? (blink ? PLAYER_COLORS[who] : 'rgba(255,255,255,0.5)') : state === 'won' ? '#ffd84a' : 'rgba(255, 170, 120, 0.35)';
  ctx.lineWidth = Math.max(1, U * (state === 'next' ? 0.5 : 0.2));
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  const size = Math.min(h * 0.58, U * 3.2);
  const color = state === 'next' ? PLAYER_COLORS[who] : SEAT_TEXT[state];
  const scoreW = score == null ? 0 : U * 5;
  const label = state === 'tbd' ? '?' : name;
  text(label, x - w / 2 + U, y, fitTextSize(label, size, w - U * 2 - scoreW), color, 'left');
  if (score != null) text(String(score), x + w / 2 - U, y, size * 0.9, state === 'lost' ? '#7a6a66' : '#ffe14a', 'right');
}

// 자리 상태: 그 자리에서 치른(치를) 경기를 보고 정한다
function seatState(t, L, all, r, k, next) {
  const id = seatOccupant(t, all, r, k);
  const name = Bracket.playerName(t, id);
  if (typeof id !== 'number') return { id, name, state: 'tbd', score: null, who: -1 };
  const { m, pos } = L.consumers[r][k];
  if (next && m.id === next.id) return { id, name, state: 'next', score: null, who: pos };
  if (m.bye || typeof m.winner !== 'number') return { id, name, state: 'plain', score: null, who: -1 };
  const score = t.results[m.id]?.scores?.[pos] ?? null;
  return { id, name, state: m.winner === id ? 'won' : 'lost', score, who: -1 };
}

// 쉬고(부전승) 올라가는 자리: 앞 칸은 그리지 않고, 그 자리에서 다음 칸까지 곧은 선에 '부전승'
function byeSourceSeats(all) {
  return new Set(all.flatMap((round, r) => round.filter((m) => m.bye).map((m) => `${r}-${m.src[0]}`)));
}
// first: 1라운드에서 쉬는 사람 — 앞 라운드 선이 없으니 첫 칸 자리에 '부전승' 글자, 거기서 다음 칸까지 짧은 선
function drawByeLine(L, from, to, first) {
  const a = first ? from.x - from.side * L.boxW / 2 : from.x + from.side * L.boxW / 2; // 바깥 모서리(앞 선이 들어오는 곳)
  const b = to.side === 0 ? to.x + from.side * L.champW / 2 : to.x + to.side * L.boxW / 2;
  ctx.strokeStyle = 'rgba(255, 170, 120, 0.4)';
  ctx.lineWidth = Math.max(2, U * 0.3);
  ctx.beginPath();
  ctx.moveTo(a, from.y);
  ctx.lineTo(b, to.y);
  ctx.stroke();
  const size = Math.min(U * 2, L.boxH * 0.4);
  if (first) text('부전승', from.x, from.y, Math.min(U * 2.4, L.boxH * 0.5), '#a08a80');
  else text('부전승', (a + b) / 2, from.y - Math.max(U * 1.6, L.boxH * 0.42), size, '#a08a80');
}

function drawBracketLines(L, t, all) {
  all.forEach((round, r) => round.forEach((m, idx) => {
    const parent = seatPos(L, r + 1, idx);
    if (m.bye) { drawByeLine(L, seatPos(L, r, m.src[0]), parent, r === 0); return; }
    m.src.forEach((k) => {
      const id = seatOccupant(t, all, r, k);
      drawConnector(L, seatPos(L, r, k), parent, !m.bye && typeof id === 'number' && m.winner === id);
    });
  }));
}

function drawBracketSeats(L, t, all, next, time) {
  const hidden = byeSourceSeats(all);
  for (let r = 0; r < L.R; r++) {
    for (let k = 0; k < L.counts[r]; k++) {
      if (hidden.has(`${r}-${k}`)) continue; // 쉬고 올라가는 자리는 다음 칸에만 그린다
      const p = seatPos(L, r, k);
      drawSeatBox(p.x, p.y, L.boxW, L.boxH, seatState(t, L, all, r, k, next), time);
    }
  }
  // 가운데: 우승 자리
  const c = seatPos(L, L.R, 0);
  const champ = all[L.R - 1][0].winner;
  const decided = typeof champ === 'number';
  const h = Math.max(L.boxH, U * 5);
  if (decided) drawCrown(c.x, c.y - h * 1.2, U * 6, time);
  else text('우승', c.x, c.y - h, U * 2.8, '#ffd84a');
  drawSeatBox(c.x, c.y, L.champW, h, { name: Bracket.playerName(t, champ), score: null, state: decided ? 'won' : 'tbd', who: -1 }, time);
}

function drawThirdPlace(L, t, next, time) {
  const m = Bracket.thirdPlaceMatch(t);
  if (!m) return;
  const c = seatPos(L, L.R, 0);
  const h = Math.max(L.boxH, U * 4.5);
  const y0 = c.y + U * 13;
  const decided = typeof m.winner === 'number';
  text('3·4위전', c.x, y0 - h, U * 2.8, '#e09a5a');
  [m.a, m.b].forEach((id, i) => {
    const state = typeof id !== 'number' ? 'tbd' : next?.id === m.id ? 'next' : decided ? (m.winner === id ? 'won' : 'lost') : 'plain';
    const score = decided ? t.results[m.id]?.scores?.[i] ?? null : null;
    drawSeatBox(c.x, y0 + i * (h + U), L.champW, h, { name: Bracket.playerName(t, id), score, state, who: i }, time);
  });
}

function drawBracketHeader(L, tour) {
  const t = tour.data.bracket;
  const d = DIFFICULTIES[tour.data.diff];
  text('토너먼트 대진표', W / 2, L.py + U * 9, U * 6, '#ffcf5a', 'center', { shadow: '#a3200c' });
  const info = `${t.players.length}명  ·  난이도 ${d.label}  ·  한 경기 ${timeLabel(tour.data.seconds)} (동점이면 ${TOURNAMENT.overtime}초 연장)  ·  3·4위전 ${Bracket.thirdPlaceMatch(t) ? '있음' : '없음'}`;
  text(info, W / 2, L.py + U * 14.5, fitTextSize(info, U * 2.6, L.pw - U * 6), '#ffd9b0');
}

function drawBracketFooter(L, tour, next) {
  const t = tour.data.bracket;
  const cx = W / 2, fy = L.py + L.ph - U * 21.5, by = L.py + L.ph - U * 6.5;
  const ready = game.resultTime > TOURNAMENT.lock;
  if (!next) {
    text('모든 경기가 끝났어요!', cx, fy + U * 3, U * 4.4, '#ffe14a');
    button('우승 발표 ▶', cx - U * 20, by, U * 36, U * 8.5, () => tour.showChampion(), ready, true);
    button('새 대회', cx + U * 20, by, U * 36, U * 8.5, () => tour.startOver(), ready);
    return;
  }
  text(`다음 경기  ·  ${Bracket.matchLabel(t, next)}`, cx, fy, U * 3.2, '#ffcf5a');
  const size = U * 4.6, a = `1P ${tour.name(next.a)}`, b = `2P ${tour.name(next.b)}`;
  text(a, cx - U * 6, fy + U * 5.5, fitTextSize(a, size, W * 0.4), PLAYER_COLORS[0], 'right');
  text('VS', cx, fy + U * 5.5, size, '#ff8a3a');
  text(b, cx + U * 6, fy + U * 5.5, fitTextSize(b, size, W * 0.4), PLAYER_COLORS[1], 'left');
  if (Object.keys(t.results).length === 0) button('대진 다시 섞기', cx - U * 40, by, U * 32, U * 8.5, () => tour.reshuffle(), ready);
  button('경기 시작 ▶', cx, by, U * 40, U * 8.5, () => tour.startNext(), ready, true);
  button('새 대회', cx + U * 40, by, U * 32, U * 8.5, () => tour.startOver(), ready);
}

function drawBracketScreen(tour, time) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  if (!tour.data) { goTitle(); return; }
  const t = tour.data.bracket;
  const all = Bracket.rounds(t);
  const L = bracketLayout(t, all);
  panel(L.px, L.py, L.pw, L.ph, 0.88);
  const next = Bracket.nextMatch(t);
  drawBracketHeader(L, tour);
  drawBracketLines(L, t, all);
  drawBracketSeats(L, t, all, next, time);
  drawThirdPlace(L, t, next, time);
  drawBracketFooter(L, tour, next);
}

// ---------- 우승 발표 ----------
function drawChampionScreen(tour, time) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  if (!tour.data) { goTitle(); return; }
  const t = tour.data.bracket;
  const s = Bracket.standings(t);
  // 위쪽은 오른쪽 위 운영 버튼과 붙지 않게 조금 비운다
  const cx = W / 2, pw = Math.min(W - U * 8, U * 120), ph = U * 90;
  const py = panelTopBelowCorner(ph);
  panel(cx - pw / 2, py, pw, ph, 0.88);
  text('토너먼트 우승!', cx, py + U * 8, U * 7, '#ffcf5a', 'center', { shadow: '#a3200c' });
  const cy = py + U * 34;
  drawGlow(cx, cy, U * 30, '255,216,74', 0.35);
  drawCrown(cx, cy - U * 13, U * 16, time);
  const champ = tour.name(s.champion);
  text(champ, cx, cy + U * 2, fitTextSize(champ, U * 13, pw - U * 12), '#ffd84a', 'center', { shadow: '#a3200c' });
  drawSparkles(cx - pw * 0.35, cy - U * 20, pw * 0.7, U * 30, time, 22, 7);
  const names = (ids) => ids.map((id) => tour.name(id)).join(' · ');
  const lines = [
    [`준우승  ${tour.name(s.runnerUp)}`, MEDAL[1]],
    s.third.length ? [`${s.third.length > 1 ? '공동 3위' : '3위'}  ${names(s.third)}`, MEDAL[2]] : null,
    s.fourth.length ? [`4위  ${names(s.fourth)}`, '#c9a89a'] : null,
  ].filter(Boolean);
  lines.forEach(([str, color], i) => text(str, cx, cy + U * (16 + i * 6), fitTextSize(str, U * 4.4, pw - U * 10), color));
  const d = DIFFICULTIES[tour.data.diff];
  text(`${t.players.length}명 참가  ·  난이도 ${d.label}  ·  총 ${Object.keys(t.results).length}경기`, cx, py + ph - U * 17, U * 2.8, '#c9a89a');
  const ready = game.resultTime > RESULT_LOCK;
  const by = py + ph - U * 8;
  button('대진표 보기', cx - U * 33, by, U * 29, U * 9, () => tour.showBracket(), ready);
  button('새 대회', cx, by, U * 29, U * 9, () => tour.openPick(), ready, true);
  button('처음 화면', cx + U * 33, by, U * 29, U * 9, goTitle, ready);
}
