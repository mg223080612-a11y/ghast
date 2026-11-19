-- 0003: 1인 기록전 익명 경기 기록 (밸런스 조정용). 이름·IP 는 남기지 않는다.
-- 기록을 올릴 때 게임이 함께 보내는 통계(worker.js playInsert, rank-rules.js cleanStats).
-- 적용: npx wrangler d1 migrations apply ghast-db --remote   (이미 적용됐으면 건너뜀)
CREATE TABLE IF NOT EXISTS plays (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game       TEXT    NOT NULL,           -- 'ghast' | 'ghasteasy' | 'ghasthard'
  created_at INTEGER NOT NULL,           -- 밀리초, 1시간 단위로 내림 (랭킹 기록과 바로 이어지지 않게)
  score      INTEGER NOT NULL,
  seconds    INTEGER NOT NULL DEFAULT 0, -- 판 길이 (보너스 시간 포함)
  shots      INTEGER NOT NULL DEFAULT 0,
  kills      INTEGER NOT NULL DEFAULT 0,
  deflects   INTEGER NOT NULL DEFAULT 0, -- 화염구 반사
  hits_taken INTEGER NOT NULL DEFAULT 0, -- 화염구에 맞음
  misses     INTEGER NOT NULL DEFAULT 0, -- 빈 곳 쏨
  escapes    INTEGER NOT NULL DEFAULT 0, -- 가스트 놓침
  level      INTEGER NOT NULL DEFAULT 0,
  input      TEXT    NOT NULL DEFAULT 'other', -- 'gun' | 'touch' | 'mouse' | 'other'
  client     TEXT    NOT NULL DEFAULT ''       -- 'web' 또는 'app 2.2.10' 같은 버전
);
CREATE INDEX IF NOT EXISTS idx_plays_game_time ON plays (game, created_at);
