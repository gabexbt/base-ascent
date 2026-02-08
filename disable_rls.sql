-- DISABLE ROW LEVEL SECURITY (Fix for "Logged in and it's gone")
ALTER TABLE players DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;

-- Drop existing policies to be clean
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON players;
DROP POLICY IF EXISTS "Public can insert new player" ON players;
DROP POLICY IF EXISTS "Public can update player stats" ON players;
DROP POLICY IF EXISTS "Transactions viewable by everyone" ON transactions;
DROP POLICY IF EXISTS "Public can insert transactions" ON transactions;

-- Ensure Indexes exist for performance
CREATE INDEX IF NOT EXISTS idx_leaderboard_altitude ON players(leaderboard_high_score DESC) WHERE has_used_altitude_flex = TRUE;
CREATE INDEX IF NOT EXISTS idx_leaderboard_xp ON players(leaderboard_total_xp DESC) WHERE has_used_xp_flex = TRUE;
