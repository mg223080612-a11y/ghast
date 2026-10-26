-- 가스트 사격 랭킹 (Cloudflare D1)
-- 적용: npx wrangler d1 execute ghast-db --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  kills      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL            -- 밀리초 (Date.now())
);
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (score DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_time ON scores (created_at);
