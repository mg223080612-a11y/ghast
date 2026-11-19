// 가스트 사격 — 총 2대 (게임패드)·총 읽기·키보드 단축키·전체 화면
// game.js 에서 기능별로 나눈 조각. index.html 이 game.js 다음에 차례로 불러오며, 이름(함수·변수)을 모두 함께 쓴다.
'use strict';
// ---------- 총 2대 (게임패드) ----------
// 총 2대가 모두 '마우스'로 들어오면 브라우저는 어느 총이 쐈는지 구분하지 못한다.
// 그래서 엑스거너를 조이스틱 모드(총에서 Space + 5 + 조이스틱 왼쪽)로 두면 총마다 게임패드로 따로 잡히고,
//   조준 = 조이스틱 축(-1 ~ 1) → 화면 위치, 방아쇠 = 버튼 하나
// 로 읽는다. 어느 총이 1P/2P 인지, 어느 버튼이 방아쇠인지는 '총 연결' 화면에서 방아쇠를 당겨 정한다.
const GUN_SAVE_KEY = 'ghast-shooting-guns';
// 맥은 메뉴 막대(화면 맨 위)·Dock 이 availTop/availLeft 에 들어가 있다 (윈도우는 작업 표시줄이 보통 아래라 0)
// → 맥에서 그 값을 화면의 시작점으로 보면 메뉴 막대(Dock) 크기만큼 조준이 어긋난다.
//   맥은 화면 왼쪽 위를 0, 0 으로 본다 (프로젝터는 '미러링'으로 쓰므로 화면이 하나)
const IS_MAC = /Mac/i.test(navigator.userAgentData?.platform || navigator.platform || '');
// 게임 화면(창 안쪽)의 왼쪽 위가 모니터 화면에서 어디에 있는지 (전체화면이면 0, 0)
function screenOffset() {
  if (window.innerWidth >= screen.width && window.innerHeight >= screen.height) return { x: 0, y: 0 };
  const border = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  const left = screen.left ?? (IS_MAC ? 0 : screen.availLeft ?? 0);
  const top = screen.top ?? (IS_MAC ? 0 : screen.availTop ?? 0);
  return {
    x: window.screenX - left + border,
    y: window.screenY - top + Math.max(0, window.outerHeight - window.innerHeight - border),
  };
}

