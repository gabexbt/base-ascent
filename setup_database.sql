
-- Drop existing tables to start fresh
DROP TABLE IF EXISTS leaderboard CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS players CASCADE;

-- Create players table with new snapshot columns and banked XP
CREATE TABLE players (
  fid BIGINT PRIMARY KEY,
  username TEXT NOT NULL,
  pfp_url TEXT,
  
  -- Core Stats (Real-time)
  total_xp INTEGER DEFAULT 0,
  total_gold INTEGER DEFAULT 0,
  high_score INTEGER DEFAULT 0,
  total_runs INTEGER DEFAULT 0,
  miner_level INTEGER DEFAULT 0,
  
  -- Leaderboard Snapshots (Only updated on Flex/Sync)
  leaderboard_high_score INTEGER DEFAULT 0,
  leaderboard_total_xp INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  
  -- Flex Status
  has_used_altitude_flex BOOLEAN DEFAULT FALSE,
  has_used_xp_flex BOOLEAN DEFAULT FALSE,
  
  -- Passive Income Logic
  last_claim_at TIMESTAMPTZ DEFAULT NOW(),
  banked_passive_xp INTEGER DEFAULT 0, -- Stores unclaimed XP from previous levels when upgrading
  
  -- Referral System
  referrer_fid BIGINT,
  referral_count INTEGER DEFAULT 0,
  referral_xp_earned INTEGER DEFAULT 0,
  
  -- Metadata
  wallet_address TEXT,
  completed_tasks TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create transactions table
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fid BIGINT REFERENCES players(fid),
  amount_usdc NUMERIC,
  transaction_type TEXT, -- 'miner_purchase', 'altitude_flex', 'xp_flex'
  transaction_hash TEXT,
  status TEXT, -- 'pending', 'confirmed', 'failed'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_players_leaderboard_high_score ON players(leaderboard_high_score DESC);
CREATE INDEX idx_players_leaderboard_total_xp ON players(leaderboard_total_xp DESC);
CREATE INDEX idx_players_referrer_fid ON players(referrer_fid);

-- Enable Row Level Security (RLS)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policies (simplified for development, restrict in production)
CREATE POLICY "Public read access for players" ON players FOR SELECT USING (true);
CREATE POLICY "Service role full access players" ON players USING (true) WITH CHECK (true);

CREATE POLICY "Public read access for transactions" ON transactions FOR SELECT USING (true);
CREATE POLICY "Service role full access transactions" ON transactions USING (true) WITH CHECK (true);
