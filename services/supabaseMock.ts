import { Player, LeaderboardEntry } from '../types';
import { MINER_LEVELS } from '../constants';

let mockPlayers: Player[] = [
  { 
    fid: 12345, 
    username: 'operator.eth', 
    totalXp: 12450, 
    totalGold: 2100, 
    highScore: 45, 
    totalRuns: 32,
    referralsCount: 4, 
    referralXp: 1250,
    minerLevel: 0, 
    lastClaimAt: Date.now(),
    hasUploadedScore: false,
    hasFreeFlexAltitudeUsed: false,
    hasFreeFlexExperienceUsed: false,
    completedTasks: []
  }
];

export const calculatePassiveXP = (player: Player): number => {
  if (player.minerLevel === 0) return 0;
  const now = Date.now();
  const hoursElapsed = (now - player.lastClaimAt) / 3600000;
  const config = MINER_LEVELS[player.minerLevel];
  return Math.floor(hoursElapsed * config.xpPerHour);
};

export const claimPassiveXp = async (fid: number): Promise<Player | null> => {
  const player = await getPlayer(fid);
  if (!player || player.minerLevel === 0) return player || null;

  const passive = calculatePassiveXP(player);
  if (passive > 0) {
    player.totalXp += passive;
    player.lastClaimAt = Date.now();
  }
  return player;
};

export const getPlayer = async (fid: number): Promise<Player | null> => {
  let p = mockPlayers.find(p => p.fid === fid);
  if (!p) {
    p = {
      fid,
      username: `operator_${fid}`,
      totalXp: 0,
      totalGold: 0,
      highScore: 0,
      totalRuns: 0,
      referralsCount: 0,
      referralXp: 0,
      minerLevel: 0,
      lastClaimAt: Date.now(),
      hasUploadedScore: false,
      hasFreeFlexAltitudeUsed: false,
      hasFreeFlexExperienceUsed: false,
      completedTasks: []
    };
    mockPlayers.push(p);
  }
  return p;
};

export const completeTask = async (fid: number, taskId: string, xpReward: number) => {
  const player = await getPlayer(fid);
  if (player) {
    if (!player.completedTasks) player.completedTasks = [];
    if (!player.completedTasks.includes(taskId)) {
      player.completedTasks.push(taskId);
      player.totalXp += xpReward;
    }
  }
};

export const getPlayerRank = async (fid: number, type: 'grind' | 'skill'): Promise<number> => {
  const sorted = [...mockPlayers].sort((a, b) => {
    if (type === 'grind') return b.totalXp - a.totalXp;
    return b.highScore - a.highScore;
  });
  return sorted.findIndex(p => p.fid === fid) + 1;
};

export const updatePlayerStats = async (fid: number, xp: number, gold: number, height: number) => {
  const player = await getPlayer(fid);
  if (!player) return;

  const config = MINER_LEVELS[player.minerLevel || 0];
  const multipliedHeight = height * config.multiplier;

  player.totalXp += xp;
  player.totalGold += gold;
  player.totalRuns += 1;
  if (multipliedHeight > player.highScore) {
    player.highScore = multipliedHeight;
  }
};

export const setHasUploaded = async (fid: number, type: 'skill' | 'grind') => {
  const player = await getPlayer(fid);
  if (player) {
    player.hasUploadedScore = true;
    if (type === 'skill') {
      player.hasFreeFlexAltitudeUsed = true;
    } else {
      player.hasFreeFlexExperienceUsed = true;
    }
  }
};

export const upgradeMiner = async (fid: number) => {
  const player = await getPlayer(fid);
  if (player && player.minerLevel < 5) {
    player.minerLevel += 1;
    player.lastClaimAt = Date.now();
  }
};

export const getLeaderboard = async (type: 'grind' | 'skill'): Promise<LeaderboardEntry[]> => {
  const sorted = [...mockPlayers].sort((a, b) => {
    if (type === 'grind') return b.totalXp - a.totalXp;
    return b.highScore - a.highScore;
  });

  return sorted.slice(0, 15).map(p => ({
    fid: p.fid,
    username: p.username,
    value: type === 'grind' ? p.totalXp : p.highScore,
    pfp: `https://picsum.photos/seed/${p.fid}/40/40`,
    minerLevel: p.minerLevel
  }));
};