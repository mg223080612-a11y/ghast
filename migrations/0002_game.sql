-- 0002: 게임 구분 (접시 사격 clay 추가). 기존 기록은 모두 'ghast'.
-- 적용: npx wrangler d1 migrations apply ghast-db --remote   (이미 적용됐으면 건너뜀)
ALTER TABLE scores ADD COLUMN game TEXT NOT NULL DEFAULT 'ghast';
CREATE INDEX IF NOT EXISTS idx_scores_game_rank ON scores (game, score DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_game_time ON scores (game, created_at);
