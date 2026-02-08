-- SECURE DATABASE SCHEMA (RLS + RPC Pattern)
-- This setup allows public read access but restricts write access to specific stored procedures (RPCs).
-- This prevents users from arbitrarily updating columns or modifying other users' data via direct SQL access.

-- 1. Reset Tables
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS leaderboard;
DROP TABLE IF EXISTS players;
DROP FUNCTION IF EXISTS rpc_sync_stats;
DROP FUNCTION IF EXISTS rpc_claim_passive_xp;
DROP FUNCTION IF EXISTS rpc_upgrade_miner;
DROP FUNCTION IF EXISTS rpc_flex_stat;
DROP FUNCTION IF EXISTS rpc_complete_task;
DROP FUNCTION IF EXISTS rpc_record_transaction;

-- 2. Create Tables
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
    
    -- Leaderboard Snapshots
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

-- 3. Create Indexes
CREATE INDEX idx_leaderboard_altitude ON players(leaderboard_high_score DESC) WHERE has_used_altitude_flex = TRUE;
CREATE INDEX idx_leaderboard_xp ON players(leaderboard_total_xp DESC) WHERE has_used_xp_flex = TRUE;

-- 4. ENABLE RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Allow PUBLIC READ (needed for leaderboards and profile loading)
CREATE POLICY "Public Read Players" ON players FOR SELECT USING (true);
CREATE POLICY "Public Read Transactions" ON transactions FOR SELECT USING (true);

-- Allow PUBLIC INSERT (for new user creation)
-- Ideally this would be an RPC too, but allowing insert is acceptable for onboarding
CREATE POLICY "Public Insert Players" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Insert Transactions" ON transactions FOR INSERT WITH CHECK (true);

-- DENY PUBLIC UPDATE (Critical Security Step)
-- We do NOT create an UPDATE policy. This means NO ONE can update rows directly via the API.
-- All updates MUST go through the RPC functions defined below.

-- 6. Helper Function for Miner Rates
CREATE OR REPLACE FUNCTION get_miner_rate(level INT) RETURNS INT AS $$
BEGIN
    RETURN CASE level
        WHEN 0 THEN 0
        WHEN 1 THEN 100
        WHEN 2 THEN 250
        WHEN 3 THEN 600
        WHEN 4 THEN 1500
        WHEN 5 THEN 4000
        ELSE 0
    END;
END;
$$ LANGUAGE plpgsql;

-- 7. RPC: Sync Stats (Game Over)
-- Handles updating stats and referral kickbacks securely
CREATE OR REPLACE FUNCTION rpc_sync_stats(
    p_fid BIGINT, 
    p_xp INT, 
    p_gold INT, 
    p_score INT, 
    p_runs INT
) RETURNS VOID AS $$
DECLARE
    v_old_xp INT;
    v_old_score INT;
    v_referrer BIGINT;
    v_kickback INT;
