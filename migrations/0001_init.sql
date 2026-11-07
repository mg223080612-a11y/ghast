-- 0001: 처음 스키마 (가스트 사격). 운영 DB 에는 이미 있으므로 IF NOT EXISTS 로 무해.
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  kills      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL            -- 밀리초 (Date.now())
);
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (score DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_time ON scores (created_at);

-- 이미 쓴 게임 시작 표 (같은 표로 기록을 두 번 올리지 못하게)
CREATE TABLE IF NOT EXISTS used_tokens (
  nonce   TEXT PRIMARY KEY,
  used_at INTEGER NOT NULL
);
