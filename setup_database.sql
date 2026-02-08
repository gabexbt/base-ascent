-- RECREATE DATABASE SCHEMA (Clean Slate, No RLS)

-- 1. Drop existing tables to ensure clean state
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS leaderboard; -- legacy table if exists
DROP TABLE IF EXISTS players;

-- 2. Create Players Table
CREATE TABLE players (
    fid BIGINT PRIMARY KEY,
    username TEXT NOT NULL,
    pfp_url TEXT,
    wallet_address TEXT,
    
    -- Game Stats (Real-time)
    high_score INT DEFAULT 0,
    total_xp INT DEFAULT 0,
    total_gold INT DEFAULT 0,
    total_runs INT DEFAULT 0,
    
    -- Leaderboard Snapshots (Only updated via Flex)
    leaderboard_high_score INT DEFAULT 0,
    leaderboard_total_xp INT DEFAULT 0,
    
    -- Flex Status
    has_used_altitude_flex BOOLEAN DEFAULT FALSE,
    has_used_xp_flex BOOLEAN DEFAULT FALSE,
    last_synced_at TIMESTAMPTZ,
    
    -- Miner System
    miner_level INT DEFAULT 0,
    last_claim_at TIMESTAMPTZ DEFAULT NOW(),
    banked_passive_xp INT DEFAULT 0,
    
    -- Referral System
    referrer_fid BIGINT,
    referral_count INT DEFAULT 0,
    referral_xp_earned INT DEFAULT 0,
    
    -- Task System
    completed_tasks TEXT[] DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Transactions Table
CREATE TABLE transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fid BIGINT REFERENCES players(fid),
    amount_usdc NUMERIC,
    transaction_type TEXT NOT NULL,
    transaction_hash TEXT,
    status TEXT DEFAULT 'pending',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Performance Indexes for Leaderboard
-- Partial indexes are smaller and faster since they only include 'flexed' players
CREATE INDEX idx_leaderboard_altitude ON players(leaderboard_high_score DESC) WHERE has_used_altitude_flex = TRUE;
CREATE INDEX idx_leaderboard_xp ON players(leaderboard_total_xp DESC) WHERE has_used_xp_flex = TRUE;

-- 5. DISABLE RLS (Critical for Dev Preview / Client-side access)
ALTER TABLE players DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;

-- 6. Grant Permissions (just in case)
GRANT ALL ON players TO anon;
GRANT ALL ON players TO authenticated;
GRANT ALL ON players TO service_role;

GRANT ALL ON transactions TO anon;
GRANT ALL ON transactions TO authenticated;
GRANT ALL ON transactions TO service_role;
