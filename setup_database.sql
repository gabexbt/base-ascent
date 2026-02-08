-- Delete existing tables
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS leaderboard; -- If it exists (user mentioned it, but we are merging it into players)
DROP TABLE IF EXISTS players;

-- Create Players Table
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
    banked_passive_xp INT DEFAULT 0, -- Stores unclaimed XP when upgrading
    
    -- Referral System
    referrer_fid BIGINT,
    referral_count INT DEFAULT 0,
    referral_xp_earned INT DEFAULT 0,
    
    -- Task System
    completed_tasks TEXT[] DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Transactions Table
CREATE TABLE transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fid BIGINT REFERENCES players(fid),
    amount_usdc NUMERIC,
    transaction_type TEXT NOT NULL, -- 'miner_purchase', 'altitude_flex_paid', 'xp_flex_paid', 'free'
    transaction_hash TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Indexes for Leaderboard Performance
CREATE INDEX idx_leaderboard_altitude ON players(leaderboard_high_score DESC) WHERE has_used_altitude_flex = TRUE;
CREATE INDEX idx_leaderboard_xp ON players(leaderboard_total_xp DESC) WHERE has_used_xp_flex = TRUE;
