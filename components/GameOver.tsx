import React from 'react';

interface GameOverProps {
  score: number;
  xpGained: number;
  goldGained: number;
  onPlayAgain: () => void;
  onGoHome: () => void;
}

const GameOver: React.FC<GameOverProps> = ({ score, xpGained, goldGained, onPlayAgain, onGoHome }) => {
  return (
    <div className="flex-1 flex flex-col justify-center gap-8 text-center animate-in zoom-in px-6">
      <div className="space-y-3">
        <div className="text-[10px] opacity-40 uppercase font-black tracking-[0.4em]">ASCENT COMPLETE</div>
        <div className="text-6xl font-black italic text-white tracking-tighter uppercase drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
          SYNCED
        </div>
      </div>

      <div className="w-full max-w-[320px] mx-auto space-y-3">
        <div className="p-6 bg-white/5 border border-white/10 rounded-[32px] space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-[10px] opacity-40 uppercase font-black tracking-widest">Altitude Reached</span>
            <span className="text-3xl font-black italic">{score}m</span>
          </div>
          <div className="h-[1px] bg-white/10"></div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] opacity-40 uppercase font-black tracking-widest">XP Gained</span>
            <span className="text-3xl font-black italic text-green-400">+{xpGained}</span>
          </div>
          <div className="h-[1px] bg-white/10"></div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] opacity-40 uppercase font-black tracking-widest">Gold Earned</span>
            <span className="text-3xl font-black italic text-yellow-400">+{goldGained}</span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[320px] mx-auto space-y-3">
        <button
          onClick={onPlayAgain}
          className="w-full bg-white text-black py-5 font-black text-xl uppercase rounded-[2.5rem] active:scale-95 transition-all border-[3px] border-white"
        >
          Play Again
        </button>
        <button
          onClick={onGoHome}
          className="w-full border-2 border-white text-white py-5 font-black text-xl uppercase rounded-[2.5rem] active:scale-95 transition-all"
        >
          Back to Hub
        </button>
      </div>

      <div className="text-[8px] opacity-20 uppercase font-black tracking-[0.3em] mt-4">
        SESSION_COMPLETE
      </div>
    </div>
  );
};

export default GameOver;
