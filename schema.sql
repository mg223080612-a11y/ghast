-- 가스트 사격·접시 사격 랭킹 (Cloudflare D1) — 최종 모양 참고용
-- 적용은 이 파일이 아니라 마이그레이션으로: npx wrangler d1 migrations apply ghast-db --remote
--   (migrations/0001_init.sql → 0002_game.sql → 0003_plays.sql 순서, 이미 적용한 것은 건너뜀)
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  kills      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,           -- 밀리초 (Date.now())
  game       TEXT    NOT NULL DEFAULT 'ghast'   -- 'ghast' | 'clay'
);
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (score DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_time ON scores (created_at);
CREATE INDEX IF NOT EXISTS idx_scores_game_rank ON scores (game, score DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_game_time ON scores (game, created_at);

-- 이미 쓴 게임 시작 표 (같은 표로 기록을 두 번 올리지 못하게)
CREATE TABLE IF NOT EXISTS used_tokens (
  nonce   TEXT PRIMARY KEY,
  used_at INTEGER NOT NULL
);

-- 1인 기록전 익명 경기 기록 (밸런스 조정용, 0003_plays.sql). 이름·IP 는 남기지 않는다
CREATE TABLE IF NOT EXISTS plays (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  score      INTEGER NOT NULL,
  seconds    INTEGER NOT NULL DEFAULT 0,
  shots      INTEGER NOT NULL DEFAULT 0,
  kills      INTEGER NOT NULL DEFAULT 0,
  deflects   INTEGER NOT NULL DEFAULT 0,
  hits_taken INTEGER NOT NULL DEFAULT 0,
  misses     INTEGER NOT NULL DEFAULT 0,
  escapes    INTEGER NOT NULL DEFAULT 0,
  level      INTEGER NOT NULL DEFAULT 0,
  input      TEXT    NOT NULL DEFAULT 'other',
  client     TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_plays_game_time ON plays (game, created_at);
