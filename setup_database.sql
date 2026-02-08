-- RECREATE DATABASE SCHEMA (Clean Slate, No RLS)

-- 1. Drop existing tables to ensure clean state
DROP TABLE IF EXISTS platform_stats;
DROP TABLE IF EXISTS armory_upgrades;
DROP TABLE IF EXISTS leaderboard;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS users;

-- 2. Create Players Table
CREATE TABLE users (
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
    fid BIGINT REFERENCES users(fid),
    amount_usdc NUMERIC,
    transaction_type TEXT NOT NULL,
    transaction_hash TEXT,
    status TEXT DEFAULT 'pending',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE armory_upgrades (
    fid BIGINT REFERENCES users(fid),
    upgrade_type TEXT NOT NULL,
    level INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (fid, upgrade_type)
);

CREATE TABLE leaderboard (
    fid BIGINT PRIMARY KEY,
    username TEXT NOT NULL,
    pfp_url TEXT,
    miner_level INT DEFAULT 0,
    high_score INT DEFAULT 0,
    total_xp INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE platform_stats (
    id INT PRIMARY KEY DEFAULT 1,
    total_usdc NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO platform_stats (id, total_usdc) VALUES (1, 0) ON CONFLICT DO NOTHING;

CREATE INDEX idx_leaderboard_altitude ON leaderboard(high_score DESC);
CREATE INDEX idx_leaderboard_xp ON leaderboard(total_xp DESC);

-- 5. DISABLE RLS (Critical for Dev Preview / Client-side access)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform_stats DISABLE ROW LEVEL SECURITY;
ALTER TABLE armory_upgrades DISABLE ROW LEVEL SECURITY;

-- 6. Grant Permissions (just in case)
GRANT ALL ON users TO anon;
GRANT ALL ON users TO authenticated;
GRANT ALL ON users TO service_role;

GRANT ALL ON transactions TO anon;
GRANT ALL ON transactions TO authenticated;
GRANT ALL ON transactions TO service_role;

GRANT ALL ON leaderboard TO anon;
GRANT ALL ON leaderboard TO authenticated;
GRANT ALL ON leaderboard TO service_role;

GRANT ALL ON platform_stats TO anon;
GRANT ALL ON platform_stats TO authenticated;
GRANT ALL ON platform_stats TO service_role;

GRANT ALL ON armory_upgrades TO anon;
GRANT ALL ON armory_upgrades TO authenticated;
GRANT ALL ON armory_upgrades TO service_role;
