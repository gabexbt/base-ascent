export interface Player {
  fid: number;
  username: string;
  pfp?: string;
  totalXp: number;
  totalGold: number;
  highScore: number;
  totalRuns: number;
  referralsCount: number;
  referralXp: number;
  minerLevel: number;
  lastClaimAt: number;
  referrerFid?: number;
  hasUploadedScore?: boolean;
  hasFreeFlexAltitudeUsed?: boolean;
  hasFreeFlexExperienceUsed?: boolean;
  completedTasks?: string[];
}

export interface LeaderboardEntry {
  fid: number;
  username: string;
  value: number; 
  pfp?: string;
  minerLevel?: number;
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
  MINER = 'MINER',
  RANKINGS = 'RANKINGS',
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