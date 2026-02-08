import React from 'react';

interface GameOverProps {
  score: number;
  xpGained: number;
  goldGained: number;
  isHighScore?: boolean;
  onPlayAgain: () => void;
  onGoHome: () => void;
}

const GameOver: React.FC<GameOverProps> = ({ score, xpGained, goldGained, isHighScore, onPlayAgain, onGoHome }) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-between py-8 px-6 text-center animate-in zoom-in h-full overflow-y-auto">
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
          </div>
        </div>
      </div>

      <div className="w-full max-w-[320px] mx-auto space-y-3 mt-4 shrink-0">
        <button
          onClick={onPlayAgain}
          className="w-full bg-white text-black py-4 font-black text-xl uppercase rounded-[2rem] active:scale-95 transition-all border-[3px] border-white shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)]"
        >
          Play Again
        </button>
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
