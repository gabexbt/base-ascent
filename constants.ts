import { IS_TESTNET } from './network';

export const BLACK = '#000000';
export const WHITE = '#FFFFFF';
export const GOLD_NEON = '#FFD700';

export const LOGO_URL = 'https://dmsu9i0cpetrkesy.public.blob.vercel-storage.com/logo.png'; 

export const GAME_WIDTH = 440;
export const GAME_HEIGHT = 660;
export const BLOCK_HEIGHT = 48;
export const INITIAL_BLOCK_WIDTH = 240;

export const START_FEE_ETH = '0.0001';
export const SUBMIT_FEE_ETH = '0.00005';
export const UPLOAD_FEE_USD = 1.0; 
export const FLEX_FEE_USDC = '0.10';

export const DEV_WALLET = '0x53481a207B5dd683a7C018157709A5092774b09A'; 
export const USDC_BASE_ADDRESS = IS_TESTNET 
  ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export const XP_PER_BLOCK = 35;
export const GOLD_PER_BLOCK = 20;

export const MINER_LEVELS: Record<number, { cost: number; multiplier: number; xpPerHour: number }> = {
  0: { cost: 0, multiplier: 1.0, xpPerHour: 0 },
  1: { cost: 0.99, multiplier: 1.1, xpPerHour: 1200 },
  2: { cost: 1.25, multiplier: 1.25, xpPerHour: 3000 },
  3: { cost: 1.49, multiplier: 1.5, xpPerHour: 6000 },
  4: { cost: 1.75, multiplier: 1.75, xpPerHour: 9000 },
  5: { cost: 1.99, multiplier: 2.0, xpPerHour: 12000 },
};

export interface UpgradeTier {
  range: [number, number];
  value: number;
}

export interface UpgradeConfig {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  costMultiplier: number;
  type: 'economy' | 'gameplay';
  maxCap?: number;
  tiers: UpgradeTier[];
  formatValue: (val: number) => string;
}

export const UPGRADES: UpgradeConfig[] = [
  { 
    id: 'midas_touch', 
    name: 'Midas Touch', 
    description: 'Increases Gold earned per perfect stack.', 
    baseCost: 150, 
    costMultiplier: 1.6, 
    type: 'economy', 
    tiers: [ 
      { range: [1, 5], value: 3.0 },  
      { range: [6, 15], value: 1.0 }, 
      { range: [16, 20], value: 0.5 } 
    ], 
    formatValue: (val: number) => `+${val.toFixed(1)}% Gold Yield` 
  }, 
  { 
    id: 'overclock', 
    name: 'Overclock', 
    description: 'Boosts total XP earned per game session.', 
    baseCost: 200, 
    costMultiplier: 1.5, 
    type: 'economy', 
    tiers: [ 
      { range: [1, 5], value: 5.0 },  
      { range: [6, 15], value: 2.0 }, 
      { range: [16, 20], value: 1.0 } 
    ], 
    formatValue: (val: number) => `+${val.toFixed(1)}% Total XP` 
  }, 
  { 
    id: 'gridlock', 
    name: 'Gridlock', 
    description: '% chance to auto-correct a slightly missed block.', 
    baseCost: 500, 
    costMultiplier: 2.5, 
    type: 'gameplay', 
    maxCap: 12.0, 
    tiers: [ 
      { range: [1, 5], value: 1.5 },  
      { range: [6, 15], value: 0.4 }, 
      { range: [16, 20], value: 0.1 } 
    ], 
    formatValue: (val: number) => `${val.toFixed(1)}% Chance` 
  }, 
  { 
    id: 'stabilizer', 
    name: 'Stabilizer', 
    description: 'Permanently slows down block speed.', 
    baseCost: 300, 
    costMultiplier: 2.0, 
    type: 'gameplay', 
    maxCap: 15.0, 
    tiers: [ 
      { range: [1, 5], value: 1.5 },  
      { range: [6, 15], value: 0.5 }, 
      { range: [16, 20], value: 0.2 } 
    ], 
    formatValue: (val: number) => `-${val.toFixed(1)}% Speed` 
  }, 
  { 
    id: 'lucky_strike', 
    name: 'Lucky Strike', 
    description: '% chance for a block to give 2x Gold & XP.', 
    baseCost: 250, 
    costMultiplier: 1.8, 
    type: 'economy', 
    maxCap: 10.0, 
    tiers: [ 
      { range: [1, 5], value: 1.0 },  
      { range: [6, 10], value: 0.5 }, 
      { range: [11, 20], value: 0.2 } 
    ], 
    formatValue: (val: number) => `${val.toFixed(1)}% Chance` 
  } 
];

// Compatibility mapping removed
 

export const getUpgradeValue = (id: string, level: number): number => {
  const upgrade = UPGRADES.find(u => u.id === id);
  if (!upgrade || level <= 0) return 0;

  let totalValue = 0;
  for (let l = 1; l <= level; l++) {
    const tier = upgrade.tiers.find(t => l >= t.range[0] && l <= t.range[1]);
    if (tier) {
      totalValue += tier.value;
    }
  }

  if (upgrade.maxCap && totalValue > upgrade.maxCap) {
    return upgrade.maxCap;
  }
  return totalValue;
};

export const getUpgradeCost = (id: string, level: number): number => {
  const upgrade = UPGRADES.find(u => u.id === id);
  if (!upgrade) return 0;
  // Level is current level. Cost is for the NEXT level (level + 1 logic usually, but here 'level' input is current owned level)
  // Base cost is for Level 1 (owned 0). 
  // Formula: base * (multiplier ^ currentLevel)
  const rawCost = Math.floor(upgrade.baseCost * Math.pow(upgrade.costMultiplier, level));
  
  // Clean rounding logic
  if (rawCost < 1000) return Math.round(rawCost / 10) * 10;
  if (rawCost < 10000) return Math.round(rawCost / 100) * 100;
  if (rawCost < 100000) return Math.round(rawCost / 1000) * 1000;
  return Math.round(rawCost / 5000) * 5000;
};

export const LOADING_MESSAGES = [
  'Preparing assets...',
  'Getting ready to ascend...',
  'Syncing with Base...',
  'Optimizing local data...'
];
