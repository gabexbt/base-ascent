-- SECURE DATABASE SCHEMA (RLS + RPC Pattern)
-- 1. Reset Tables
DROP TABLE IF EXISTS global_stats;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS leaderboard; -- Legacy
DROP TABLE IF EXISTS players;
DROP FUNCTION IF EXISTS rpc_sync_stats;
DROP FUNCTION IF EXISTS rpc_claim_passive_xp;
DROP FUNCTION IF EXISTS rpc_upgrade_miner;
DROP FUNCTION IF EXISTS rpc_flex_stat;
DROP FUNCTION IF EXISTS rpc_complete_task;
DROP FUNCTION IF EXISTS rpc_record_transaction;
DROP FUNCTION IF EXISTS rpc_increment_referral;
DROP FUNCTION IF EXISTS rpc_purchase_upgrade;
DROP FUNCTION IF EXISTS rpc_double_up_run;

-- 2. Create Tables
CREATE TABLE players (
    fid BIGINT PRIMARY KEY,
    username TEXT NOT NULL,
    pfp_url TEXT,
    wallet_address TEXT,
    
    -- Game Stats
    high_score INT DEFAULT 0,
    total_xp INT DEFAULT 0,
    total_gold INT DEFAULT 0, -- Earnable currency
    total_runs INT DEFAULT 0,
    
    -- Leaderboard Snapshots
    leaderboard_high_score INT DEFAULT 0,
    leaderboard_total_xp INT DEFAULT 0,
    
    -- Flex Status
    has_used_altitude_flex BOOLEAN DEFAULT FALSE,
    has_used_xp_flex BOOLEAN DEFAULT FALSE,
    last_synced_at TIMESTAMPTZ,
    
    -- Miner System (Paid Multiplier)
    miner_level INT DEFAULT 0,
    last_claim_at TIMESTAMPTZ DEFAULT NOW(),
    banked_passive_xp INT DEFAULT 0,
    
    -- Upgrades (JSONB)
    -- { "rapid_lift": 0, "magnet": 0, "battery": 0, "luck": 0, "stabilizer": 0 }
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
    fid BIGINT REFERENCES players(fid),
    amount_usdc NUMERIC,
    transaction_type TEXT NOT NULL,
    transaction_hash TEXT,
    status TEXT DEFAULT 'pending',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE global_stats (
    id INT PRIMARY KEY DEFAULT 1,
    total_revenue NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize Global Stats
INSERT INTO global_stats (id, total_revenue) VALUES (1, 0) ON CONFLICT DO NOTHING;

-- 3. Create Indexes
CREATE INDEX idx_leaderboard_altitude ON players(leaderboard_high_score DESC) WHERE has_used_altitude_flex = TRUE;
CREATE INDEX idx_leaderboard_xp ON players(leaderboard_total_xp DESC) WHERE has_used_xp_flex = TRUE;

-- 4. ENABLE RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_stats ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Public Read Players" ON players FOR SELECT USING (true);
CREATE POLICY "Public Read Transactions" ON transactions FOR SELECT USING (true);
CREATE POLICY "Public Read GlobalStats" ON global_stats FOR SELECT USING (true);

CREATE POLICY "Public Insert Players" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Insert Transactions" ON transactions FOR INSERT WITH CHECK (true);

-- 6. Helper Function for Miner Rates (Passive Base Generation)
-- This remains as the "Base" passive rate. The Multiplier (Active+Passive) is applied on top.
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

-- Helper for Global Revenue
CREATE OR REPLACE FUNCTION update_global_revenue(p_amount NUMERIC) RETURNS VOID AS $$
BEGIN
    UPDATE global_stats SET total_revenue = total_revenue + p_amount, updated_at = NOW() WHERE id = 1;
END;
$$ LANGUAGE plpgsql;

-- 7. RPC: Sync Stats (Regular Game Over)
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

    -- Referral Kickback: 20%
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

-- 8. RPC: Claim Passive XP
-- Applies Global Multiplier based on Miner Level
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
    
    -- Determine Multiplier
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
    
    -- Apply Multiplier to the TOTAL (Banked + Pending) or just Pending?
    -- Usually banked is already "earned" but unclaimed. 
    -- We'll apply multiplier to the pending portion here. 
    -- (Assuming banked was already calculated with multiplier? No, banked is raw).
    -- Let's apply multiplier to the final claim to be generous/simple.
    
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

-- 9. RPC: Upgrade Miner
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

-- 10. RPC: Purchase Upgrade (Gold Sink)
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
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. RPC: Double Up Run (Pay-to-Climb)
CREATE OR REPLACE FUNCTION rpc_double_up_run(
    p_fid BIGINT, 
    p_score INT, 
    p_xp INT, 
    p_gold INT,
    p_tx_hash TEXT,
    p_amount_usdc NUMERIC
) RETURNS VOID AS $$
DECLARE
    v_old_xp INT;
    v_old_score INT;
BEGIN
    SELECT total_xp, high_score INTO v_old_xp, v_old_score FROM players WHERE fid = p_fid;
    
    -- Update Stats (Doubled values passed from client or logic? Client passes the final doubled values)
    UPDATE players SET 
        total_xp = total_xp + p_xp, -- Add run XP
        total_gold = total_gold + p_gold, -- Add run Gold
        high_score = GREATEST(high_score, p_score),
        updated_at = NOW()
    WHERE fid = p_fid;

    -- Record Transaction
    INSERT INTO transactions (fid, amount_usdc, transaction_type, transaction_hash, status, metadata)
    VALUES (p_fid, p_amount_usdc, 'double_up', p_tx_hash, 'confirmed', jsonb_build_object('score', p_score, 'xp', p_xp));

    -- Update Global Revenue
    PERFORM update_global_revenue(p_amount_usdc);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. RPC: Record Transaction (Generic)
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

-- 13. Flex Stat (No change)
CREATE OR REPLACE FUNCTION rpc_flex_stat(p_fid BIGINT, p_type TEXT) RETURNS VOID AS $$
BEGIN
    IF p_type = 'altitude' THEN
        UPDATE players SET leaderboard_high_score = high_score, has_used_altitude_flex = TRUE, last_synced_at = NOW() WHERE fid = p_fid;
    ELSIF p_type = 'xp' THEN
        UPDATE players SET leaderboard_total_xp = total_xp, has_used_xp_flex = TRUE, last_synced_at = NOW() WHERE fid = p_fid;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 14. Complete Task (No change)
CREATE OR REPLACE FUNCTION rpc_complete_task(p_fid BIGINT, p_task_id TEXT, p_xp_reward INT) RETURNS VOID AS $$
DECLARE v_tasks TEXT[];
BEGIN
    SELECT completed_tasks INTO v_tasks FROM players WHERE fid = p_fid;
    IF p_task_id = ANY(v_tasks) THEN RETURN; END IF;
    UPDATE players SET completed_tasks = array_append(completed_tasks, p_task_id), total_xp = total_xp + p_xp_reward WHERE fid = p_fid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 15. Increment Referral (No change)
CREATE OR REPLACE FUNCTION rpc_increment_referral(p_referrer_fid BIGINT) RETURNS VOID AS $$
BEGIN
    UPDATE players SET referral_count = referral_count + 1 WHERE fid = p_referrer_fid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
