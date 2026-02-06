export const BLACK = '#000000';
export const WHITE = '#FFFFFF';
export const GOLD_NEON = '#FFD700';

export const LOGO_URL = 'https://dmsu9i0cpetrkesy.public.blob.vercel-storage.com/logo.png'; 

export const GAME_WIDTH = 400;
export const GAME_HEIGHT = 600;
export const BLOCK_HEIGHT = 48;
export const INITIAL_BLOCK_WIDTH = 240;

export const START_FEE_ETH = '0.0001';
export const SUBMIT_FEE_ETH = '0.00005';
export const UPLOAD_FEE_USD = 1.0; 
export const FLEX_FEE_USDC = '0.10';

export const DEV_WALLET = '0x0000000000000000000000000000000000000000'; 
export const USDC_BASE_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

export const XP_PER_BLOCK = 25;
export const GOLD_PER_BLOCK = 20;

export const MINER_LEVELS: Record<number, { cost: number; multiplier: number; xpPerHour: number }> = {
  0: { cost: 0, multiplier: 1.0, xpPerHour: 0 },
  1: { cost: 1.0, multiplier: 1.5, xpPerHour: 100 },
  2: { cost: 2.0, multiplier: 1.8, xpPerHour: 250 },
  3: { cost: 3.5, multiplier: 2.2, xpPerHour: 500 },
  4: { cost: 5.0, multiplier: 2.6, xpPerHour: 1000 },
  5: { cost: 10.0, multiplier: 3.0, xpPerHour: 2500 },
};

export const LOADING_MESSAGES = [
  'Preparing assets...',
  'Getting ready to ascend...',
  'Syncing with Base...',
  'Optimizing local data...'
];