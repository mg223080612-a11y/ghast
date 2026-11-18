// =============================================================
// 토너먼트 명단 읽기·저장 목록 (화면과 상관없는 순수 계산)
//   명단 파일(엑셀 CSV, 한 줄에 한 이름 txt)이나 엑셀에서 복사한 글을 이름 배열로 바꾼다.
//   학생 이름은 게임 코드·저장소에 넣지 않는다 — 명단은 파일로 들고 다니고, 불러온 명단은 그 PC 에만 저장한다.
//   게임(index.html)에서는 전역 Roster 로, 테스트(node)에서는 require 로 쓴다.
// =============================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Roster = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_NAME = 12;      // 게임 이름 칸 길이와 같게
  const MAX_TITLE = 30;
  const MAX_ROSTERS = 10;   // 한 PC 에 남겨 두는 명단 수
  // '이름', '학생 이름', '이름(한글)', '성명', 'name', '닉네임'
  const NAME_HEADER = /이름|성명|^name$|^닉네임$/i;

  // 제어문자와 안 보이는 글자(폭 없는 공백·글자 방향 표시·BOM 등)를 지운다 → 이것만으로 된 이름은 빈 이름이 되어 빠진다
  const INVISIBLE = /[\u0000-\u001f\u007f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
  const cleanCell = (s) => String(s ?? '').replace(INVISIBLE, '').trim();
  const cleanName = (s) => cleanCell(s).slice(0, MAX_NAME);

  // 글 → 줄마다 칸 배열. 탭이 있으면 탭(엑셀 복사), 아니면 쉼표(CSV)로 나눈다.
  // 엑셀 CSV 처럼 따옴표로 감싼 칸 안의 쉼표·줄바꿈·"" 는 한 칸으로 읽는다 (칸 안 줄바꿈은 cleanCell 이 지운다)
  function parseRows(text) {
    const sep = text.includes('\t') ? '\t' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"' && cell.trim() === '') { quoted = true; cell = ''; }
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n') { rows.push([...row, cell]); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    rows.push([...row, cell]);
    return rows.map((cells) => cells.map(cleanCell));
  }

  // 글 → 이름 배열. 칸이 여러 개면 첫 줄의 '이름' 칸을 읽는다
  function parseRoster(text) {
    const rows = parseRows(String(text ?? '').replace(/^\uFEFF/, ''))
      .filter((cells) => cells.some((c) => c !== ''));
    if (rows.length === 0) throw new Error('명단에 이름이 없어요');
    const nameCol = rows[0].findIndex((c) => NAME_HEADER.test(c));
    const multiColumn = rows.some((cells) => cells.length > 1);
    if (multiColumn && nameCol < 0) throw new Error("칸이 여러 개면 첫 줄에 '이름' 칸 제목이 있어야 해요");
    const body = nameCol >= 0 ? rows.slice(1) : rows;
    const col = Math.max(nameCol, 0);
    const names = body.map((cells) => cleanName(cells[col])).filter(Boolean);
    if (names.length === 0) throw new Error('명단에 이름이 없어요');
    return names;
  }

  // '2026-2_캠프_명단.csv' → '2026-2 캠프 명단'
  function titleFromFileName(fileName) {
    const base = String(fileName ?? '').replace(/\.[^.]*$/, '').replace(/_/g, ' ');
    return cleanCell(base).slice(0, MAX_TITLE) || '명단';
  }

  // 같은 제목은 바꾸고 새 명단을 맨 앞에. 원래 목록은 바꾸지 않는다
  function upsertRoster(list, roster) {
    const entry = { title: roster.title, names: [...roster.names] };
    return [entry, ...list.filter((r) => r.title !== roster.title)].slice(0, MAX_ROSTERS);
  }

  function removeRoster(list, title) {
    return list.filter((r) => r.title !== title);
  }

  // localStorage 에서 읽은 값 → 올바른 명단만
  function sanitizeRosters(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r) => r && typeof r.title === 'string' && cleanCell(r.title) && Array.isArray(r.names))
      .map((r) => ({ title: cleanCell(r.title).slice(0, MAX_TITLE), names: r.names.filter((n) => typeof n === 'string').map(cleanName).filter(Boolean) }))
      .filter((r) => r.names.length > 0)
      .slice(0, MAX_ROSTERS);
  }

  return { MAX_ROSTERS, parseRoster, titleFromFileName, upsertRoster, removeRoster, sanitizeRosters };
});
