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
  hasUploadedScore?: boolean;
  hasUsedAltitudeFlex?: boolean;
  hasUsedXpFlex?: boolean;
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