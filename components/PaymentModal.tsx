import React, { useState } from 'react';
import { usdcPaymentService } from '../services/usdcPayment';
import { useUSDCPayment } from '../hooks/useUSDCPayment';

interface PaymentModalProps {
  isOpen: boolean;
  type: 'miner' | 'flex' | null;
  level?: number;
  flexType?: 'altitude' | 'xp';
  fid?: number;
  walletAddress?: string;
  onClose: () => void;
  onSuccess: (txHash: string) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  type,
  level,
  flexType,
  fid,
  walletAddress,
  onClose,
  onSuccess,
}) => {
  const [hasUserFree, setHasUserFree] = useState(false);
  const { isLoading, error, txHash, processMinerPurchase, processFlexPurchase, resetState } =
    useUSDCPayment();

  if (!isOpen || !type) return null;

  const handlePayment = async () => {
    if (!fid || !walletAddress) {
      alert('User data not available');
      return;
    }

    let result;

    if (type === 'miner' && level) {
      result = await processMinerPurchase(fid, level, walletAddress);
    } else if (type === 'flex' && flexType) {
      result = await processFlexPurchase(fid, flexType, hasUserFree, walletAddress);
    }

    if (result?.success && result?.txHash) {
      onSuccess(result.txHash);
      handleClose();
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const getAmount = () => {
    if (type === 'miner' && level) {
      return usdcPaymentService.getMinerPriceUSDC(level);
    }
    if (type === 'flex') {
      return hasUserFree ? usdcPaymentService.getFlexPriceUSDC() : '0.00';
    }
    return '0.00';
  };

  const getTitle = () => {
    if (type === 'miner') return `Purchase AutoMiner Level ${level}`;
    if (type === 'flex' && flexType === 'altitude') return 'Flex Altitude';
    if (type === 'flex' && flexType === 'xp') return 'Flex Experience';
    return 'Confirm Payment';
  };

  const amount = getAmount();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">{getTitle()}</h2>

        {amount !== '0.00' && (
          <div className="mb-6 p-4 bg-gray-100 rounded">
            <p className="text-gray-600">Amount:</p>
            <p className="text-3xl font-bold text-blue-600">${amount} USDC</p>
          </div>
        )}

        {amount === '0.00' && !hasUserFree && (
          <div className="mb-6 p-4 bg-green-100 rounded">
            <p className="text-green-700 font-semibold">First use is FREE!</p>
          </div>
        )}

        {type === 'flex' && (
          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={hasUserFree}
                onChange={(e) => setHasUserFree(e.target.checked)}
                className="mr-2"
              />
              <span>I've already used my free flex</span>
            </label>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        {txHash && (
          <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
            <p className="font-semibold">Payment successful!</p>
            <p className="text-sm break-all">{txHash}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handlePayment}
            disabled={isLoading || !!txHash}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Processing...' : txHash ? 'Confirmed' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  );
};