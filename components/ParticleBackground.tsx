import React from 'react';

type ParticleBackgroundProps = {
  dim?: number;
};

export const ParticleBackground: React.FC<ParticleBackgroundProps> = ({ dim = 0.2 }) => {
  const opacity = Math.min(Math.max(dim, 0), 1);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        className="w-full h-full bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/assets/background.png')" }}
      />
      {opacity > 0 && (
        <div
          className="absolute inset-0 bg-black"
          style={{ opacity }}
        />
      )}
    </div>
  );
};
