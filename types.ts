export interface Upgrades {
  rapid_lift: number;
  magnet: number;
  battery: number;
  luck: number;
  stabilizer: number;
}

export interface Player {
  fid: number;
  username: string;
  pfpUrl?: string;
  totalXp: number;
  totalGold: number;
  highScore: number;
  totalRuns: number;
  referralCount: number;
  referralXpEarned: number;
  minerLevel: number;
  referrerFid?: number;
  referrerUsername?: string;
  hasUploadedScore?: boolean;
  leaderboardHighScore: number;
  leaderboardTotalXp: number;
  hasUsedAltitudeFlex: boolean;
  hasUsedXpFlex: boolean;
  completedTasks?: string[];
  lastClaimAt: number; // timestamp
  bankedPassiveXp: number;
  walletAddress?: string;
  ascentsRemaining: number;
  upgrades: Upgrades;
  resetToken?: string;
}

export enum UpgradeType {
  RAPID_LIFT = 'rapid_lift',
  MAGNET = 'magnet',
  BATTERY = 'battery',
  LUCK = 'luck',
  STABILIZER = 'stabilizer'
}

export interface LeaderboardEntry {
  fid: number;
  username: string;
  pfpUrl?: string;
  highScore: number;
  totalXp: number;
  minerLevel?: number;
  rank: number;
}

export enum GameStatus {
  IDLE = 'IDLE',
  PAYING = 'PAYING',
  PLAYING = 'PLAYING',
  GAMEOVER = 'GAMEOVER',
  SUBMITTING = 'SUBMITTING'
}

export enum Tab {
  ASCENT = 'ASCENT',
  UPGRADES = 'UPGRADES',
  HARDWARE = 'HARDWARE',
  RANKINGS = 'RANKINGS',
  TASKS = 'TASKS',
  PROFILE = 'PROFILE'
}

export interface Block {
  x: number;
  y: number;
  width: number;
  color: string;
  speed: number;
  direction: number;
  isPerfectHit?: boolean;
}

export interface MinerConfig {
  level: number;
  costUsdc: number;
  multiplier: number;
  xpPerHour: number;
}
