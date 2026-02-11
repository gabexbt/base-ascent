import { supabase } from '../lib/supabase';
import { Player, LeaderboardEntry } from '../types';
import { MINER_LEVELS } from '../constants';

export const PlayerService = {
  logs: [] as string[],

  log(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    const logMsg = `[${timestamp}] ${msg}`;
    this.logs.push(logMsg);
    console.log(logMsg);
    // Keep only last 20 logs to prevent memory issues
    if (this.logs.length > 20) this.logs.shift();
  },

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

        if (created) {
           const p = this.mapToPlayer(created);
           if (p.referrerFid) {
             const { data: refUser } = await supabase.from('players').select('username').eq('fid', p.referrerFid).maybeSingle();
             if (refUser) p.referrerUsername = refUser.username;
           }
           return p;
        }
        return null;
      }

      // Check for PFP update
      if (pfpUrl && data.pfp_url !== pfpUrl) {
        // Optimistically update PFP in background
        await supabase.from('players').update({ pfp_url: pfpUrl }).eq('fid', fid);
        data.pfp_url = pfpUrl;
      }

      // Sync Username (Fix for system-generated '!' names)
      if (username && username !== 'unknown' && !username.startsWith('!') && data.username !== username) {
        this.log(`Syncing username for ${fid}: ${data.username} -> ${username}`);
        await supabase.from('players').update({ username: username }).eq('fid', fid);
        data.username = username;
      }

      // Late Referral Attribution (Fix for existing users)
      if (referrer) {
        // We check even if data.referrer_fid exists, to debug or fix potential mismatches (optional, but safer to stick to null check for now to avoid overwrites)
        // However, user specifically said it didn't update.
        
        this.log(`Processing Referral. Player: ${fid}, Current: ${data.referrer_fid}, Incoming: ${referrer}`);

        let finalReferrerFid: number | null = null;
        
        if (typeof referrer === 'number') {
          finalReferrerFid = referrer;
        } else if (!isNaN(Number(referrer))) {
          finalReferrerFid = Number(referrer);
        } else {
          // It's a username string, look it up
          const cleanUsername = String(referrer).trim();
          this.log(`Looking up username: ${cleanUsername}`);
          const { data: refUser } = await supabase
            .from('players')
            .select('fid')
            .eq('username', cleanUsername)
            .maybeSingle();
          if (refUser) {
             finalReferrerFid = refUser.fid;
             this.log(`Resolved username ${cleanUsername} to FID ${finalReferrerFid}`);
          } else {
             this.log(`Could not resolve username ${cleanUsername}`);
          }
        }

        // Only update if we have a valid new referrer and the user currently has NONE
        // We do NOT overwrite existing referrers to prevent abuse/hijacking
        if (finalReferrerFid && finalReferrerFid !== fid && !data.referrer_fid) {
           this.log(`Attributing referral for ${fid} to ${finalReferrerFid}`);
           const { error: updateError } = await supabase
             .from('players')
             .update({ referrer_fid: finalReferrerFid })
             .eq('fid', fid);
             
           if (!updateError) {
             this.log("DB Update Success. Incrementing count.");
             await this.incrementReferralCount(finalReferrerFid);
             data.referrer_fid = finalReferrerFid;
           } else {
             console.error("[Referral Debug] Failed to attribute referral:", updateError);
             this.log(`Failed to attribute: ${updateError.message}`);
           }
        } else {
           if (data.referrer_fid) this.log(`User already has referrer: ${data.referrer_fid}. Ignoring new: ${finalReferrerFid}`);
           if (finalReferrerFid === fid) this.log("Self-referral detected.");
           if (!finalReferrerFid) this.log("Invalid referrer ID.");
        }
      }

      if (error) throw error;
      
      const player = this.mapToPlayer(data);
      if (player.referrerFid) {
         const { data: refUser } = await supabase
           .from('players')
           .select('username')
           .eq('fid', player.referrerFid)
           .maybeSingle();
         if (refUser) player.referrerUsername = refUser.username;
      }
      return player;
    } catch (e) {
      console.error("PlayerService.getPlayer Error:", e);
      return null;
    }
  },

  async checkDeferredReferral(): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('check_deferred_referral');
      if (error) {
        console.error("Check deferred error:", error);
        return null;
      }
      return data as string | null;
    } catch (e) {
      console.error("Check deferred exception:", e);
      return null;
    }
  },

  async redeemReferral(fid: number, referrerCode: string): Promise<{ success: boolean; message: string; referrerUsername?: string }> {
    try {
      // 1. Check if user already has a referrer
      const { data: user, error: userError } = await supabase
        .from('players')
        .select('referrer_fid')
        .eq('fid', fid)
        .maybeSingle();

      if (userError || !user) return { success: false, message: "User not found." };
      if (user.referrer_fid) return { success: false, message: "You already have a referrer." };

      // 2. Resolve Referrer
      let finalReferrerFid: number | null = null;
      let referrerUsername = '';

      const cleanCode = referrerCode.trim();
      
      // Try as FID first if it looks like a number
      if (!isNaN(Number(cleanCode))) {
         finalReferrerFid = Number(cleanCode);
      } 
      
      // Look up by username (or FID if previous check passed, to get username)
      if (!finalReferrerFid) {
         const { data: refUser } = await supabase
           .from('players')
           .select('fid, username')
           .eq('username', cleanCode)
           .maybeSingle();
         
         if (refUser) {
           finalReferrerFid = refUser.fid;
           referrerUsername = refUser.username;
         }
      } else {
         // Verify FID exists and get username
         const { data: refUser } = await supabase
           .from('players')
           .select('username')
           .eq('fid', finalReferrerFid)
           .maybeSingle();
           
         if (refUser) {
            referrerUsername = refUser.username;
         } else {
            finalReferrerFid = null; // Invalid FID
         }
      }

      if (!finalReferrerFid) return { success: false, message: "Referral code not found." };
      if (finalReferrerFid === fid) return { success: false, message: "Cannot refer yourself." };

      // 3. Update DB
      const { error: updateError } = await supabase
        .from('players')
        .update({ referrer_fid: finalReferrerFid })
        .eq('fid', fid);

      if (updateError) throw updateError;

      // 4. Increment Count
      await this.incrementReferralCount(finalReferrerFid);

      return { success: true, message: "Referral redeemed!", referrerUsername };

    } catch (e) {
      console.error("Redeem Error:", e);
      return { success: false, message: "Failed to redeem code." };
    }
  },

  // --- IP Fingerprinting for Deferred Deep Linking ---
  async getIpAddress(): Promise<string | null> {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (e) {
      console.error("IP Fetch Error:", e);
      return null;
    }
  },

  async trackReferralClick(code: string) {
    const ip = await this.getIpAddress();
    if (!ip) return;
    
    // Insert into referral_clicks
    await supabase.from('referral_clicks').insert({
      ip_address: ip,
      referral_code: code
    });
  },

  async checkIpReferral(): Promise<string | null> {
    const ip = await this.getIpAddress();
    if (!ip) return null;

    // Check for clicks in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data } = await supabase
      .from('referral_clicks')
      .select('referral_code')
      .eq('ip_address', ip)
      .gt('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.referral_code || null;
  },
  // --------------------------------------------------

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
    // Tie-breaker: Last synced time (DESC) -> MOST RECENT sync gets better rank
    const orderBy = sortBy === 'skill' ? 'leaderboard_high_score' : 'leaderboard_total_xp';
    let query = supabase
      .from('players')
      .select('fid, username, pfp_url, miner_level, leaderboard_high_score, leaderboard_total_xp')
      .order(orderBy, { ascending: false })
      .order('last_synced_at', { ascending: false }) // Most recent sync wins tie
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
      .select(`leaderboard_high_score, leaderboard_total_xp, last_synced_at, ${flexField}`)
      .eq('fid', fid)
      .maybeSingle();

    if (!p || !p[flexField]) return 0;

    const score = isSkill ? p.leaderboard_high_score : p.leaderboard_total_xp;
    const orderField = isSkill ? 'leaderboard_high_score' : 'leaderboard_total_xp';
    const mySyncTime = p.last_synced_at;

    // Count players with strictly higher score
    const { count: strictlyBetterCount } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq(flexField, true)
      .gt(orderField, score);

    // Count players with SAME score but MORE RECENT sync time
    let tiedBetterCount = 0;
    if (mySyncTime) {
       const { count } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq(flexField, true)
        .eq(orderField, score)
        .gt('last_synced_at', mySyncTime); // Changed from lt to gt
       
       tiedBetterCount = count || 0;
    }

    return (strictlyBetterCount || 0) + (tiedBetterCount || 0) + 1;
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
