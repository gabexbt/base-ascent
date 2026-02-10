import { supabase } from '../lib/supabase';
import { Player, LeaderboardEntry } from '../types';
import { MINER_LEVELS } from '../constants';

export const PlayerService = {
  async getPlayer(fid: number, username: string, pfpUrl?: string, referrer?: string | number): Promise<Player | null> {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('fid', fid)
        .maybeSingle();

      if (!data) {
        // Resolve referrer
        let finalReferrerFid: number | null = null;
        if (referrer) {
          if (typeof referrer === 'number') {
            finalReferrerFid = referrer;
          } else if (!isNaN(Number(referrer))) {
            finalReferrerFid = Number(referrer);
          } else {
            // It's a username string, look it up
            const { data: refUser } = await supabase
              .from('players')
              .select('fid')
              .eq('username', referrer)
              .maybeSingle();
            if (refUser) finalReferrerFid = refUser.fid;
          }
        }
        
        // Prevent self-referral
        if (finalReferrerFid === fid) finalReferrerFid = null;

        const newPlayer = {
          fid,
          username,
          pfp_url: pfpUrl,
          total_xp: 0,
          total_gold: 0,
          high_score: 0,
          leaderboard_high_score: 0,
          leaderboard_total_xp: 0,
          total_runs: 0,
          referral_count: 0,
          referral_xp_earned: 0,
          miner_level: 0,
          referrer_fid: finalReferrerFid,
          has_used_altitude_flex: false,
          has_used_xp_flex: false,
          banked_passive_xp: 0,
          last_claim_at: new Date().toISOString(),
          ascents_remaining: 10,
          upgrades: { rapid_lift: 0, magnet: 0, battery: 0, luck: 0, stabilizer: 0 }
        };

        const { data: created, error: createError } = await supabase
          .from('players')
          .insert([newPlayer])
          .select()
          .maybeSingle();

        if (createError) throw createError;

        if (newPlayer.referrer_fid) {
          await this.incrementReferralCount(newPlayer.referrer_fid);
        }

        return created ? this.mapToPlayer(created) : null;
      }

      // Check for PFP update
      if (pfpUrl && data.pfp_url !== pfpUrl) {
        // Optimistically update PFP in background
        await supabase.from('players').update({ pfp_url: pfpUrl }).eq('fid', fid);
        data.pfp_url = pfpUrl;
      }

      if (error) throw error;
      return this.mapToPlayer(data);
    } catch (e) {
      console.error("PlayerService.getPlayer Error:", e);
      return null;
    }
  },

  async syncPlayerStats(fid: number, totalXp: number, totalGold: number, highScore: number, totalRuns?: number) {
    const { error } = await supabase.rpc('rpc_sync_stats', {
      p_fid: fid,
      p_xp: totalXp,
      p_gold: totalGold,
      p_score: highScore,
      p_runs: totalRuns || 0
    });

    if (error) console.error("Sync Stats Error:", error);
  },

  // Syncs the current actual high score to the leaderboard (Flex)
  async syncAltitude(fid: number) {
    const { error } = await supabase.rpc('rpc_flex_stat', {
      p_fid: fid,
      p_type: 'altitude'
    });
    if (error) {
      console.error("Sync Altitude Error:", error);
      throw error;
    }
  },

  // Syncs the current actual total XP to the leaderboard (Flex)
  async syncXp(fid: number) {
    const { error } = await supabase.rpc('rpc_flex_stat', {
      p_fid: fid,
      p_type: 'xp'
    });
    if (error) {
      console.error("Sync XP Error:", error);
      throw error;
    }
  },

  async upgradeMiner(fid: number, level: number) {
    const { error } = await supabase.rpc('rpc_upgrade_miner', {
      p_fid: fid,
      p_new_level: level
    });
    if (error) {
      console.error("Upgrade Miner Error:", error);
      throw error;
    }
  },

  async updateWalletAddress(fid: number, address: string) {
    const { error } = await supabase
      .from('players')
      .update({ wallet_address: address })
      .eq('fid', fid);

    if (error) {
      console.error("Update Wallet Address Error:", error);
    }
  },

  async claimPassiveXp(fid: number): Promise<void> {
    const { error } = await supabase.rpc('rpc_claim_passive_xp', {
      p_fid: fid
    });
    if (error) console.error("Claim XP Error:", error);
  },

  async incrementReferralCount(referrerFid: number) {
    const { error } = await supabase.rpc('rpc_increment_referral', {
      p_referrer_fid: referrerFid
    });
    if (error) console.error("Increment Referral Error:", error);
  },

  // Deprecated: Handled inside rpc_sync_stats now
  async addReferralXp(referrerFid: number, xpAmount: number) {
    // No-op
  },

  async getLeaderboard(limit: number = 15, sortBy: 'skill' | 'grind' = 'skill'): Promise<LeaderboardEntry[]> {
    // Sort by the Leaderboard Snapshot columns
    const orderBy = sortBy === 'skill' ? 'leaderboard_high_score' : 'leaderboard_total_xp';
    let query = supabase
      .from('players')
      .select('fid, username, pfp_url, miner_level, leaderboard_high_score, leaderboard_total_xp')
      .order(orderBy, { ascending: false })
      .limit(limit);

    if (sortBy === 'skill') {
      query = query.eq('has_used_altitude_flex', true);
    } else {
      query = query.eq('has_used_xp_flex', true);
    }

    const { data, error } = await query;

    if (error) return [];
    return data.map((d, index) => ({
      fid: d.fid,
      username: d.username,
      pfpUrl: d.pfp_url,
      highScore: d.leaderboard_high_score,
      totalXp: d.leaderboard_total_xp,
      minerLevel: d.miner_level,
      rank: index + 1,
    }));
  },

  async getPlayerRank(fid: number, type: 'skill' | 'grind'): Promise<number> {
    const isSkill = type === 'skill';
    const flexField = isSkill ? 'has_used_altitude_flex' : 'has_used_xp_flex';
    
    const { data: p } = await supabase
      .from('players')
      .select(`leaderboard_high_score, leaderboard_total_xp, ${flexField}`)
      .eq('fid', fid)
      .maybeSingle();

    if (!p || !p[flexField]) return 0;

    const score = isSkill ? p.leaderboard_high_score : p.leaderboard_total_xp;
    const orderField = isSkill ? 'leaderboard_high_score' : 'leaderboard_total_xp';

    // Count players with strictly higher score
    const { count } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq(flexField, true)
      .gt(orderField, score);

    return (count || 0) + 1;
  },

  async completeTask(fid: number, taskId: string, xpReward: number, goldReward: number, ascentsReward: number) {
    const { error } = await supabase.rpc('rpc_complete_task', {
      p_fid: fid,
      p_task_id: taskId,
      p_xp_reward: xpReward,
      p_gold_reward: goldReward,
      p_ascents_reward: ascentsReward
    });
    if (error) console.error("Complete Task Error:", error);
  },

  async recordTransaction(fid: number, amountUsdc: string, transactionType: string, transactionHash: string, metadata?: any) {
    const { error } = await supabase.rpc('rpc_record_transaction', {
      p_fid: fid,
      p_amount: amountUsdc,
      p_type: transactionType,
      p_hash: transactionHash,
      p_meta: metadata || {}
    });
    if (error) console.error("Record Transaction Error:", error);
  },

  async purchaseUpgrade(fid: number, type: string, cost: number) {
    const { error } = await supabase.rpc('rpc_purchase_upgrade', {
      p_fid: fid,
      p_upgrade_type: type,
      p_cost: cost
    });
    if (error) {
      console.error("RPC Purchase Upgrade Error:", error);
      throw error;
    }
  },

  async doubleUpRun(fid: number, score: number, xp: number, gold: number, txHash: string, amountUsdc: string) {
    const { error } = await supabase.rpc('rpc_double_up_run', {
      p_fid: fid,
      p_score: score,
      p_xp: xp,
      p_gold: gold,
      p_tx_hash: txHash,
      p_amount_usdc: amountUsdc
    });
    if (error) throw error;
  },

  async startGameAttempt(fid: number): Promise<boolean> {
    const { data, error } = await supabase.rpc('rpc_start_game_attempt', {
      p_fid: fid
    });
    if (error) {
      console.error("Start Game Attempt Error:", error);
      return false;
    }
    return !!data;
  },

  async rechargeAscents(fid: number, amountUsdc: string, txHash: string) {
    const { error } = await supabase.rpc('rpc_recharge_ascents', {
      p_fid: fid,
      p_amount_usdc: amountUsdc,
      p_tx_hash: txHash
    });
    if (error) {
      console.error("Recharge Ascents Error:", error);
      throw error;
    }
  },

  async getGlobalRevenue(): Promise<number> {
    const { data, error } = await supabase
      .from('global_stats')
      .select('total_revenue')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return 0;
    return Number(data.total_revenue);
  },

  mapToPlayer(db: any): Player {
    return {
      fid: db.fid,
      username: db.username,
      pfpUrl: db.pfp_url,
      totalXp: db.total_xp,
      totalGold: db.total_gold,
      highScore: db.high_score,
      totalRuns: db.total_runs,
      referralCount: db.referral_count,
      referralXpEarned: db.referral_xp_earned,
      minerLevel: db.miner_level,
      referrerFid: db.referrer_fid,
      leaderboardHighScore: db.leaderboard_high_score,
      leaderboardTotalXp: db.leaderboard_total_xp,
      hasUsedAltitudeFlex: db.has_used_altitude_flex,
      hasUsedXpFlex: db.has_used_xp_flex,
      completedTasks: db.completed_tasks,
      lastClaimAt: new Date(db.last_claim_at).getTime(),
      bankedPassiveXp: db.banked_passive_xp,
      walletAddress: db.wallet_address,
      ascentsRemaining: db.ascents_remaining || 0,
      upgrades: typeof db.upgrades === 'string' ? JSON.parse(db.upgrades) : (db.upgrades || { rapid_lift: 0, magnet: 0, battery: 0, luck: 0, stabilizer: 0 }),
      resetToken: db.reset_token
    };
  }
};
