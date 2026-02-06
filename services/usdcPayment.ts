import { parseUnits } from 'viem';

export interface PaymentRequest {
  amountUSDC: string;
  recipientAddress: string;
  description: string;
}

export interface PaymentResponse {
  transactionHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  amountUSDC: string;
}

const USDC_DECIMALS = 6;
const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS;
const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS;

export const usdcPaymentService = {
  getUSDCAddress: () => USDC_ADDRESS,
  getTreasuryAddress: () => TREASURY_ADDRESS,

  parseAmount: (amount: string) => {
    return parseUnits(amount, USDC_DECIMALS);
  },

  formatAmount: (amount: bigint) => {
    return (Number(amount) / 10 ** USDC_DECIMALS).toFixed(2);
  },

  validateAddress: (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address) || address.endsWith('.eth');
  },

  createPaymentRequest: (amountUSDC: string, description: string): PaymentRequest => {
    return {
      amountUSDC,
      recipientAddress: TREASURY_ADDRESS,
      description,
    };
  },

  getMinerPriceUSDC: (level: number): string => {
    const prices: Record<number, string> = {
      1: '1.00',
      2: '2.00',
      3: '3.50',
      4: '5.00',
      5: '10.00',
    };
    return prices[level] || '0.00';
  },

  getFlexPriceUSDC: (): string => '0.10',
};