import React, { useMemo } from 'react';

export const ParticleBackground: React.FC = () => {
  const particles = useMemo(() => Array.from({ length: 30 }).map((_, i) => ({
    id: i, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
    duration: 4 + Math.random() * 6, delay: Math.random() * 5,
  })), []);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
      {particles.map((p) => (
        <div key={p.id} className="absolute w-[2px] h-[2px] bg-white rounded-full animate-pulse"
          style={{ left: p.left, top: p.top, animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s` }}
        />
      ))}
    </div>
  );
};