const PARITY_GRID_MS = 25; // 2P 보통 총의 방아쇠가 들어오는 단위 (접시 사격 M0 실측: 25ms 배수)
const PARITY_LINES_PER_MATCH = 30; // 실기 기록 파일에 1P 방아쇠 보정을 발마다 적는 것은 한 경기 처음 30발까지
const Guns = {
  pads: {},       // gamepad.index → { key, id, x, y, pressed[], min[], max[], lastActive }
  // 저장되는 지정 정보: 어떤 총(key)이 1P/2P 인지, 총마다 방아쇠 버튼 번호
  saved: readJson(GUN_SAVE_KEY, { p1: null, p2: null, trigger: {} }),
  assigning: null, // 총 연결 화면에서 지금 지정 중인 자리 (0 = 1P, 1 = 2P)
  seen: {},        // 이번 실행에서 한 번이라도 잡힌 총(수신기) — 빠졌는지 알리려고
  serial: null,    // 앱(desktop/gun-mode.js)이 3초마다 알려 주는 수신기 상태 { at, list: [{ player, state }] }
  serialSeen: {},  // 앱이 한 번이라도 수신기를 본 자리 (빠짐 안내용)
  calib: null,     // 조준 보정 중: { who, key, raw[] }
  message: '',

  save() { writeJson(GUN_SAVE_KEY, this.saved); },
  list() { return Object.values(this.pads); },
  // 최근 몇 초 안에 움직이거나 버튼을 누른 총이 있는지
  active(ms = 5000) { const now = performance.now(); return this.list().some((s) => now - s.lastActive < ms); },
  playerOf(s) { return this.saved.p1 === s.key ? 0 : this.saved.p2 === s.key ? 1 : -1; },
  // X-GUNNER 수신기는 번호가 정해져 있다: 이름 'XGUNNER-P1' · Product 0001 = 1P, P2 · 0002 = 2P (접시 사격과 같은 규칙).
  // 그런 총은 방아쇠를 당긴 순서와 상관없이 그 자리에 자동으로 지정한다 → 1P·2P 가 뒤바뀌지 않는다
  receiverSlot(id) {
    const m = /XGUNNER-P(\d)/i.exec(id) || /Vendor:\s*1209\s+Product:\s*000(\d)/i.exec(id);
    const n = m ? Number(m[1]) : 0;
    return n === 1 || n === 2 ? n - 1 : -1;
  },
  autoAssign(s) {
    const who = this.receiverSlot(s.id);
    if (who < 0 || s.key.includes('#')) return; // 같은 이름의 수신기가 둘이면 자동으로 정할 수 없다
    const slot = who === 0 ? 'p1' : 'p2', other = who === 0 ? 'p2' : 'p1';
    if (this.saved[slot] === s.key && this.saved[other] !== s.key) return;
    this.saved = { ...this.saved, [slot]: s.key, [other]: this.saved[other] === s.key ? null : this.saved[other] };
    this.save();
    fieldLog('총 자리 지정', { 자리: `${who + 1}P`, 총: s.id, 방법: '수신기 번호' });
  },
  // 총 상태 (접시 사격의 총 상태 배너와 같은 생각). 꺼진 총도 수신기는 마지막 위치를 계속 보내서(실측) 켜짐·꺼짐은 구분할 수 없다.
  // 'missing' 이번 실행에서 잡혔던 1P/2P 수신기가 빠짐 · 'silent' 수신기는 있는데 3초 넘게 움직임·방아쇠가 한 번도 없음 · 'ok' · 'none'
  statusOf(who) {
    const key = who === 0 ? this.saved.p1 : this.saved.p2;
    if (!key) return 'none';
    const s = this.list().find((p) => p.key === key);
    if (!s) return this.seen[key] ? 'missing' : 'none';
    return !s.moved && performance.now() - s.connectedAt > 3000 ? 'silent' : 'ok';
  },
  // 앱이 시리얼로 확인한 상태 (최근 10초 안의 것만). 웹 버전이거나 아직 소식이 없으면 null
  serialStateOf(who) {
    const info = this.serial;
    if (!info || performance.now() - info.at > 10000) return null;
    const row = info.list.find((r) => r.player === who + 1);
    if (row) { this.serialSeen[who] = true; return row.state; }
    return this.serialSeen[who] ? 'missing' : 'none';
  },
  statusMessage(players = [0, 1]) {
    const serial = players.map((i) => [i, this.serialStateOf(i)]);
    if (serial.some(([, st]) => st !== null)) {
      const pickS = (kind) => serial.filter(([, st]) => st === kind).map(([i]) => `${i + 1}P`).join('·');
      if (pickS('missing')) return `${pickS('missing')} 총 수신기가 빠졌어요 — 수신기를 다시 꽂으세요`;
      if (pickS('stuck')) return `${pickS('stuck')} 수신기가 응답하지 않아요 — 수신기를 뽑았다가 다시 꽂으세요`;
      if (pickS('off')) return `${pickS('off')} 총이 꺼져 있어요 — 총 전원을 켜세요 (켜면 게임패드 모드로 자동 전환)`;
      // 총은 켜져 있고 전환도 보냈는데 게임에 안 잡힘: 맥은 대부분 입력 모니터링 권한 문제 (수신기에 키보드 기능이 있어 권한이 있어야 열림.
      // 정식 서명이 없는 빌드는 새로 설치할 때마다 권한이 이어지지 않는다 — 2026-11-19 실측). 그 밖에는 총에서 직접 전환
      if (pickS('mouse')) {
        return /Mac/i.test(navigator.platform)
          ? `${pickS('mouse')} 총이 게임에 안 잡혀요 — 시스템 설정 → 개인정보 보호 및 보안 → 입력 모니터링에서 이 앱을 켜고 다시 시작 (안 되면 총에서 Space + 5 + 왼쪽)`
          : `${pickS('mouse')} 총이 게임패드 모드가 아니에요 — 총에서 Space + 5 + 조이스틱 왼쪽을 누르세요`;
      }
      if (pickS('switching')) return `${pickS('switching')} 총을 게임패드 모드로 바꾸는 중… (총을 한 번 흔들어 주세요)`;
    }
    const pick = (kind) => players.filter((i) => this.statusOf(i) === kind).map((i) => `${i + 1}P`).join('·');
    const missing = pick('missing'), silent = pick('silent');
    if (missing) return `${missing} 총 수신기가 빠졌어요 — 수신기를 다시 꽂으세요`;
    if (silent) return `${silent} 총 신호 없음 — 총 전원을 켜고 조이스틱 모드(Space + 5 + 왼쪽)로 바꾼 뒤 한 번 흔들어 주세요`;
    return this.noReceiverMessage(players);
  },
  // 수신기가 처음부터 안 꽂힘 (앱이 시리얼로 확인한 목록에 없고, 이번 실행에서 본 적도 없음. 빠진 경우는 위의 '빠졌어요').
  //   1인 기록전 화면([0])은 아무 수신기도 없을 때만 (2P 수신기만 있어도 1인 기록전은 할 수 있다).
  //   웹 버전은 수신기를 알 수 없어서 알리지 않는다
  noReceiverMessage(players) {
    const info = this.serial;
    if (!info || performance.now() - info.at > 10000 || settings.inputMode !== 'gun') return '';
    const plugged = (i) => this.serialSeen[i] || info.list.some((r) => r.player === i + 1)
      || this.list().some((s) => this.receiverSlot(s.id) === i);
    if (players.length === 1) {
      return info.list.length === 0 && this.list().length === 0 ? '총 수신기가 꽂혀 있지 않아요 — 수신기를 USB 에 꽂으세요' : '';
    }
    const absent = players.filter((i) => !plugged(i)).map((i) => `${i + 1}P`).join('·');
    return absent ? `${absent} 총 수신기가 꽂혀 있지 않아요 — 수신기를 USB 에 꽂으세요` : '';
  },
  // 2인 대결 준비 완료: 1P·2P 로 지정된 총 2대가 지금 게임패드로 연결돼 있음
  readyForVersus() {
    const keys = this.list().map((s) => s.key);
    return !!this.saved.p1 && !!this.saved.p2 && this.saved.p1 !== this.saved.p2
      && keys.includes(this.saved.p1) && keys.includes(this.saved.p2);
  },
  triggerOf(s) { return this.saved.trigger[s.key] ?? 0; },
  // 조준 위치 속도 제한을 쓰는 때: 2인 대결·토너먼트 경기 중 (설정에서 0 이면 제한 없음)
  aimLimited() {
    return isTwoPlayer() && (game.state === 'play' || game.state === 'countdown') && AimCap.gapForHz(settings.versusAimHz) > 0;
  },
  // 1인 기록전 게임 중에는 1P 총만 쓴다: 다른 총(2P 등)은 조준점도 그리지 않고 방아쇠도 무시한다.
  // 1P 총이 연결돼 있지 않으면(2P 수신기만 꽂힌 경우 등) 1인 기록전을 할 수 있게 모든 총을 그대로 쓴다
  hiddenInSolo(s) {
    if (game.mode !== 'solo' || (game.state !== 'play' && game.state !== 'countdown')) return false;
    const p1Connected = this.list().some((p) => p.key === this.saved.p1);
    return p1Connected && s.key !== this.saved.p1;
  },

  // 조준에 쓸 축: 설정에서 고르거나(0·1 / 2·3), 자동이면 더 많이 움직인 쪽
  aimAxes(s, gp) {
    if (settings.gunAxes === '01') return [0, 1];
    if (settings.gunAxes === '23') return [2, 3];
    const span = (i) => (s.max[i] ?? 0) - (s.min[i] ?? 0);
    return gp.axes.length >= 4 && span(2) + span(3) > span(0) + span(1) ? [2, 3] : [0, 1];
  },

  poll() {
    // 블루투스 키보드·마우스·헤드셋도 '게임패드'로 잡히는 경우가 있다 → 총이 아니므로 무시
    // (안 그러면 엉뚱한 조준점이 생기거나, 키보드를 누를 때 헛방이 나갈 수 있다)
    const notGun = /keyboard|mouse|touchpad|headset|headphone|audio|키보드|마우스/i;
    const list = navigator.getGamepads
      ? [...navigator.getGamepads()].filter((g) => g && g.connected !== false && !notGun.test(g.id))
      : [];
    const now = performance.now();
    // 같은 이름의 총이 둘이면 번호를 붙여 구분한다 (DIP 스위치가 같게 맞춰진 경우 등)
    const sameId = (id) => list.filter((g) => g.id === id).length > 1;
    for (const gp of list) {
      const key = sameId(gp.id) ? `${gp.id}#${gp.index}` : gp.id;
      let s = this.pads[gp.index];
      if (!s || s.key !== key) {
        s = this.pads[gp.index] = { key, id: gp.id, index: gp.index, x: W / 2, y: H / 2, pressed: [], min: [], max: [], lastActive: -1e9, moved: false, connectedAt: now };
        fieldLog('총 잡힘', { 총: gp.id, 번호: gp.index, 화면: game.state });
        this.seen[key] = true;
        this.autoAssign(s);
      }
      gp.axes.forEach((v, i) => { s.min[i] = Math.min(s.min[i] ?? v, v); s.max[i] = Math.max(s.max[i] ?? v, v); });
      const [ix, iy] = this.aimAxes(s, gp);
      let ax = gp.axes[ix] ?? 0, ay = gp.axes[iy] ?? 0;
      if (settings.gunInvertX) ax = -ax;
      if (settings.gunInvertY) ay = -ay;
      // 총은 모니터(프로젝터) 화면 전체를 기준으로 조준한다 → 화면 좌표로 바꾼 뒤 게임 창 안 좌표로 옮긴다.
      // 전체화면이면 그대로 같고, 창 모드(제목 표시줄·작업 표시줄이 보일 때)에도 실제로 겨눈 곳과 맞는다
      // 모니터 전체를 0~1 로 본 위치. 총마다 저장된 조준 보정이 있으면 적용한다
      s.rawU = (clamp(ax, -1, 1) + 1) / 2;
      s.rawV = (clamp(ay, -1, 1) + 1) / 2;
      const cal = this.saved.calib?.[key];
      const u = cal ? cal.ax * s.rawU + cal.bx : s.rawU, v = cal ? cal.ay * s.rawV + cal.by : s.rawV;
      const o = screenOffset();
      const nx = clamp(u * screen.width - o.x, 0, W);
      const ny = clamp(v * screen.height - o.y, 0, H);
      // 처음 읽은 값은 '움직임'이 아니다: 꺼진 총의 수신기도 마지막 위치를 계속 보내므로, 실제로 움직여야 조준점을 그린다
      if (s.rx !== undefined && Math.hypot(nx - s.rx, ny - s.ry) > 2) { s.lastActive = now; s.moved = true; }
      // 총 상태 확인용: 1초에 위치가 몇 번 바뀌는지 (총이 화면·센서를 잘 보면 움직일 때 50 이상, 못 보면 한 자리 수)
      const axKey = gp.axes[ix] + ',' + gp.axes[iy];
      if (axKey !== s.axKey) { s.axKey = axKey; s.moves = (s.moves || 0) + 1; s.lastReport = now; }
      if (!s.rateAt || now - s.rateAt >= 1000) {
        s.rate = s.moves || 0; s.moves = 0; s.rateAt = now;
        s.capRate = s.capMoves || 0; s.capMoves = 0;
      }
      s.rx = nx; s.ry = ny;
      // 2인 대결·토너먼트 경기 중에는 총마다 새 위치를 1초에 약 versusAimHz 번만 받는다 (빠른 총이 유리하지 않게).
      // 조준점도 이 위치에 그려서 보이는 곳 = 맞는 곳. 메뉴에서는 그대로 (버튼을 고르기 쉽게)
      const capped = AimCap.nextCappedAim(s.cap || { x: nx, y: ny, at: -1e9 }, nx, ny, now, AimCap.gapForHz(settings.versusAimHz));
      if (!s.cap || capped.at !== s.cap.at) s.capMoves = (s.capMoves || 0) + 1;
      s.cap = capped;
      const limited = this.aimLimited();
      s.x = limited ? capped.x : nx;
      s.y = limited ? capped.y : ny;
      s.axes = [...gp.axes];
      gp.buttons.forEach((b, i) => {
        const down = b.pressed || b.value > 0.5;
        if (down && !s.pressed[i]) { s.lastActive = now; s.moved = true; this.onButton(s, i); }
        s.pressed[i] = down;
      });
    }
    // 뽑힌 총은 목록에서 뺀다
    for (const idx of Object.keys(this.pads)) {
      if (list.some((g) => String(g.index) === idx)) continue;
      const gone = this.pads[idx];
      fieldLog('총 빠짐', { 총: gone.id, 번호: gone.index, 자리: this.playerOf(gone) >= 0 ? `${this.playerOf(gone) + 1}P` : '지정 안 됨', 화면: game.state });
      this.onUnplug(gone);
      delete this.pads[idx];
    }
    this.flushPendingShots(now);
  },

  // 2인 경기(대결·토너먼트·리그) 중 1P/2P 총이 빠지면 P 를 누른 것처럼 멈추고 일시정지 화면에 알린다
  onUnplug(s) {
    const who = this.playerOf(s);
    if (who < 0 || !isTwoPlayer() || game.state !== 'play' || game.paused) return;
    game.paused = true;
    game.pauseNote = { title: `${who + 1}P 총 연결이 끊겼어요`, sub: '총을 다시 연결한 뒤 P 또는 Space 로 계속하세요' };
    fieldLog('총 빠짐으로 일시정지', { 자리: `${who + 1}P`, 모드: MODE_WORDS[game.mode] || game.mode });
  },

  onButton(s, i) {
    Sound.init();
    // 조준 보정 중: 보정하는 총의 방아쇠만 받는다 (다른 총·다른 버튼은 무시)
    if (this.calib) {
      if (s.key === this.calib.key && i === this.triggerOf(s) && allowShot(`pad:${s.key}`, performance.now()).allowed) recordCalibShot(s);
      return;
    }
    // 총 연결 화면: 방아쇠를 당긴 총을 지금 자리(1P/2P)에, 그 버튼을 방아쇠로 기억
    if (this.assigning !== null) {
      const slot = this.assigning === 0 ? 'p1' : 'p2';
      const other = this.assigning === 0 ? 'p2' : 'p1';
      if (this.saved[other] === s.key) { this.message = '그 총은 이미 다른 자리에 지정돼 있어요. 다른 총의 방아쇠를 당기세요'; return; }
      this.saved[slot] = s.key;
      this.saved.trigger[s.key] = i;
      this.save();
      Sound.bonus();
      const done = this.assigning;
      // 1P 를 정했고 2P 가 아직 없으면 바로 2P 지정으로 넘어간다
      this.assigning = done === 0 && !this.saved.p2 ? 1 : null;
      this.message = `${done + 1}P 총을 지정했어요 (방아쇠 = 버튼 ${i})`;
      fieldLog('총 자리 지정', { 자리: `${done + 1}P`, 총: s.id, 방아쇠버튼: i, 방법: '총 연결 화면' });
      return;
    }
    if (i !== this.triggerOf(s)) return; // 방아쇠가 아닌 버튼은 무시
    if (this.hiddenInSolo(s)) return;     // 1인 기록전 중 1P 가 아닌 총은 무시
    // 2인 대결 중에는 지정된 자리로, 그 밖에는 (1인 기록전·메뉴) 1P 로 친다
    let who = 0;
    if (isTwoPlayer() && (game.state === 'play' || game.state === 'countdown')) {
      who = this.playerOf(s);
      if (who < 0) return; // 지정 안 된 총은 대결 중 무시
    }
    if (this.fireParity(s)) {
      const pressed = performance.now();
      const at = AimCap.parityFireAt(pressed, PARITY_GRID_MS, settings.versusFireDelayMs);
      this.pendingShots = [...this.pendingShots, { at, pressed, key: s.key, who, source: `pad:${s.key}` }];
      return;
    }
    onTap(s.x, s.y, who, `pad:${s.key}`);
  },

  // 2인 대결·대회 경기 중 방아쇠 공정성 보정 (접시 사격과 같은 규칙, aim-cap.js 의 parityFireAt):
  //   2P 보통 총은 방아쇠가 25~50ms 늦게 들어온다 → 1P(Pro, 수신기 XGUNNER-P1) 방아쇠도 25~50ms 뒤에 처리한다.
  //   처리할 때의 (속도 제한된) 조준 위치로 판정한다. 1인 기록전·메뉴에서는 바로 처리
  pendingShots: [],
  fireParity(s) {
    return isTwoPlayer() && (game.state === 'play' || game.state === 'countdown')
      && Number(settings.versusFireDelayMs) > 0 && this.receiverSlot(s.id) === 0;
  },
  // 때가 된 1P 방아쇠를 처리한다. 경기가 끝났거나 멈췄으면 보류 중인 사격은 버린다
  flushPendingShots(now) {
    if (!this.pendingShots.length) return;
    const live = isTwoPlayer() && (game.state === 'play' || game.state === 'countdown') && !game.paused;
    const due = this.pendingShots.filter((p) => p.at <= now);
    const dropped = live ? 0 : this.pendingShots.length;
    this.pendingShots = live ? this.pendingShots.filter((p) => p.at > now) : [];
    if (!live) {
      this.parity = { ...this.parity, dropped: this.parity.dropped + dropped };
      fieldLog('1P 방아쇠 보정 버림', { 발수: dropped, 이유: game.paused ? '일시정지' : `경기 중 아님(${game.state})` });
      return;
    }
    for (const p of due) {
      const s = this.list().find((g) => g.key === p.key);
      this.noteParityShot(now - p.pressed, p.at - p.pressed);
      if (s) onTap(s.x, s.y, p.who, p.source);
    }
  },
  // 실기 기록용: 1P 방아쇠를 실제로 몇 ms 늦게 처리했는지 (계획 = 25ms 칸 + 설정값, 실제 = 총 읽기 간격만큼 더 늦을 수 있음)
  parity: { count: 0, sum: 0, max: 0, dropped: 0 },
  resetParity() { this.parity = { count: 0, sum: 0, max: 0, dropped: 0 }; },
  // 발마다 한 줄은 한 경기에 처음 PARITY_LINES_PER_MATCH 발까지만 (연사로 줄이 쌓여 하루 기록 한도를 먼저 채우지 않게).
  // 나머지는 '경기 끝' 의 1P보정 요약(발수·평균·최대)에만 센다
  noteParityShot(lateMs, plannedMs) {
    this.parity = { ...this.parity, count: this.parity.count + 1, sum: this.parity.sum + lateMs, max: Math.max(this.parity.max, lateMs) };
    if (this.parity.count <= PARITY_LINES_PER_MATCH) fieldLog('1P 방아쇠 보정', { 늦춤ms: Math.round(lateMs), 계획ms: Math.round(plannedMs) });
  },
  paritySummary() {
    const { count, sum, max, dropped } = this.parity;
    return { 발수: count, 평균ms: count ? Math.round(sum / count) : 0, 최대ms: Math.round(max), 버림: dropped };
  },

  // 화면에 총 조준점 그리기 (최근에 쓴 총만). 지정된 총은 1P/2P 색과 이름표
  draw(time) {
    const now = performance.now();
    // 이름 입력 창은 캔버스보다 위에 떠서 조준점이 가려진다 → 창 위에 따로 띄운 조준점(#gun-cursor)을 옮긴다
    const recent = (overlayForm() || settingsOpen()) && this.list().filter((s) => now - s.lastActive <= 10000).sort((a, b) => b.lastActive - a.lastActive)[0];
    gunCursor.hidden = !recent;
    if (recent) gunCursor.style.transform = `translate(${recent.x}px, ${recent.y}px)`;
    // 게임 중에는 '큰 조준점' 설정일 때만 총 조준점(과녁)을 그린다. 메뉴·총 테스트에서는 버튼을 고를 수 있게 항상 보인다
    const inGame = (game.state === 'play' || game.state === 'countdown') && !game.paused;
    if (inGame && settings.aimMode !== 'big') return;
    for (const s of this.list()) {
      if (!s.moved || now - s.lastActive > 10000 || this.hiddenInSolo(s)) continue; // 움직인 적 없는 총(꺼진 총의 수신기)은 그리지 않는다
      const who = this.playerOf(s);
      drawAim(s.x, s.y, who >= 0 ? PLAYER_COLORS[who] : null, who >= 0 ? `${who + 1}P` : '총');
    }
  },
};
// 방아쇠를 놓치지 않고 바로 반응하도록, 화면 그리기(1초 60번)와 따로 1초 약 250번 총 상태를 읽는다.
// 방아쇠를 당긴 순간의 조준 위치로 바로 맞았는지 판정하고, 효과는 다음 화면에 그려진다.
setInterval(() => {
  if (W <= 0) return;
  try { Guns.poll(); } catch (err) { reportError(err); } // 총 읽기에서 오류가 나도 계속 읽는다
}, 4);
// 길게 누르기(오른쪽 클릭) 메뉴, 확대 제스처 막기
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  // 확인 창이 떠 있으면 Enter = 선택된 버튼, Esc = 취소, 다른 키는 무시 (꾹 눌러 반복되는 키도 무시)
  if (confirmOpen()) {
    if (e.key === 'Escape') { e.preventDefault(); closeConfirm(false); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const focused = document.activeElement;
      if (!e.repeat && focused && confirmEl.contains(focused) && focused.tagName === 'BUTTON') focused.click();
    }
    return;
  }
  // 맥의 Cmd 조합(Cmd+Q 종료, Cmd+H 숨기기, Cmd+C 복사, Cmd+R 새로 고침 등)은 게임 단축키로 쓰지 않는다
  // (안 그러면 Cmd+R 이 랭킹을, Cmd+C 가 처음 화면을 연다)
  if (e.metaKey) return;
  noteInput();
  // 설정 창·닉네임 입력 중에는 게임 단축키를 쓰지 않는다 (글자 입력과 겹치지 않게)
  if (settingsOpen()) {
    if (e.key === 'Escape') closeSettings();
    return;
  }
  if (nameOpen()) {
    if (e.key === 'Escape') closeNameEntry();
    return;
  }
  // 1인 기록전 화면의 닉네임 칸에 글자를 치는 중: Enter = 시작, Esc = 처음 화면, 나머지는 글자 입력
  if (game.state === 'solo' && SoloReady.isInput(e.target)) {
    if ((e.key === 'Enter' && !e.isComposing) || SoloReady.gunStartKey(e)) {
      e.preventDefault();
      if (SoloReady.keyStartReady(e)) SoloReady.start();
    } else if (e.key === 'Escape') goTitle();
    return;
  }
  if (Tournament.formOpen()) {
    if (e.key === 'Escape') Tournament.closeForm();
    return;
  }
  // 대회 관리 창: Esc = 닫기, 나머지는 이름 칸 글자 입력 (게임 단축키 안 씀)
  if (ContestManage.isOpen()) {
    if (e.key === 'Escape') ContestManage.close();
    return;
  }
  Sound.init();
  // 엑스거너 총에는 q·s·w·a·d·5 같은 키보드 버튼이 달려 있다.
  // 게임 중에 학생이 잘못 눌러 판이 끝나거나(Q) 설정 창이 뜨지(S) 않도록 막는다.
  // 진행요원이 게임을 중단하려면 P(일시정지) → Q.
  const playing = (game.state === 'play' || game.state === 'countdown') && !game.paused;
  if (playing && (e.code === 'KeyQ' || e.code === 'KeyS')) return;
  switch (e.code) {
    case 'Space':
    case 'Enter':
    case 'NumpadEnter':
    case 'Digit1':   // 라이트건의 Start 버튼은 보통 키보드 '1' 로 들어온다
    case 'Numpad1':
      e.preventDefault();
      if (game.state === 'title') SoloReady.open();
      else if (game.state === 'solo') { if (SoloReady.keyStartReady(e)) SoloReady.start(); }
      else if (game.state === 'result' && game.resultTime > RESULT_LOCK) nextPlayer();
      else if (game.state === 'ranking' && game.rankFrom === 'result') { if (game.resultTime > RESULT_LOCK) nextPlayer(); }
      else if (game.state === 'ranking') closeRanking();
      else if (game.state === 'aimtest') goTitle();
      else if (game.state === 'gunsetup') closeGunSetup();
      else if (game.state === 'play' && game.paused) resumeGame();
      else if (game.state === 'bracket') Tournament.startNextIfReady();
      break;
    case 'KeyL': {   // 렉 걸릴 때 바로: 화질 보통 ↔ 가볍게 (+ 효과 줄이기) 바꾸기
      const light = settings.quality === 'light' && settings.fewEffects;
      settings.quality = light ? 'normal' : 'light';
      settings.fewEffects = !light;
      saveSettings();
      resize();
      clearTextCache();
      showBanner(light ? '화질: 보통' : '화질: 가볍게 + 효과 줄이기', 'L 키로 다시 바꿀 수 있어요', '#9ff6ff', 1.6);
      break;
    }
    case 'KeyC':     // 처음 화면 버튼과 같음 (게임 중이면 일시정지하고 한 번 더 묻는다)
      goHome();
      break;
    case 'KeyK':     // 대진표·순위표·우승 화면에서 대회 관리 (이름 고치기·기권·결과 저장). M 은 소리 끄기
      ContestManage.open();
      break;
    case 'Digit2':   // 처음 화면에서 2 = 2인 대결
    case 'Numpad2':
      if (game.state === 'title') { e.preventDefault(); openNameEntry('versus'); }
      break;
    case 'Digit3':   // 처음 화면에서 3 = 토너먼트 (진행 중이면 이어하기)
    case 'Numpad3':
      if (game.state === 'title') { e.preventDefault(); Tournament.open(); }
      break;
    case 'KeyV':     // 조준점 켜기/끄기 (처음 화면에서만. 엑스거너 총의 키 버튼과 겹치지 않는 글자)
      if (game.state === 'title' || game.state === 'solo') toggleAim();
      break;
    case 'KeyG':     // 총 연결 (2인 대결용 1P/2P 지정)
      if (game.state === 'title') openGunSetup();
      else if (game.state === 'gunsetup') closeGunSetup();
      break;
    case 'ArrowLeft':
    case 'PageUp':
      if (game.state === 'ranking') turnRankPage(-1);
      break;
    case 'ArrowRight':
    case 'PageDown':
      if (game.state === 'ranking') turnRankPage(1);
      break;
    case 'KeyR':
      if (game.state === 'title' || (game.state === 'result' && game.resultTime > RESULT_LOCK)) openRanking();
      else if (game.state === 'ranking') closeRanking();
      break;
    case 'KeyT':
      if (game.state === 'title') openAimTest();
      else if (game.state === 'aimtest') goTitle();
      break;
    case 'KeyP':
      if (game.state === 'play') { if (game.paused) resumeGame(); else game.paused = true; }
      break;
    case 'KeyQ':
    case 'Escape':
      if (game.state === 'ranking') closeRanking();
      else if (game.state === 'gunsetup') closeGunSetup();
      // 이름 쏘는 중: [건너뛰기]처럼 원래 닉네임으로 방금 기록은 남긴다 (그냥 처음 화면으로 가면 기록이 사라진다)
      else if (game.state === 'initials') finishInitials(true);
      else if (['aimtest', 'bracket', 'champion', 'solo'].includes(game.state) || e.code === 'KeyQ') goTitle();
      break;
    case 'KeyF':
      toggleFullscreen();
      break;
    case 'KeyM':
      showBanner(Sound.toggleMute() ? '소리 꺼짐' : '소리 켜짐', '', '#ffffff', 1.2);
      break;
    case 'KeyS':
      if (game.state !== 'initials') openSettings(); // 이름 쏘기 판에서는 총의 S 버튼으로 설정 창이 뜨지 않게
      break;
  }
});

function toggleFullscreen() {
  // 컴퓨터용 프로그램(desktop/preload.js)에서는 프로그램 창 자체를 전체화면으로 끄고 켠다
  if (window.ghastApp) { window.ghastApp.toggleFullscreen(); return; }
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}

