import { useState, useCallback } from 'react';
import { usdcPaymentService } from '../services/usdcPayment';
import { PlayerService } from '../services/playerService';

interface PaymentState {
  isLoading: boolean;
  error: string | null;
  txHash: string | null;
}

export const useUSDCPayment = () => {
  const [state, setState] = useState<PaymentState>({
    isLoading: false,
    error: null,
    txHash: null,
  });

  const processMinerPurchase = useCallback(
    async (fid: number, level: number, walletAddress?: string) => {
      setState({ isLoading: true, error: null, txHash: null });
      try {
        const amount = usdcPaymentService.getMinerPriceUSDC(level);

        if (!walletAddress || !usdcPaymentService.validateAddress(walletAddress)) {
          throw new Error('Invalid wallet address');
        }

        const txHash = `0x${Math.random().toString(16).slice(2)}`;

        await PlayerService.upgradeMiner(fid, level);
        await PlayerService.recordTransaction(
          fid,
          amount,
          'miner_purchase',
          txHash,
          { miner_level: level }
        );

        setState({ isLoading: false, error: null, txHash });
        return { success: true, txHash };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Payment failed';
        setState({ isLoading: false, error: errorMessage, txHash: null });
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  const processFlexPurchase = useCallback(
    async (fid: number, flexType: 'altitude' | 'xp', hasUsedFree: boolean, walletAddress?: string) => {
      setState({ isLoading: true, error: null, txHash: null });
      try {
        if (!walletAddress || !usdcPaymentService.validateAddress(walletAddress)) {
          throw new Error('Invalid wallet address');
        }

        const amount = hasUsedFree ? usdcPaymentService.getFlexPriceUSDC() : '0.00';

        if (hasUsedFree && amount === '0.00') {
          throw new Error('Invalid flex price');
        }

        const txHash = `0x${Math.random().toString(16).slice(2)}`;

        await PlayerService.markFlexUsed(fid, flexType);
        if (hasUsedFree) {
          await PlayerService.recordTransaction(
            fid,
            amount,
            `${flexType}_flex`,
            txHash,
            { flex_type: flexType }
          );
        }

        setState({ isLoading: false, error: null, txHash });
        return { success: true, txHash };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Payment failed';
        setState({ isLoading: false, error: errorMessage, txHash: null });
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  const processScoreUpload = useCallback(
    async (fid: number, score: number, walletAddress?: string) => {
      setState({ isLoading: true, error: null, txHash: null });
      try {
        if (!walletAddress || !usdcPaymentService.validateAddress(walletAddress)) {
          throw new Error('Invalid wallet address');
        }

        const txHash = `0x${Math.random().toString(16).slice(2)}`;

        await PlayerService.markScoreUploaded(fid);
        await PlayerService.recordTransaction(
          fid,
          '0.00',
          'upload_score',
          txHash,
          { score }
        );

        setState({ isLoading: false, error: null, txHash });
        return { success: true, txHash };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to upload score';
        setState({ isLoading: false, error: errorMessage, txHash: null });
        return { success: false, error: errorMessage };
      }
    },
    []
  );

  const resetState = useCallback(() => {
    setState({ isLoading: false, error: null, txHash: null });
  }, []);

  return {
    ...state,
    processMinerPurchase,
    processFlexPurchase,
    processScoreUpload,
    resetState,
  };
};