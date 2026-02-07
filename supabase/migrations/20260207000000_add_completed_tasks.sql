
ALTER TABLE players ADD COLUMN IF NOT EXISTS completed_tasks text[] DEFAULT '{}';
