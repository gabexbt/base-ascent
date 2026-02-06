import { supabase } from '../lib/supabase';
import { Player, LeaderboardEntry } from '../types';
import { MINER_LEVELS } from '../constants';

export const PlayerService = {
  async getPlayer(fid: number, username: string, pfp?: string, referrerFid?: number): Promise<Player | null> {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('fid', fid)
        .single();

      if (error && error.code === 'PGRST116') {
        const newPlayer = {
          fid,
          username,
          pfp,
          total_xp: 0,
          total_gold: 0,
          high_score: 0,
          total_runs: 0,
          referrals_count: 0,
          referral_xp: 0,
          miner_level: 0,
          last_claim_at: new Date().toISOString(),
          referrer_fid: (referrerFid && referrerFid !== fid) ? referrerFid : null,
          completed_tasks: []
        };
        
        const { data: created, error: createError } = await supabase
          .from('players')
          .insert([newPlayer])
          .select()
          .single();

        if (createError) throw createError;

        if (newPlayer.referrer_fid) {
          await supabase.rpc('increment_referral_count', { ref_fid: newPlayer.referrer_fid });
        }

        return this.mapToPlayer(created);
      }

      if (error) throw error;
      return this.mapToPlayer(data);
    } catch (e) {
      console.error("PlayerService.getPlayer Error:", e);
      return null;
    }
  },

  async updatePlayerStats(fid: number, xp: number, gold: number, height: number) {
    const { data: p } = await supabase.from('players').select('*').eq('fid', fid).single();
    if (!p) return;
    
    const newHighScore = height > p.high_score ? height : p.high_score;
    
    if (p.referrer_fid) {
      const kickback = Math.floor(xp * 0.1);
      await supabase.rpc('add_referral_xp', { ref_fid: p.referrer_fid, xp_amount: kickback });
    }

    await supabase
      .from('players')
      .update({
        total_xp: p.total_xp + xp,
        total_gold: p.total_gold + gold,
        total_runs: p.total_runs + 1,
        high_score: newHighScore
      })
      .eq('fid', fid);
  },

  async claimPassiveXp(fid: number): Promise<number> {
    const { data: p } = await supabase.from('players').select('*').eq('fid', fid).single();
    if (!p || p.miner_level === 0) return 0;

    const lastClaim = new Date(p.last_claim_at).getTime();
    const hours = (Date.now() - lastClaim) / 3600000;
    const earned = Math.floor(hours * MINER_LEVELS[p.miner_level].xpPerHour);

    if (earned > 0) {
      await supabase
        .from('players')
        .update({
          total_xp: p.total_xp + earned,
          last_claim_at: new Date().toISOString()
        })
        .eq('fid', fid);
    }
    return earned;
  },

  async upgradeMiner(fid: number) {
    await supabase.rpc('increment_miner_level', { p_fid: fid });
  },

  async completeTask(fid: number, taskId: string, xpReward: number) {
    const { data: p } = await supabase.from('players').select('*').eq('fid', fid).single();
    if (p && !p.completed_tasks?.includes(taskId)) {
      await supabase
        .from('players')
        .update({
          completed_tasks: [...(p.completed_tasks || []), taskId],
          total_xp: p.total_xp + xpReward
        })
        .eq('fid', fid);
    }
  },

  async setHasUploaded(fid: number, type: 'skill' | 'grind') {
    const update: any = { has_uploaded_score: true };
    if (type === 'skill') update.has_free_altitude_flex = true;
    else update.has_free_xp_flex = true;
    await supabase.from('players').update(update).eq('fid', fid);
  },

  async getLeaderboard(type: 'skill' | 'grind'): Promise<LeaderboardEntry[]> {
    const column = type === 'skill' ? 'high_score' : 'total_xp';
    const { data, error } = await supabase
      .from('players')
      .select('fid, username, pfp, miner_level, ' + column)
      .order(column, { ascending: false })
      .limit(15);
    
    if (error) return [];
    return data.map(d => ({
      fid: d.fid,
      username: d.username,
      value: d[column],
      pfp: d.pfp,
      minerLevel: d.miner_level
    }));
  },

  async getPlayerRank(fid: number, type: 'skill' | 'grind'): Promise<number> {
    const column = type === 'skill' ? 'high_score' : 'total_xp';
    const { data } = await supabase.rpc('get_player_rank', { p_fid: fid, rank_column: column });
    return data || 0;
  },

  mapToPlayer(db: any): Player {
    return {
      fid: db.fid,
      username: db.username,
      pfp: db.pfp,
      totalXp: db.total_xp,
      totalGold: db.total_gold,
      highScore: db.high_score,
      totalRuns: db.total_runs,
      referralsCount: db.referrals_count,
      referralXp: db.referral_xp,
      minerLevel: db.miner_level,
      lastClaimAt: new Date(db.last_claim_at).getTime(),
      referrerFid: db.referrer_fid,
      hasUploadedScore: db.has_uploaded_score,
      hasFreeFlexAltitudeUsed: db.has_free_altitude_flex,
      hasFreeFlexExperienceUsed: db.has_free_xp_flex,
      completedTasks: db.completed_tasks || []
    };
  }
};