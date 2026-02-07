import React, { useState, useEffect, useMemo } from 'react';
import { LOADING_MESSAGES, LOGO_URL } from '../constants';

const LOAD_ICON_URL = LOGO_URL;

const ParticleBackground = () => {
  const particles = useMemo(() => {
    return Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      duration: 3 + Math.random() * 4,
      delay: Math.random() * 5,
      opacity: 0.05 + Math.random() * 0.15,
    }));
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
          style={{
            left: p.left,
            top: p.top,
            opacity: p.opacity,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
};

const LoadingScreen: React.FC = () => {
  const [msgIndex, setMsgIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 1700);

    const progInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        return prev + 1;
      });
    }, 20);

    return () => {
      clearInterval(msgInterval);
      clearInterval(progInterval);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50 px-12 text-center select-none overflow-hidden font-mono">
      <ParticleBackground />
      
      <div className="absolute w-[400px] h-[400px] bg-white/5 rounded-full blur-[100px] animate-pulse pointer-events-none" />

      <div className="relative z-10 w-[280px] h-[280px] mb-12 flex items-center justify-center scale-110">
        <img 
          src={LOAD_ICON_URL} 
          alt="Base Ascent" 
          className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.25)] relative z-10"
        />
      </div>

      <div className="relative z-10 w-full max-w-[280px]">
        <div className="flex justify-between items-end mb-3">
          <div className="h-4 overflow-hidden text-left">
            <p className="text-white text-[9px] uppercase tracking-[0.4em] font-black italic opacity-60">
              {LOADING_MESSAGES[msgIndex]}
            </p>
          </div>
          <span className="text-[10px] font-black italic opacity-40">{progress}%</span>
        </div>
        
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden relative border border-white/10">
          <div 
            className="h-full bg-white transition-all duration-300 ease-out shadow-[0_0_10px_rgba(255,255,255,1)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;