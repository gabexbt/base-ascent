
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  BLOCK_HEIGHT, 
  INITIAL_BLOCK_WIDTH, 
  WHITE, 
  BLACK,
  GOLD_NEON,
  XP_PER_BLOCK,
  GOLD_PER_BLOCK
} from '../constants';
import { Block } from '../types';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  text?: string;
  life: number;
  scale: number;
  type: 'text' | 'square' | 'line' | 'flash';
}

interface GameEngineProps {
  onGameOver: (score: number, xp: number, gold: number) => void;
  isActive: boolean;
  multiplier: number;
}

const GameEngine: React.FC<GameEngineProps> = ({ onGameOver, isActive, multiplier }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // High performance refs for physics
  const blocksRef = useRef<Block[]>([]);
  const currentBlockRef = useRef<Block | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const shakeRef = useRef(0);
  const cameraYRef = useRef(0);
  const scoreRef = useRef(0);
  const particleIdRef = useRef(0);
  const requestRef = useRef<number>(0);

  // State only for UI triggers
  const [displayScore, setDisplayScore] = useState(0);

  const playSound = useCallback((type: 'hit' | 'perfect' | 'fail') => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (type === 'hit') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
        gain.gain.setValueAtTime(0.007, now);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
      } else if (type === 'perfect') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.linearRampToValueAtTime(1046.50, now + 0.15);
        gain.gain.setValueAtTime(0.02, now);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
      } else if (type === 'fail') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(30, now + 0.5);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.0005, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
      }
    } catch (e) {}
  }, []);

  const spawnBlock = useCallback((width: number, y: number, currentScore: number) => {
    let baseSpeed = 1.0;
    
    if (currentScore < 10) {
      // Very slow start
      baseSpeed = 0.5 + (currentScore * 0.1); // 0.5 -> 1.5
    } else if (currentScore < 20) {
      // Ramp up
      baseSpeed = 1.5 + ((currentScore - 10) * 0.2); // 1.5 -> 3.5
    } else if (currentScore < 40) {
      // Steady / Slight increase
      baseSpeed = 3.5 + ((currentScore - 20) * 0.05); // 3.5 -> 4.5
    } else if (currentScore < 50) {
      // Ramp up again
      baseSpeed = 4.5 + ((currentScore - 40) * 0.15); // 4.5 -> 6.0
    } else {
      // Max speed with swings
      const swing = Math.sin(currentScore * 0.5) * 0.5;
      baseSpeed = 6.0 + (Math.log10(currentScore - 40) * 1.0) + swing;
    }
    
    const finalSpeed = Math.min(baseSpeed, 8.5);

    currentBlockRef.current = {
      x: Math.random() > 0.5 ? 0 : GAME_WIDTH - width,
      y,
      width,
      color: WHITE,
      speed: finalSpeed,
      direction: Math.random() > 0.5 ? 1 : -1,
      isPerfectHit: false
    };
  }, []);

  const initGame = useCallback(() => {
    const baseBlock: Block = {
      x: (GAME_WIDTH - INITIAL_BLOCK_WIDTH) / 2,
      y: GAME_HEIGHT - BLOCK_HEIGHT,
      width: INITIAL_BLOCK_WIDTH,
      color: WHITE,
      speed: 0,
      direction: 1,
      isPerfectHit: false
    };
    blocksRef.current = [baseBlock];
    scoreRef.current = 0;
    setDisplayScore(0);
    cameraYRef.current = 0;
    spawnBlock(INITIAL_BLOCK_WIDTH, GAME_HEIGHT - BLOCK_HEIGHT * 2, 0);
  }, [spawnBlock]);

  const handleAction = useCallback(() => {
    if (!isActive || !currentBlockRef.current) return;

    const currentBlock = currentBlockRef.current;
    const blocks = blocksRef.current;
    const lastBlock = blocks[blocks.length - 1];
    
    const overlapStart = Math.max(lastBlock.x, currentBlock.x);
    const overlapEnd = Math.min(lastBlock.x + lastBlock.width, currentBlock.x + currentBlock.width);
    const overlapWidth = overlapEnd - overlapStart;

    const isPerfect = Math.abs(currentBlock.x - lastBlock.x) < 10;
    
    if (overlapWidth <= 0) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      playSound('fail');
      onGameOver(scoreRef.current, Math.floor(scoreRef.current * XP_PER_BLOCK * multiplier), Math.floor(scoreRef.current * GOLD_PER_BLOCK * multiplier));
      return;
    }

    const finalWidth = isPerfect ? lastBlock.width : overlapWidth;
    const finalX = isPerfect ? lastBlock.x : overlapStart;

    if (isPerfect) {
      playSound('perfect');
      shakeRef.current = 35;
      const centerX = finalX + finalWidth / 2;
      particlesRef.current.push(
        { id: particleIdRef.current++, x: centerX, y: currentBlock.y, vx: 0, vy: 0, life: 0.8, scale: 1, type: 'flash' },
        { id: particleIdRef.current++, x: centerX, y: currentBlock.y - 45, vx: 0, vy: -2, text: 'PERFECT', life: 1.8, scale: 2.5, type: 'text' }
      );
      for (let i = 0; i < 15; i++) {
        particlesRef.current.push({
          id: particleIdRef.current++, x: centerX, y: currentBlock.y,
          vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15 - 5,
          life: 1.2, scale: 4 + Math.random() * 6, type: 'square'
        });
      }
    } else {
      playSound('hit');
      shakeRef.current = 6;
    }

    const newBlock: Block = { ...currentBlock, x: finalX, width: finalWidth, isPerfectHit: isPerfect };
    blocksRef.current = [...blocks, newBlock];
    scoreRef.current += 1;
    setDisplayScore(scoreRef.current);

    const targetY = GAME_HEIGHT - (blocksRef.current.length + 1) * BLOCK_HEIGHT;
    if (targetY < GAME_HEIGHT / 2) {
      cameraYRef.current += BLOCK_HEIGHT;
    }
    spawnBlock(finalWidth, targetY, scoreRef.current);
  }, [isActive, onGameOver, multiplier, playSound, spawnBlock]);

  const loop = useCallback(() => {
    if (!isActive) return;

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    // PHYSICS UPDATE
    if (currentBlockRef.current) {
      const b = currentBlockRef.current;
      b.x += b.speed * b.direction;
      if (b.x + b.width > GAME_WIDTH || b.x < 0) {
        b.direction *= -1;
        b.x += (b.speed + (Math.random() * 0.1)) * b.direction;
      }
    }

    particlesRef.current = particlesRef.current.map(p => ({
      ...p, x: p.x + p.vx, y: p.y + p.vy,
      vy: p.type === 'square' ? p.vy + 0.25 : p.vy,
      life: p.life - 0.02,
      scale: p.type === 'text' ? p.scale : p.scale * 0.96
    })).filter(p => p.life > 0);

    if (shakeRef.current > 0) shakeRef.current *= 0.85;

    // DRAWING
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Tech Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for(let i=0; i<GAME_WIDTH/40; i++) { ctx.beginPath(); ctx.moveTo(i*40, 0); ctx.lineTo(i*40, GAME_HEIGHT); ctx.stroke(); }
    for(let i=0; i<GAME_HEIGHT/40; i++) { ctx.beginPath(); ctx.moveTo(0, i*40); ctx.lineTo(GAME_WIDTH, i*40); ctx.stroke(); }

    ctx.save();
    const sx = (Math.random() - 0.5) * shakeRef.current;
    const sy = (Math.random() - 0.5) * shakeRef.current;
    ctx.translate(sx, cameraYRef.current + sy);

    blocksRef.current.forEach((b, i) => {
      const gradient = ctx.createLinearGradient(b.x, b.y, b.x, b.y + BLOCK_HEIGHT);
      if (b.isPerfectHit) {
        ctx.shadowBlur = 20; ctx.shadowColor = GOLD_NEON;
        gradient.addColorStop(0, '#FFFFFF'); gradient.addColorStop(0.4, GOLD_NEON); gradient.addColorStop(1, '#B8860B');
      } else {
        ctx.shadowBlur = 0;
        gradient.addColorStop(0, WHITE);
        gradient.addColorStop(1, '#CCCCCC');
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(b.x, b.y, b.width, BLOCK_HEIGHT - 6);
      ctx.strokeStyle = b.isPerfectHit ? GOLD_NEON : WHITE;
      ctx.lineWidth = b.isPerfectHit ? 2 : 1;
      ctx.strokeRect(b.x, b.y, b.width, BLOCK_HEIGHT - 6);
    });

    if (currentBlockRef.current) {
      const b = currentBlockRef.current;
      ctx.fillStyle = WHITE;
      ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(255,255,255,0.5)';
      ctx.fillRect(b.x, b.y, b.width, BLOCK_HEIGHT - 6);
      ctx.shadowBlur = 0;
    }

    particlesRef.current.forEach(p => {
      if (p.type === 'flash') {
        ctx.fillStyle = `rgba(255,215,0,${p.life * 0.8})`;
        ctx.fillRect(0, p.y - 1, GAME_WIDTH, 3);
      } else if (p.type === 'text') {
        ctx.fillStyle = `rgba(255,215,0,${p.life})`; // Gold text
        ctx.shadowColor = 'rgba(255,215,0,0.5)';
        ctx.shadowBlur = 10;
        ctx.font = `italic 900 ${14 * p.scale}px 'JetBrains Mono'`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text!, p.x, p.y);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = GOLD_NEON; ctx.globalAlpha = p.life;
        ctx.fillRect(p.x, p.y, p.scale, p.scale); ctx.globalAlpha = 1;
      }
    });

    ctx.restore();

    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for(let i=0; i<GAME_HEIGHT; i+=4) { ctx.fillRect(0, i, GAME_WIDTH, 1); }

    // UI
    ctx.fillStyle = WHITE;
    ctx.font = "800 60px 'JetBrains Mono'";
    ctx.textAlign = 'center';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.fillText(`${scoreRef.current}`, GAME_WIDTH / 2, 100);
    ctx.shadowBlur = 0;
    
    // Subtext for altitude
    ctx.font = "900 12px 'JetBrains Mono'";
    ctx.globalAlpha = 0.6;
    ctx.fillText('METERS', GAME_WIDTH / 2, 120);
    ctx.globalAlpha = 1.0;

    requestRef.current = requestAnimationFrame(loop);
  }, [isActive]);

  useEffect(() => {
    if (isActive) {
      initGame();
      requestRef.current = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(requestRef.current!);
  }, [isActive, initGame, loop]);

  return (
    <div className="flex-1 flex flex-col justify-center px-4 py-2 touch-none">
      <div 
        className="relative flex flex-col items-center p-6 border-2 border-white/10 bg-white/5 rounded-[40px] shadow-2xl overflow-hidden cursor-pointer select-none active:scale-[0.99] transition-transform touch-none" 
        onPointerDown={handleAction}
      >
        <div className="relative border-4 border-white/10 rounded-[32px] overflow-hidden bg-black shadow-inner">
          <canvas 
            ref={canvasRef} 
            width={GAME_WIDTH} 
            height={GAME_HEIGHT}
            className="w-full max-w-[270px] h-auto mx-auto"
          />
        </div>
      </div>
    </div>
  );
};

export default GameEngine;
