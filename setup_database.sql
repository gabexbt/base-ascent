-- SECURE DATABASE SCHEMA (RLS + RPC Pattern) - Revamped for Ascents
-- 1. Reset Tables
DROP TABLE IF EXISTS global_stats CASCADE;
DROP TABLE IF EXISTS armory_upgrades CASCADE;
DROP TABLE IF EXISTS leaderboard CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS players CASCADE; -- Renamed from users
DROP FUNCTION IF EXISTS rpc_sync_stats;
DROP FUNCTION IF EXISTS rpc_claim_passive_xp;
DROP FUNCTION IF EXISTS rpc_upgrade_miner;
DROP FUNCTION IF EXISTS rpc_flex_stat;
DROP FUNCTION IF EXISTS rpc_complete_task;
DROP FUNCTION IF EXISTS rpc_record_transaction;
DROP FUNCTION IF EXISTS rpc_increment_referral;
DROP FUNCTION IF EXISTS rpc_purchase_upgrade;
DROP FUNCTION IF EXISTS rpc_double_up_run;
DROP FUNCTION IF EXISTS rpc_recharge_ascents; -- New
DROP FUNCTION IF EXISTS rpc_start_game_attempt; -- New

-- 2. Create Tables
CREATE TABLE players (
    fid BIGINT PRIMARY KEY,
    username TEXT NOT NULL,
    pfp_url TEXT,
    wallet_address TEXT,
    
    -- Game Stats
    high_score INT DEFAULT 0,
    total_xp INT DEFAULT 0,
    total_gold INT DEFAULT 0,
    total_runs INT DEFAULT 0,
    
    -- Ascents System (Energy)
    ascents_remaining INT DEFAULT 10,
    
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
    
    -- Upgrades
    upgrades JSONB DEFAULT '{"rapid_lift": 0, "magnet": 0, "battery": 0, "luck": 0, "stabilizer": 0}'::jsonb,

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
    fid BIGINT REFERENCES players(fid) ON DELETE CASCADE,
    amount_usdc NUMERIC,
    transaction_type TEXT NOT NULL,
    transaction_hash TEXT,
    status TEXT DEFAULT 'pending',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE armory_upgrades (
    fid BIGINT REFERENCES players(fid) ON DELETE CASCADE,
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

CREATE TABLE global_stats (
    id INT PRIMARY KEY DEFAULT 1,
    total_revenue NUMERIC DEFAULT 0, -- Renamed from total_usdc
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize Global Stats
INSERT INTO global_stats (id, total_revenue) VALUES (1, 0) ON CONFLICT DO NOTHING;

-- 3. Create Indexes
CREATE INDEX idx_leaderboard_altitude ON leaderboard(high_score DESC);
CREATE INDEX idx_leaderboard_xp ON leaderboard(total_xp DESC);

-- 4. ENABLE RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE armory_upgrades ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Public Read Players" ON players FOR SELECT USING (true);
CREATE POLICY "Public Read Transactions" ON transactions FOR SELECT USING (true);
CREATE POLICY "Public Read Leaderboard" ON leaderboard FOR SELECT USING (true);
CREATE POLICY "Public Read GlobalStats" ON global_stats FOR SELECT USING (true);
CREATE POLICY "Public Read ArmoryUpgrades" ON armory_upgrades FOR SELECT USING (true);

-- Allow Insert/Update for Dev Mode (Broad Access)
CREATE POLICY "Public Insert Players" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Players" ON players FOR UPDATE USING (true);
CREATE POLICY "Public Insert Transactions" ON transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Insert ArmoryUpgrades" ON armory_upgrades FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update ArmoryUpgrades" ON armory_upgrades FOR UPDATE USING (true);

-- 6. Helper Functions

CREATE OR REPLACE FUNCTION get_miner_rate(level INT) RETURNS INT AS $$
BEGIN
    RETURN CASE level
        WHEN 0 THEN 0
        WHEN 1 THEN 1200
        WHEN 2 THEN 3000
        WHEN 3 THEN 6000
        WHEN 4 THEN 9000
        WHEN 5 THEN 12000
        ELSE 0
    END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_global_revenue(p_amount NUMERIC) RETURNS VOID AS $$
BEGIN
    UPDATE global_stats SET total_revenue = total_revenue + p_amount, updated_at = NOW() WHERE id = 1;
END;
$$ LANGUAGE plpgsql;

-- 7. RPC Functions

-- Start Game Attempt (Deduct Ascent)
CREATE OR REPLACE FUNCTION rpc_start_game_attempt(p_fid BIGINT) RETURNS BOOLEAN AS $$
DECLARE
    v_ascents INT;
BEGIN
    SELECT ascents_remaining INTO v_ascents FROM players WHERE fid = p_fid;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    
    IF v_ascents > 0 THEN
        UPDATE players SET ascents_remaining = ascents_remaining - 1, updated_at = NOW() WHERE fid = p_fid;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recharge Ascents
CREATE OR REPLACE FUNCTION rpc_recharge_ascents(
    p_fid BIGINT,
    p_amount_usdc NUMERIC,
    p_tx_hash TEXT
) RETURNS VOID AS $$
BEGIN
    -- Add 10 Ascents
    UPDATE players SET ascents_remaining = ascents_remaining + 10, updated_at = NOW() WHERE fid = p_fid;
    
    -- Record Transaction
    INSERT INTO transactions (fid, amount_usdc, transaction_type, transaction_hash, status, metadata)
    VALUES (p_fid, p_amount_usdc, 'ascent_recharge', p_tx_hash, 'confirmed', '{"ascents_added": 10}'::jsonb);
    
    -- Update Revenue
    PERFORM update_global_revenue(p_amount_usdc);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sync Stats
CREATE OR REPLACE FUNCTION rpc_sync_stats(
    p_fid BIGINT, 
    p_xp INT, 
    p_gold INT, 
    p_score INT, 
    p_runs INT
) RETURNS VOID AS $$
DECLARE
    v_old_xp INT;
    v_referrer BIGINT;
    v_kickback INT;
BEGIN
    SELECT total_xp, referrer_fid INTO v_old_xp, v_referrer FROM players WHERE fid = p_fid;
    IF NOT FOUND THEN RETURN; END IF;
    
    UPDATE players 
    SET 
        total_xp = p_xp,
        total_gold = p_gold,
        high_score = GREATEST(high_score, p_score),
        total_runs = GREATEST(total_runs, p_runs),
        updated_at = NOW()
    WHERE fid = p_fid;

    -- Referral Kickback
    IF v_referrer IS NOT NULL AND p_xp > v_old_xp THEN
        v_kickback := FLOOR((p_xp - v_old_xp) * 0.20);
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

-- Claim Passive XP
CREATE OR REPLACE FUNCTION rpc_claim_passive_xp(p_fid BIGINT) RETURNS VOID AS $$
DECLARE
    v_miner_level INT;
    v_last_claim TIMESTAMPTZ;
    v_banked INT;
    v_hours NUMERIC;
    v_rate INT;
    v_pending INT;
    v_multiplier NUMERIC;
    v_final_claim INT;
BEGIN
    SELECT miner_level, last_claim_at, banked_passive_xp INTO v_miner_level, v_last_claim, v_banked
    FROM players WHERE fid = p_fid;
    
    IF NOT FOUND OR v_miner_level = 0 THEN RETURN; END IF;

    v_rate := get_miner_rate(v_miner_level);
    
    v_multiplier := CASE v_miner_level
        WHEN 0 THEN 1.0
        WHEN 1 THEN 1.1
        WHEN 2 THEN 1.25
        WHEN 3 THEN 1.5
        WHEN 4 THEN 1.75
        WHEN 5 THEN 2.0
        ELSE 1.0
    END;

    v_hours := EXTRACT(EPOCH FROM (NOW() - v_last_claim)) / 3600;
    v_pending := FLOOR(v_hours * v_rate);
    
    v_final_claim := FLOOR((v_banked + v_pending) * v_multiplier);

    IF v_final_claim > 0 THEN
        UPDATE players SET 
            total_xp = total_xp + v_final_claim,
            banked_passive_xp = 0,
            last_claim_at = NOW(),
            updated_at = NOW()
        WHERE fid = p_fid;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Upgrade Miner
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

    IF p_new_level > v_cur_level THEN
        v_rate := get_miner_rate(v_cur_level);
        v_hours := EXTRACT(EPOCH FROM (NOW() - v_last_claim)) / 3600;
        v_pending := FLOOR(v_hours * v_rate);
        
        UPDATE players SET 
            miner_level = p_new_level,
            banked_passive_xp = v_banked + v_pending,
            last_claim_at = NOW(),
            updated_at = NOW()
        WHERE fid = p_fid;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Purchase Upgrade
CREATE OR REPLACE FUNCTION rpc_purchase_upgrade(
    p_fid BIGINT, 
    p_upgrade_type TEXT, 
    p_cost INT
) RETURNS VOID AS $$
DECLARE
    v_gold INT;
    v_upgrades JSONB;
    v_current_level INT;
BEGIN
    SELECT total_gold, upgrades INTO v_gold, v_upgrades FROM players WHERE fid = p_fid;
    IF NOT FOUND THEN RETURN; END IF;

    IF v_gold >= p_cost THEN
        v_current_level := COALESCE((v_upgrades->>p_upgrade_type)::INT, 0);
        
        UPDATE players SET 
            total_gold = total_gold - p_cost,
            upgrades = jsonb_set(v_upgrades, ARRAY[p_upgrade_type], to_jsonb(v_current_level + 1)),
            updated_at = NOW()
        WHERE fid = p_fid;

        INSERT INTO armory_upgrades (fid, upgrade_type, level, updated_at)
        VALUES (p_fid, p_upgrade_type, v_current_level + 1, NOW())
        ON CONFLICT (fid, upgrade_type) DO UPDATE SET
            level = EXCLUDED.level,
            updated_at = NOW();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Double Up Run
CREATE OR REPLACE FUNCTION rpc_double_up_run(
    p_fid BIGINT, 
    p_score INT, 
    p_xp INT, 
    p_gold INT,
    p_tx_hash TEXT,
    p_amount_usdc NUMERIC
) RETURNS VOID AS $$
BEGIN
    UPDATE players SET 
        total_xp = total_xp + p_xp,
        total_gold = total_gold + p_gold,
        high_score = GREATEST(high_score, p_score),
        updated_at = NOW()
    WHERE fid = p_fid;

    INSERT INTO transactions (fid, amount_usdc, transaction_type, transaction_hash, status, metadata)
    VALUES (p_fid, p_amount_usdc, 'double_up', p_tx_hash, 'confirmed', jsonb_build_object('score', p_score, 'xp', p_xp));

    PERFORM update_global_revenue(p_amount_usdc);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record Transaction
CREATE OR REPLACE FUNCTION rpc_record_transaction(
    p_fid BIGINT,
    p_amount NUMERIC,
    p_type TEXT,
    p_hash TEXT,
    p_meta JSONB
) RETURNS VOID AS $$
BEGIN
    INSERT INTO transactions (fid, amount_usdc, transaction_type, transaction_hash, status, metadata)
    VALUES (p_fid, p_amount, p_type, p_hash, 'confirmed', p_meta);

    PERFORM update_global_revenue(p_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Flex Stat
CREATE OR REPLACE FUNCTION rpc_flex_stat(p_fid BIGINT, p_type TEXT) RETURNS VOID AS $$
BEGIN
    IF p_type = 'altitude' THEN
        UPDATE players SET leaderboard_high_score = high_score, has_used_altitude_flex = TRUE, last_synced_at = NOW() WHERE fid = p_fid;
        INSERT INTO leaderboard (fid, username, pfp_url, miner_level, high_score, total_xp, updated_at)
        SELECT fid, username, pfp_url, miner_level, high_score, total_xp, NOW() FROM players WHERE fid = p_fid
        ON CONFLICT (fid) DO UPDATE SET
            username = EXCLUDED.username,
            pfp_url = EXCLUDED.pfp_url,
            miner_level = EXCLUDED.miner_level,
            high_score = EXCLUDED.high_score,
            total_xp = EXCLUDED.total_xp,
            updated_at = NOW();
    ELSIF p_type = 'xp' THEN
        UPDATE players SET leaderboard_total_xp = total_xp, has_used_xp_flex = TRUE, last_synced_at = NOW() WHERE fid = p_fid;
        INSERT INTO leaderboard (fid, username, pfp_url, miner_level, high_score, total_xp, updated_at)
        SELECT fid, username, pfp_url, miner_level, high_score, total_xp, NOW() FROM players WHERE fid = p_fid
        ON CONFLICT (fid) DO UPDATE SET
            username = EXCLUDED.username,
            pfp_url = EXCLUDED.pfp_url,
            miner_level = EXCLUDED.miner_level,
            high_score = EXCLUDED.high_score,
            total_xp = EXCLUDED.total_xp,
            updated_at = NOW();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Complete Task
CREATE OR REPLACE FUNCTION rpc_complete_task(p_fid BIGINT, p_task_id TEXT, p_xp_reward INT, p_gold_reward INT, p_ascents_reward INT) RETURNS VOID AS $$
DECLARE
    v_tasks TEXT[];
BEGIN
    SELECT completed_tasks INTO v_tasks FROM players WHERE fid = p_fid;
    
    IF p_task_id = ANY(v_tasks) THEN
        RETURN;
    END IF;

    UPDATE players 
    SET completed_tasks = array_append(completed_tasks, p_task_id),
        total_xp = total_xp + p_xp_reward,
        total_gold = total_gold + p_gold_reward,
        ascents_remaining = ascents_remaining + p_ascents_reward
    WHERE fid = p_fid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment Referral
CREATE OR REPLACE FUNCTION rpc_increment_referral(p_referrer_fid BIGINT) RETURNS VOID AS $$
BEGIN
    UPDATE players SET referral_count = referral_count + 1 WHERE fid = p_referrer_fid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
