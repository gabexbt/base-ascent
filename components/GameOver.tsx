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
}

const GameOver: React.FC<GameOverProps> = ({ score, xpGained, goldGained, isHighScore, onPlayAgain, onGoHome, onDoubleUp, isProcessing, doubleUpStatus, ascentsRemaining = 0, onRefill, hasDoubled = false }) => {
  const canPlay = ascentsRemaining > 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-between py-8 px-6 text-center h-full overflow-y-auto custom-scrollbar">
      <div className="flex-1 flex flex-col justify-center gap-4 w-full">
        <div className="space-y-1">
          <div className="text-[10px] opacity-40 uppercase font-black tracking-[0.4em]">{isHighScore ? 'NEW HIGH SCORE!' : 'ASCENT COMPLETE'}</div>
          <div className={`text-5xl sm:text-6xl font-black italic tracking-tighter uppercase drop-shadow-[0_0_20px_rgba(255,215,0,0.6)] leading-tight ${isHighScore ? 'text-[#FFD700]' : 'text-white'}`}>
            {isHighScore ? 'LEGENDARY' : 'GAME OVER'}
          </div>
        </div>

        <div className="w-full max-w-[320px] mx-auto space-y-2">
          <div className="p-5 bg-white/5 border border-white/10 rounded-[24px] space-y-3 shadow-lg">
            <div className="flex justify-between items-end">
              <span className="text-[10px] opacity-50 uppercase font-black tracking-widest mb-1 text-left">Altitude</span>
              <span className="text-3xl font-black italic">{score}m</span>
            </div>
            <div className="h-[1px] bg-white/10 w-full"></div>
            <div className="flex justify-between items-end">
              <span className="text-[10px] opacity-50 uppercase font-black tracking-widest mb-1 text-left">XP Gained</span>
              <span className="text-3xl font-black italic text-green-400">+{xpGained}</span>
            </div>
            <div className="h-[1px] bg-white/10 w-full"></div>
            <div className="flex justify-between items-end">
              <span className="text-[10px] opacity-50 uppercase font-black tracking-widest mb-1 text-left">Gold Earned</span>
              <span className="text-3xl font-black italic text-yellow-400">+{goldGained}</span>
            </div>
          </div>
        </div>
        
        {isHighScore && onDoubleUp && !hasDoubled && (
          <div className="w-full max-w-[320px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
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

      <div className="w-full max-w-[320px] mx-auto space-y-3 mt-4 shrink-0">
        {canPlay ? (
          <button
            onClick={onPlayAgain}
            className="w-full bg-white text-black py-4 font-black text-xl uppercase rounded-[2rem] active:scale-95 transition-all border-[3px] border-white shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)]"
          >
            Play Again ({ascentsRemaining})
          </button>
        ) : (
          <button
            onClick={onRefill}
            className="w-full bg-[#FFD700] text-black py-4 font-black text-xl uppercase rounded-[2rem] active:scale-95 transition-all border-[3px] border-[#FFD700] shadow-[0_0_20px_rgba(255,215,0,0.3)] hover:shadow-[0_0_30px_rgba(255,215,0,0.5)] animate-pulse"
          >
            Refill Ascents ($0.10)
          </button>
        )}
        <button
          onClick={onGoHome}
          className="w-full border-2 border-white/30 text-white/80 hover:text-white hover:border-white py-4 font-black text-xl uppercase rounded-[2rem] active:scale-95 transition-all bg-black/40 backdrop-blur-sm"
        >
          Back to Hub
        </button>
      </div>
    </div>
  );
};

export default GameOver;
