export const BLACK = '#000000';
export const WHITE = '#FFFFFF';
export const GOLD_NEON = '#FFD700';

export const LOGO_URL = '/logo.png'; 

export const GAME_WIDTH = 440;
export const GAME_HEIGHT = 660;
export const BLOCK_HEIGHT = 48;
export const INITIAL_BLOCK_WIDTH = 240;

export const START_FEE_ETH = '0.0001';
export const SUBMIT_FEE_ETH = '0.00005';
export const UPLOAD_FEE_USD = 1.0; 
export const FLEX_FEE_USDC = '0.10';

import { IS_TESTNET } from './network';

export const DEV_WALLET = '0x53481a207B5dd683a7C018157709A5092774b09A'; 
export const USDC_BASE_ADDRESS = IS_TESTNET 
  ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
  : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base Mainnet USDC

export const XP_PER_BLOCK = 10;
export const GOLD_PER_BLOCK = 20;

export const MINER_LEVELS: Record<number, { cost: number; multiplier: number; xpPerHour: number }> = {
  0: { cost: 0, multiplier: 1.0, xpPerHour: 0 },
  1: { cost: 0.99, multiplier: 1.1, xpPerHour: 1200 },
  2: { cost: 1.25, multiplier: 1.25, xpPerHour: 3000 },
  3: { cost: 1.49, multiplier: 1.5, xpPerHour: 6000 },
  4: { cost: 1.75, multiplier: 1.75, xpPerHour: 9000 },
  5: { cost: 1.99, multiplier: 2.0, xpPerHour: 12000 },
};

export const UPGRADES_CONFIG = {
  rapid_lift: { 
    name: 'Rapid Lift', 
    baseCost: 100, 
    description: '+1.5% Block Height',
    icon: '/assets/upgrades/rapid_lift.png'
  },
  magnet: { 
    name: 'Block Magnet', 
    baseCost: 150, 
    description: '+5% Gold Yield',
    icon: '/assets/upgrades/magnet.png'
  },
  battery: { 
    name: 'XP Battery', 
    baseCost: 200, 
    description: '+5% Total XP',
    icon: '/assets/upgrades/battery.png'
  },
  luck: { 
    name: 'Luck Streak', 
    baseCost: 250, 
    description: 'Forgiveness',
    icon: '/assets/upgrades/luck.png'
  },
  stabilizer: { 
    name: 'Stabilizer', 
    baseCost: 300, 
    description: '-1% Block Speed',
    icon: '/assets/upgrades/stabilizer.png'
  }
};

export const LOADING_MESSAGES = [
  'Preparing assets...',
  'Getting ready to ascend...',
  'Syncing with Base...',
  'Optimizing local data...'
];