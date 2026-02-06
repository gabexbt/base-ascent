
import { parseEther, isAddress } from 'viem';
import { useSendTransaction, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { START_FEE_ETH, SUBMIT_FEE_ETH, DEV_WALLET } from '../constants';

export function useCasterContract() {
  const { address } = useAccount();
  const { sendTransaction, data: hash, isPending, error } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const payStartFee = async () => {
    if (!address) {
      console.error("SESSION_ABORT: No wallet connected.");
      throw new Error("Please connect your wallet to initiate session.");
    }
    
    if (!isAddress(DEV_WALLET) || DEV_WALLET === '0x0000000000000000000000000000000000000000') {
      console.warn("DEV_MODE: Valid target wallet not set. Simulating transaction...");
      return new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return sendTransaction({
      to: DEV_WALLET as `0x${string}`,
      value: parseEther(START_FEE_ETH),
    });
  };

  const paySubmitFee = async () => {
    if (!address) throw new Error("Wallet not connected");
    if (!isAddress(DEV_WALLET) || DEV_WALLET === '0x0000000000000000000000000000000000000000') {
      return new Promise((resolve) => setTimeout(resolve, 800));
    }
    return sendTransaction({
      to: DEV_WALLET as `0x${string}`,
      value: parseEther(SUBMIT_FEE_ETH),
    });
  };

  return {
    payStartFee,
    paySubmitFee,
    isPending: isPending || isConfirming,
    isSuccess,
    error,
    hash
  };
}
