import { supabase } from '../lib/supabase';
import { Player, LeaderboardEntry } from '../types';
import { MINER_LEVELS } from '../constants';

export const PlayerService = {
  async getPlayer(fid: number, username: string, pfpUrl?: string, referrerFid?: number): Promise<Player | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('fid', fid)
        .maybeSingle();

      if (!data) {
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
          referrer_fid: (referrerFid && referrerFid !== fid) ? referrerFid : null,
          has_used_altitude_flex: false,
          has_used_xp_flex: false,
          banked_passive_xp: 0,
          last_claim_at: new Date().toISOString(),
          upgrades: { rapid_lift: 0, magnet: 0, battery: 0, luck: 0, stabilizer: 0 }
        };

        const { data: created, error: createError } = await supabase
          .from('users')
          .insert([newPlayer])
          .select()
          .maybeSingle();

        if (createError) throw createError;

        if (newPlayer.referrer_fid) {
          await this.incrementReferralCount(newPlayer.referrer_fid);
        }

        return created ? this.mapToPlayer(created) : null;
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
    if (error) console.error("Upgrade Miner Error:", error);
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
    const orderBy = sortBy === 'skill' ? 'high_score' : 'total_xp';
    let query = supabase
      .from('leaderboard')
      .select('fid, username, pfp_url, miner_level, high_score, total_xp')
      .order(orderBy, { ascending: false })
      .limit(limit);

    const { data, error } = await query;

    if (error) return [];
    return data.map((d, index) => ({
      fid: d.fid,
      username: d.username,
      pfpUrl: d.pfp_url,
      highScore: d.high_score,
      totalXp: d.total_xp,
      minerLevel: d.miner_level,
      rank: index + 1,
    }));
  },

  async getPlayerRank(fid: number, type: 'skill' | 'grind'): Promise<number> {
    const isSkill = type === 'skill';
    const orderField = isSkill ? 'high_score' : 'total_xp';
    
    const { data: p } = await supabase
      .from('leaderboard')
      .select(`fid, ${orderField}`)
      .eq('fid', fid)
      .maybeSingle();

    if (!p) return 0;

    const score = p[orderField];

    // Count players with strictly higher score
    const { count } = await supabase
      .from('leaderboard')
      .select('*', { count: 'exact', head: true })
      .gt(orderField, score);

    return (count || 0) + 1;
  },

  async completeTask(fid: number, taskId: string, xpReward: number) {
    const { error } = await supabase.rpc('rpc_complete_task', {
      p_fid: fid,
      p_task_id: taskId,
      p_xp_reward: xpReward
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

  async getGlobalRevenue(): Promise<number> {
    const { data, error } = await supabase
      .from('platform_stats')
      .select('total_usdc')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return 0;
    return Number(data.total_usdc);
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
      upgrades: typeof db.upgrades === 'string' ? JSON.parse(db.upgrades) : (db.upgrades || { rapid_lift: 0, magnet: 0, battery: 0, luck: 0, stabilizer: 0 })
    };
  }
};
