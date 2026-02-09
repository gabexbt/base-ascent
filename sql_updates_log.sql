-- UPDATE LOG: Fix Double Up Logic - Remove Leaderboard Sync (User Request)
-- Date: 2026-02-09

-- 1. Update rpc_double_up_run to ONLY update player stats and record transaction.
-- Explicitly REMOVED the leaderboard sync logic as per user instruction.
-- The user must manually "Sync" (Flex) to update the leaderboard.

CREATE OR REPLACE FUNCTION rpc_double_up_run(
    p_fid BIGINT, 
    p_score INT, 
    p_xp INT, 
    p_gold INT,
    p_tx_hash TEXT,
    p_amount_usdc NUMERIC
) RETURNS VOID AS $$
BEGIN
    -- Update Player Stats (Base Stats Only)
    UPDATE players SET 
        total_xp = total_xp + p_xp,
        total_gold = total_gold + p_gold,
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
