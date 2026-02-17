import React from 'react';

interface GameOverProps {
  score: number;
  xpGained: number;
  goldGained: number;
  isHighScore?: boolean;
  onPlayAgain: () => void;
  onGoHome: () => void;
  onDoubleUp?: () => void;
  isProcessing?: boolean;
  doubleUpStatus?: 'idle' | 'loading' | 'success' | 'error';
  ascentsRemaining?: number;
  onRefill?: () => void;
  hasDoubled?: boolean;
  rechargeStatus?: 'idle' | 'loading' | 'success' | 'error';
}

const GameOver: React.FC<GameOverProps> = ({
  score,
  xpGained,
  goldGained,
  isHighScore,
  onPlayAgain,
  onGoHome,
  onDoubleUp,
  isProcessing,
  doubleUpStatus,
  ascentsRemaining = 0,
  onRefill,
  hasDoubled = false,
  rechargeStatus = 'idle',
}) => {
  const canPlay = ascentsRemaining > 0;
  const [refillJustSucceeded, setRefillJustSucceeded] = React.useState(false);
  const prevRechargeRef = React.useRef(rechargeStatus);

  React.useEffect(() => {
    if (prevRechargeRef.current !== 'success' && rechargeStatus === 'success') {
      setRefillJustSucceeded(true);
      setTimeout(() => setRefillJustSucceeded(false), 2000);
    }
    prevRechargeRef.current = rechargeStatus;
  }, [rechargeStatus]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-start py-6 px-6 text-center overflow-y-auto custom-scrollbar">
      <div className="flex flex-col justify-center gap-6 w-full max-w-[320px] mb-6">
        <div className="space-y-2">
          <div className="text-[10px] opacity-40 uppercase font-black tracking-[0.4em]">{isHighScore ? 'NEW HIGH SCORE!' : 'ASCENT COMPLETE'}</div>
          <div className={`text-5xl sm:text-6xl font-black italic tracking-tighter uppercase leading-tight ${
            isHighScore 
              ? 'text-[#FFD700] drop-shadow-[0_0_24px_rgba(255,215,0,0.9)]' 
              : 'text-white drop-shadow-[0_0_22px_rgba(255,255,255,0.9)]'
          }`}>
            {isHighScore ? 'LEGENDARY' : 'GAME OVER'}
          </div>
        </div>

        <div className="w-full space-y-2">
          <div className="p-5 bg-white/5 border border-white/10 rounded-[24px] space-y-3 shadow-lg">
            <div className="flex justify-between items-end">
              <span className="text-[10px] opacity-50 uppercase font-black tracking-widest mb-1 text-left">Altitude</span>
              <span className="text-3xl font-black italic">{score}m</span>
            </div>
            <div className="h-[1px] bg-white/10 w-full"></div>
            <div className="flex justify-between items-end">
              <span className="text-[10px] opacity-50 uppercase font-black tracking-widest mb-1 text-left">XP Gained</span>
              <span className="text-3xl font-black italic text-green-400">+{xpGained.toLocaleString()}</span>
            </div>
            <div className="h-[1px] bg-white/10 w-full"></div>
            <div className="flex justify-between items-end">
              <span className="text-[10px] opacity-50 uppercase font-black tracking-widest mb-1 text-left">Gold Earned</span>
              <span className="text-3xl font-black italic text-yellow-400">+{goldGained.toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        {isHighScore && onDoubleUp && !hasDoubled && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
            <button
              onClick={onDoubleUp}
              disabled={isProcessing || doubleUpStatus === 'success'}
              className="w-full relative overflow-hidden group bg-gradient-to-r from-yellow-600 to-yellow-400 text-black py-4 font-black text-xl uppercase rounded-[2rem] active:scale-95 transition-all border-[3px] border-yellow-300 shadow-[0_0_30px_rgba(255,215,0,0.4)] hover:shadow-[0_0_50px_rgba(255,215,0,0.6)] disabled:opacity-50 disabled:pointer-events-none"
            >
              <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500"></div>
              <div className="flex flex-col items-center leading-none gap-1">
                <span className="text-2xl tracking-tighter">
                  {doubleUpStatus === 'loading' ? 'PROCESSING...' : doubleUpStatus === 'success' ? 'SUCCESS' : doubleUpStatus === 'error' ? 'FAILED' : 'DOUBLE IT ALL'}
                </span>
                <span className="text-[10px] bg-black/20 px-3 py-1 rounded-full font-bold tracking-widest text-black/80">
                  {doubleUpStatus === 'loading' ? 'CONFIRM IN WALLET' : doubleUpStatus === 'success' ? 'DOUBLED' : doubleUpStatus === 'error' ? 'TRY AGAIN' : '$0.10 USDC'}
                </span>
              </div>
            </button>
            <div className="text-[9px] text-yellow-500/80 font-bold uppercase tracking-widest mt-2">
              Doubles your Altitude Record & Rewards
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-[320px] space-y-4 mb-4 shrink-0">
        {canPlay ? (
          <button
            onClick={onPlayAgain}
            className={
              `w-full py-5 font-black text-xl uppercase rounded-[2rem] active:scale-95 transition-all border-[3px] relative overflow-hidden group ` +
              (rechargeStatus === 'success' || refillJustSucceeded
                ? 'bg-[#FFD700] text-black border-[#FFD700] shadow-[0_0_40px_rgba(255,215,0,0.9)] scale-[1.02]'
                : 'bg-white text-black border-white shadow-[0_0_26px_rgba(255,255,255,0.5)] hover:shadow-[0_0_36px_rgba(255,255,255,0.8)]')
            }
          >
            <div className="absolute inset-0 bg-white/30 translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-600" />
            <span className="relative z-10">
              {rechargeStatus === 'loading' || (isProcessing && rechargeStatus !== 'success' && !refillJustSucceeded)
                ? 'Processing...'
                : rechargeStatus === 'success' || refillJustSucceeded
                  ? 'SUCCESS!'
                  : `Play Again (${ascentsRemaining})`}
            </span>
          </button>
        ) : (
          <button
            onClick={onRefill}
            disabled={isProcessing}
            className="w-full bg-[#FFD700] border-[#FFD700] text-black py-5 font-black text-xl uppercase rounded-[2rem] active:scale-95 transition-all border-[3px] shadow-[0_0_26px_rgba(255,215,0,0.6)] hover:shadow-[0_0_40px_rgba(255,215,0,0.9)] relative overflow-hidden group disabled:opacity-60"
          >
            <div className="absolute inset-0 bg-white/40 translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-600" />
            <span className="relative z-10">
              {isProcessing ? 'Processing...' : 'Refill Ascents ($0.10)'}
            </span>
          </button>
        )}
        <button
          onClick={onGoHome}
          className="w-full border-2 border-white/30 text-white/80 hover:text-white hover:border-white py-5 font-black text-xl uppercase rounded-[2rem] active:scale-95 transition-all bg-black/40 backdrop-blur-sm"
        >
          Back to Hub
        </button>
      </div>
    </div>
  );
};

export default GameOver;
