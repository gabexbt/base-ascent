import { supabase } from '../lib/supabase';
import { Player, LeaderboardEntry } from '../types';
import { MINER_LEVELS } from '../constants';

export const PlayerService = {
  async getPlayer(fid: number, username: string, pfpUrl?: string, referrerFid?: number): Promise<Player | null> {
    try {
      const { data, error } = await supabase
        .from('players')
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
          total_runs: 0,
          referral_count: 0,
          referral_xp_earned: 0,
          miner_level: 0,
          referrer_fid: (referrerFid && referrerFid !== fid) ? referrerFid : null,
          has_uploaded_score: false,
          has_used_altitude_flex: false,
          has_used_xp_flex: false,
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

      if (error) throw error;
      return this.mapToPlayer(data);
    } catch (e) {
      console.error("PlayerService.getPlayer Error:", e);
      return null;
    }
  },

  async updatePlayerStats(fid: number, xp: number, gold: number, height: number) {
    const { data: p } = await supabase
      .from('players')
      .select('*')
      .eq('fid', fid)
      .maybeSingle();

    if (!p) return;

    const newHighScore = height > p.high_score ? height : p.high_score;

    if (p.referrer_fid) {
      const kickback = Math.floor(xp * 0.1);
      await this.addReferralXp(p.referrer_fid, kickback);
    }

    await supabase
      .from('players')
      .update({
        total_xp: p.total_xp + xp,
        total_gold: p.total_gold + gold,
        total_runs: p.total_runs + 1,
        high_score: newHighScore,
        updated_at: new Date().toISOString(),
      })
      .eq('fid', fid);
  },

  async upgradeMiner(fid: number, level: number) {
    const { data: p } = await supabase
      .from('players')
      .select('miner_level')
      .eq('fid', fid)
      .maybeSingle();

    if (p && p.miner_level < level) {
      await supabase
        .from('players')
        .update({
          miner_level: level,
          updated_at: new Date().toISOString(),
        })
        .eq('fid', fid);
    }
  },

  async markFlexUsed(fid: number, type: 'altitude' | 'xp') {
    const column = type === 'altitude' ? 'has_used_altitude_flex' : 'has_used_xp_flex';
    await supabase
      .from('players')
      .update({
        [column]: true,
        updated_at: new Date().toISOString(),
      })
      .eq('fid', fid);
  },

  async markScoreUploaded(fid: number) {
    await supabase
      .from('players')
      .update({
        has_uploaded_score: true,
        updated_at: new Date().toISOString(),
      })
      .eq('fid', fid);
  },

  async incrementReferralCount(referrerFid: number) {
    const { data: p } = await supabase
      .from('players')
      .select('referral_count')
      .eq('fid', referrerFid)
      .maybeSingle();

    if (p) {
      await supabase
        .from('players')
        .update({
          referral_count: (p.referral_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('fid', referrerFid);
    }
  },

  async addReferralXp(referrerFid: number, xpAmount: number) {
    const { data: p } = await supabase
      .from('players')
      .select('referral_xp_earned, total_xp')
      .eq('fid', referrerFid)
      .maybeSingle();

    if (p) {
      await supabase
        .from('players')
        .update({
          referral_xp_earned: (p.referral_xp_earned || 0) + xpAmount,
          total_xp: p.total_xp + xpAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('fid', referrerFid);
    }
  },

  async getLeaderboard(limit: number = 15): Promise<LeaderboardEntry[]> {
    const { data, error } = await supabase
      .from('players')
      .select('fid, username, pfp_url, miner_level, high_score, total_xp')
      .order('high_score', { ascending: false })
      .order('total_xp', { ascending: false })
      .limit(limit);

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

  async recordTransaction(fid: number, amountUsdc: string, transactionType: string, transactionHash: string, metadata?: any) {
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('fid', fid)
      .maybeSingle();

    if (player) {
      await supabase
        .from('transactions')
        .insert([
          {
            player_id: player.id,
            fid,
            amount_usdc: amountUsdc,
            transaction_type: transactionType,
            transaction_hash: transactionHash,
            status: 'confirmed',
            metadata: metadata || {},
          },
        ]);
    }
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
      hasUploadedScore: db.has_uploaded_score,
      hasUsedAltitudeFlex: db.has_used_altitude_flex,
      hasUsedXpFlex: db.has_used_xp_flex,
    };
  }
};