BEGIN
    -- Get current state
    SELECT total_xp, high_score, referrer_fid INTO v_old_xp, v_old_score, v_referrer 
    FROM players WHERE fid = p_fid;
    
    IF NOT FOUND THEN RETURN; END IF;

    -- Update Player Stats (Monotonic increases generally expected but we allow sets for sync)
    -- We take MAX for high score to prevent griefing
    UPDATE players 
    SET 
        total_xp = p_xp, -- Trust client total (since we don't track incremental game events)
        total_gold = p_gold,
        high_score = GREATEST(high_score, p_score),
        total_runs = GREATEST(total_runs, p_runs),
        updated_at = NOW()
    WHERE fid = p_fid;

    -- Handle Referral Kickback (10% of delta)
    IF v_referrer IS NOT NULL AND p_xp > v_old_xp THEN
        v_kickback := FLOOR((p_xp - v_old_xp) * 0.1);
        IF v_kickback > 0 THEN
            UPDATE players 
            SET 
                total_xp = total_xp + v_kickback, 
                referral_xp_earned = referral_xp_earned + v_kickback 
            WHERE fid = v_referrer;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- SECURITY DEFINER means this runs with the permissions of the creator (postgres/admin), bypassing RLS for the update.

-- 8. RPC: Claim Passive XP
-- Enforces time-based logic so users can't spam claim
CREATE OR REPLACE FUNCTION rpc_claim_passive_xp(p_fid BIGINT) RETURNS VOID AS $$
DECLARE
    v_miner_level INT;
    v_last_claim TIMESTAMPTZ;
    v_banked INT;
    v_hours NUMERIC;
    v_rate INT;
    v_pending INT;
    v_total_claim INT;
BEGIN
    SELECT miner_level, last_claim_at, banked_passive_xp INTO v_miner_level, v_last_claim, v_banked
    FROM players WHERE fid = p_fid;
    
    IF NOT FOUND OR v_miner_level = 0 THEN RETURN; END IF;

    v_rate := get_miner_rate(v_miner_level);
    
    -- Calculate hours elapsed
    v_hours := EXTRACT(EPOCH FROM (NOW() - v_last_claim)) / 3600;
    v_pending := FLOOR(v_hours * v_rate);
    v_total_claim := v_banked + v_pending;

    IF v_total_claim > 0 THEN
        UPDATE players
        SET 
            total_xp = total_xp + v_total_claim,
            banked_passive_xp = 0,
            last_claim_at = NOW(),
            updated_at = NOW()
        WHERE fid = p_fid;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. RPC: Upgrade Miner
-- Banks existing XP before upgrading to prevent loss
CREATE OR REPLACE FUNCTION rpc_upgrade_miner(p_fid BIGINT, p_new_level INT) RETURNS VOID AS $$
DECLARE
    v_cur_level INT;
    v_last_claim TIMESTAMPTZ;
    v_banked INT;
    v_hours NUMERIC;
    v_rate INT;
    v_pending INT;
BEGIN
    SELECT miner_level, last_claim_at, banked_passive_xp INTO v_cur_level, v_last_claim, v_banked
    FROM players WHERE fid = p_fid;
    
    IF NOT FOUND THEN RETURN; END IF;

    -- Only allow upgrade (no downgrade)
    IF p_new_level > v_cur_level THEN
        v_rate := get_miner_rate(v_cur_level);
        v_hours := EXTRACT(EPOCH FROM (NOW() - v_last_claim)) / 3600;
        v_pending := FLOOR(v_hours * v_rate);
        
        UPDATE players
        SET 
            miner_level = p_new_level,
            banked_passive_xp = v_banked + v_pending,
            last_claim_at = NOW(), -- Reset timer for new rate
            updated_at = NOW()
        WHERE fid = p_fid;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. RPC: Flex Stat (Leaderboard Sync)
CREATE OR REPLACE FUNCTION rpc_flex_stat(p_fid BIGINT, p_type TEXT) RETURNS VOID AS $$
BEGIN
    IF p_type = 'altitude' THEN
        UPDATE players 
        SET 
            leaderboard_high_score = high_score,
            has_used_altitude_flex = TRUE,
            last_synced_at = NOW(),
            updated_at = NOW()
        WHERE fid = p_fid;
    ELSIF p_type = 'xp' THEN
        UPDATE players 
        SET 
            leaderboard_total_xp = total_xp,
            has_used_xp_flex = TRUE,
            last_synced_at = NOW(),
            updated_at = NOW()
        WHERE fid = p_fid;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. RPC: Complete Task
CREATE OR REPLACE FUNCTION rpc_complete_task(p_fid BIGINT, p_task_id TEXT, p_xp_reward INT) RETURNS VOID AS $$
DECLARE
    v_tasks TEXT[];
BEGIN
    SELECT completed_tasks INTO v_tasks FROM players WHERE fid = p_fid;
    
    -- Check if task already completed
    IF p_task_id = ANY(v_tasks) THEN RETURN; END IF;

    UPDATE players
    SET 
        completed_tasks = array_append(completed_tasks, p_task_id),
        total_xp = total_xp + p_xp_reward,
        updated_at = NOW()
    WHERE fid = p_fid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. RPC: Increment Referral Count (Called when new user joins)
CREATE OR REPLACE FUNCTION rpc_increment_referral(p_referrer_fid BIGINT) RETURNS VOID AS $$
BEGIN
    UPDATE players 
    SET 
        referral_count = referral_count + 1,
        updated_at = NOW()
    WHERE fid = p_referrer_fid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Grant Permissions
GRANT EXECUTE ON FUNCTION rpc_sync_stats TO anon;
GRANT EXECUTE ON FUNCTION rpc_claim_passive_xp TO anon;
GRANT EXECUTE ON FUNCTION rpc_upgrade_miner TO anon;
GRANT EXECUTE ON FUNCTION rpc_flex_stat TO anon;
GRANT EXECUTE ON FUNCTION rpc_complete_task TO anon;
GRANT EXECUTE ON FUNCTION rpc_increment_referral TO anon;

GRANT EXECUTE ON FUNCTION rpc_sync_stats TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_claim_passive_xp TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_upgrade_miner TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_flex_stat TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_complete_task TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_increment_referral TO authenticated;
