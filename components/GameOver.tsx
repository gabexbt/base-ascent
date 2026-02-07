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
    <div className="flex-1 flex flex-col justify-center gap-4 text-center animate-in zoom-in px-6">
      <div className="space-y-2 mt-2">
        <div className="text-[10px] opacity-40 uppercase font-black tracking-[0.4em]">{isHighScore ? 'NEW HIGH SCORE!' : 'ASCENT COMPLETE'}</div>
        <div className="text-5xl font-black italic text-[#FFD700] tracking-tighter uppercase drop-shadow-[0_0_20px_rgba(255,215,0,0.6)]">
          {isHighScore ? 'LEGENDARY' : 'GAME OVER'}
        </div>
      </div>

      <div className="w-full max-w-[320px] mx-auto space-y-2">
        <div className="p-4 bg-white/5 border border-white/10 rounded-[24px] space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] opacity-40 uppercase font-black tracking-widest">Altitude Reached</span>
            <span className="text-2xl font-black italic">{score}m</span>
          </div>
          <div className="h-[1px] bg-white/10"></div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] opacity-40 uppercase font-black tracking-widest">XP Gained</span>
            <span className="text-2xl font-black italic text-green-400">+{xpGained}</span>
          </div>
          <div className="h-[1px] bg-white/10"></div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] opacity-40 uppercase font-black tracking-widest">Gold Earned</span>
            <span className="text-2xl font-black italic text-yellow-400">+{goldGained}</span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[320px] mx-auto space-y-2">
        <button
          onClick={onPlayAgain}
          className="w-full bg-white text-black py-3 font-black text-xl uppercase rounded-[2rem] active:scale-95 transition-all border-[3px] border-white"
        >
          Play Again
        </button>
        <button
          onClick={onGoHome}
          className="w-full border-2 border-white text-white py-3 font-black text-xl uppercase rounded-[2rem] active:scale-95 transition-all"
        >
          Back to Hub
        </button>
      </div>

      <div className="text-[8px] opacity-20 uppercase font-black tracking-[0.3em] mt-2">
        SESSION_COMPLETE
      </div>
    </div>
  );
};

export default GameOver;
