-- DISABLE ROW LEVEL SECURITY (Fix for "Logged in and it's gone")
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform_stats DISABLE ROW LEVEL SECURITY;
ALTER TABLE armory_upgrades DISABLE ROW LEVEL SECURITY;

-- Drop existing policies to be clean
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON users;
DROP POLICY IF EXISTS "Public can insert new player" ON users;
DROP POLICY IF EXISTS "Public can update player stats" ON users;
DROP POLICY IF EXISTS "Transactions viewable by everyone" ON transactions;
DROP POLICY IF EXISTS "Public can insert transactions" ON transactions;

-- Ensure Indexes exist for performance
CREATE INDEX IF NOT EXISTS idx_leaderboard_altitude ON leaderboard(high_score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_xp ON leaderboard(total_xp DESC);
