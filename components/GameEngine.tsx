
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
  GOLD_PER_BLOCK,
  getUpgradeValue
} from '../constants';
import { Block, Upgrades } from '../types';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  text?: string;
  life: number;
  scale: number;
  type: 'text' | 'square' | 'line' | 'flash' | 'ring';
}

interface GameEngineProps {
  onGameOver: (score: number, xp: number, gold: number) => void;
  isActive: boolean;
  multiplier: number;
  upgrades: Upgrades;
  xpRef?: React.RefObject<HTMLDivElement>;
  goldRef?: React.RefObject<HTMLDivElement>;
  sfxEnabled: boolean;
}

const GameEngine = React.forwardRef<{ endGame: () => void }, GameEngineProps>(({ onGameOver, isActive, multiplier, upgrades, xpRef, goldRef, sfxEnabled }, ref) => {
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
  const startTimeRef = useRef<number>(0); // Grace period ref
  
  // Bonus tracking for Lucky Strike
  const bonusXpRef = useRef(0);
  const bonusGoldRef = useRef(0);

  // Derived Constants based on Upgrades
  const midasMult = 1 + (getUpgradeValue('midas_touch', upgrades?.midas_touch || 0) / 100);
  const overclockMult = 1 + (getUpgradeValue('overclock', upgrades?.overclock || 0) / 100);
  const gridlockChance = getUpgradeValue('gridlock', upgrades?.gridlock || 0) / 100;
  const stabilizerReduc = getUpgradeValue('stabilizer', upgrades?.stabilizer || 0) / 100;
  const luckyStrikeChance = getUpgradeValue('lucky_strike', upgrades?.lucky_strike || 0) / 100;

  // State only for UI triggers
  const [displayScore, setDisplayScore] = useState(0);
  
  // Expose endGame to parent
  React.useImperativeHandle(ref, () => ({
    endGame: () => {
      if (!isActive) return;
      const finalAltitude = scoreRef.current; // Altitude is just score (blocks)
      
      // XP Formula: Linear Grind (35 XP per block)
      const baseGameXP = scoreRef.current * 35;
      const totalXP = Math.floor((baseGameXP + bonusXpRef.current) * overclockMult * multiplier);
      
      // Gold Formula
      const baseGold = scoreRef.current * 20; // 20 Gold per block base
      const totalGold = Math.floor((baseGold + bonusGoldRef.current) * midasMult * multiplier);

      onGameOver(finalAltitude, totalXP, totalGold);
    }
  }));

  const playSound = useCallback((type: 'hit' | 'perfect' | 'fail' | 'gameover') => {
    if (!sfxEnabled) return;
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
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
        gain.gain.setValueAtTime(1.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now); osc.stop(now + 0.12);
      } else if (type === 'perfect') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.linearRampToValueAtTime(1046.50, now + 0.15);
        gain.gain.setValueAtTime(0.85, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
      } else if (type === 'fail') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(30, now + 0.5);
        gain.gain.setValueAtTime(0.9, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
      } else if (type === 'gameover') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.9);
        gain.gain.setValueAtTime(1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc.start(now); osc.stop(now + 0.9);
      }
    } catch (e) {}
  }, [sfxEnabled]);

  const spawnBlock = useCallback((width: number, y: number, currentScore: number) => {
    // Width Logic (Keep existing)
    const widthStep = Math.floor(currentScore / 10);
    const widthMultiplier = Math.max(0.6, 1 - (widthStep * 0.02));
    const nextWidth = Math.max(10, Math.floor(width * widthMultiplier));
    
    // 1. Base Speed Parameters
    const BASE_SPEED = 3.5; 
    const MAX_SPEED = 24; 

    // 2. Fast Acceleration (Score 0-150)
    let speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * (1 - Math.exp(-0.02 * currentScore));

    // 3. The "Jitter" (Score 80-250)
    if (currentScore > 80) {
      // Variance caps at 20%
      const intensity = Math.min(0.20, (currentScore - 80) * 0.002);
      const jitter = 1 + (Math.random() * intensity - (intensity / 2));
      speed *= jitter;
    }
    
    // Apply Stabilizer upgrade
    const finalSpeed = Math.min(speed, 30.0) * (1.0 - stabilizerReduc);

    currentBlockRef.current = {
      x: Math.random() > 0.5 ? 0 : GAME_WIDTH - nextWidth,
      y,
      width: nextWidth,
      color: WHITE,
      speed: finalSpeed,
      direction: Math.random() > 0.5 ? 1 : -1,
      isPerfectHit: false
    };
  }, [stabilizerReduc]);

  const initGame = useCallback(() => {
    const baseBlock: Block = {
      x: (GAME_WIDTH - INITIAL_BLOCK_WIDTH) / 2,
      y: GAME_HEIGHT - BLOCK_HEIGHT, // Snapped to edge
      width: INITIAL_BLOCK_WIDTH,
      color: WHITE,
      speed: 0,
      direction: 1,
      isPerfectHit: false
    };
    blocksRef.current = [baseBlock];
    scoreRef.current = 0;
    bonusXpRef.current = 0;
    bonusGoldRef.current = 0;
    setDisplayScore(0);
    cameraYRef.current = 0;
    startTimeRef.current = Date.now();
    spawnBlock(INITIAL_BLOCK_WIDTH, GAME_HEIGHT - BLOCK_HEIGHT * 2, 0); 
  }, [spawnBlock]);

  const handleAction = useCallback(() => {
    if (!isActive || !currentBlockRef.current || Date.now() - startTimeRef.current < 500) return;

    const currentBlock = currentBlockRef.current;
    const blocks = blocksRef.current;
    const lastBlock = blocks[blocks.length - 1];
    
    const overlapStart = Math.max(lastBlock.x, currentBlock.x);
    const overlapEnd = Math.min(lastBlock.x + lastBlock.width, currentBlock.x + currentBlock.width);
    const overlapWidth = overlapEnd - overlapStart;

    const diff = Math.abs(currentBlock.x - lastBlock.x);
    const perfectThreshold = scoreRef.current < 40 ? 9 : 3;
    const isSkillPerfect = diff <= perfectThreshold;
    
    // Gridlock (Auto-correct) Logic
    let isGridlockSaved = false;
    if (!isSkillPerfect && overlapWidth > 0) {
        if (Math.random() < gridlockChance) {
            isGridlockSaved = true;
        }
    }
    
    const isPerfect = isSkillPerfect || isGridlockSaved;
    
    if (overlapWidth <= 0) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      playSound('gameover');
      
      const finalAltitude = scoreRef.current; 
      const baseGameXP = scoreRef.current * 35;
      const totalXP = Math.floor((baseGameXP + bonusXpRef.current) * overclockMult * multiplier);
      const baseGold = scoreRef.current * 20;
      const totalGold = Math.floor((baseGold + bonusGoldRef.current) * midasMult * multiplier);

      onGameOver(finalAltitude, totalXP, totalGold);
      return;
    }

    const finalWidth = isPerfect ? lastBlock.width : overlapWidth;
    const finalX = isPerfect ? lastBlock.x : overlapStart;

    // Lucky Strike (Crit) Logic
    let isCrit = false;
    if (Math.random() < luckyStrikeChance) {
        isCrit = true;
        bonusXpRef.current += 35; 
        bonusGoldRef.current += 20; 
    }

    if (isPerfect) {
      playSound('perfect');
      shakeRef.current = 35;
      const centerX = finalX + finalWidth / 2;
      const impactY = currentBlock.y + BLOCK_HEIGHT; 
      
      // Visuals
      particlesRef.current.push(
        { id: particleIdRef.current++, x: centerX, y: impactY, vx: 0, vy: 0, life: 0.8, scale: 1, type: 'flash' }
      );

      if (isSkillPerfect) {
         particlesRef.current.push(
           { id: particleIdRef.current++, x: centerX, y: currentBlock.y - 45, vx: 0, vy: -2, text: 'PERFECT', life: 1.8, scale: 2.5, type: 'text' }
         );
      } else if (isGridlockSaved) {
         particlesRef.current.push(
           { id: particleIdRef.current++, x: centerX, y: impactY, vx: 0, vy: 0, life: 1.0, scale: 10, type: 'ring' },
           { id: particleIdRef.current++, x: centerX, y: currentBlock.y - 45, vx: 0, vy: -2, text: 'GRIDLOCK!', life: 1.8, scale: 2.5, type: 'text' }
         );
      }
      
      // Squares
      for (let i = 0; i < 15; i++) {
        particlesRef.current.push({
          id: particleIdRef.current++, x: centerX, y: impactY,
          vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15 - 5,
          life: 1.2, scale: 4 + Math.random() * 6, type: 'square'
        });
      }
    } else {
      playSound('hit');
      shakeRef.current = 6;
    }

    if (isCrit) {
        const centerX = finalX + finalWidth / 2;
         particlesRef.current.push(
           { id: particleIdRef.current++, x: centerX + 40, y: currentBlock.y - 20, vx: 1, vy: -3, text: 'LUCKY!', life: 1.5, scale: 2.0, type: 'text' }
         );
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
  }, [isActive, onGameOver, multiplier, playSound, spawnBlock, gridlockChance, luckyStrikeChance, midasMult, overclockMult]);

  const loop = useCallback(() => {
    if (!isActive) return;

    const ctx = canvasRef.current?.getContext('2d', { alpha: false }); // Optimize: disable alpha if possible (though we use it)
    if (!ctx) return;

    // PHYSICS UPDATE
    if (currentBlockRef.current) {
      const b = currentBlockRef.current;
      b.x += b.speed * b.direction;
      if (b.x + b.width > GAME_WIDTH || b.x < 0) {
        b.direction *= -1;
        b.x += (b.speed + (Math.random() * 0.1)) * b.direction;
      }

      // 4. The "Sine Wave" (Score 250+)
      if (scoreRef.current > 250) {
        b.x += Math.sin(Date.now() / 150) * 3;
      }
    }

    // Optimization: In-place array update instead of map/filter to reduce GC
    let activeParticles = 0;
    for (let i = 0; i < particlesRef.current.length; i++) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.type === 'square') p.vy += 0.25;
      p.life -= 0.02;
      
      if (p.type === 'text') {
        // keep scale
      } else if (p.type === 'ring') {
        p.scale *= 1.06;
      } else {
        p.scale *= 0.96;
      }

      if (p.life > 0) {
        particlesRef.current[activeParticles++] = p;
      }
    }
    particlesRef.current.length = activeParticles; // Truncate

    if (shakeRef.current > 0) shakeRef.current *= 0.85;
    if (Math.abs(shakeRef.current) < 0.5) shakeRef.current = 0;

    // DRAWING
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Tech Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<=GAME_WIDTH; i+=40) { ctx.moveTo(i, 0); ctx.lineTo(i, GAME_HEIGHT); }
    for(let i=0; i<=GAME_HEIGHT; i+=40) { ctx.moveTo(0, i); ctx.lineTo(GAME_WIDTH, i); }
    ctx.stroke();

    ctx.save();
    if (shakeRef.current > 0) {
      ctx.translate((Math.random() - 0.5) * shakeRef.current, cameraYRef.current + (Math.random() - 0.5) * shakeRef.current);
    } else {
      ctx.translate(0, cameraYRef.current);
    }

    // Optimization: Batch drawing if possible, but gradients require per-block
    blocksRef.current.forEach((b) => {
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
      
      if (b.isPerfectHit) {
        ctx.strokeStyle = GOLD_NEON;
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x, b.y, b.width, BLOCK_HEIGHT - 6);
      }
    });

    if (currentBlockRef.current) {
      const b = currentBlockRef.current;
      ctx.fillStyle = WHITE;
      ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(255,255,255,0.5)';
      ctx.fillRect(b.x, b.y, b.width, BLOCK_HEIGHT - 6);
      ctx.shadowBlur = 0;
    }

    // Draw Particles
    particlesRef.current.forEach(p => {
      if (p.type === 'flash') {
        ctx.fillStyle = `rgba(255,215,0,${p.life * 0.8})`;
        ctx.fillRect(0, p.y - 1, GAME_WIDTH, 3);
      } else if (p.type === 'text') {
        ctx.fillStyle = `rgba(255,215,0,${p.life})`;
        ctx.shadowColor = 'rgba(255,215,0,0.5)';
        ctx.shadowBlur = 10;
        ctx.font = `italic 900 ${14 * p.scale}px 'JetBrains Mono'`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text!, p.x, p.y);
        ctx.shadowBlur = 0;
      } else if (p.type === 'ring') {
        ctx.strokeStyle = `rgba(255,215,0,${p.life})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.scale, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = GOLD_NEON; ctx.globalAlpha = p.life;
        ctx.fillRect(p.x, p.y, p.scale, p.scale); ctx.globalAlpha = 1;
      }
    });

    ctx.restore();

    // Scanlines (Batch)
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    for(let i=0; i<GAME_HEIGHT; i+=4) { ctx.rect(0, i, GAME_WIDTH, 1); }
    ctx.fill();

    if (xpRef?.current && goldRef?.current) {
        const curXp = Math.floor(scoreRef.current * XP_PER_BLOCK * overclockMult * multiplier);
        const curGold = Math.floor(scoreRef.current * GOLD_PER_BLOCK * midasMult * multiplier);
        xpRef.current.innerText = `+${curXp} XP`;
        goldRef.current.innerText = `+${curGold} GOLD`;
    }

    requestRef.current = requestAnimationFrame(loop);
  }, [isActive, onGameOver, multiplier, playSound, spawnBlock, overclockMult, midasMult]);

  useEffect(() => {
    if (isActive) {
      initGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  useEffect(() => {
    if (isActive) {
      requestRef.current = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(requestRef.current!);
  }, [isActive, loop]);

  return (
    <div className="flex flex-col w-full h-full bg-black select-none touch-none relative" onPointerDown={handleAction}>
      {/* Altitude Counter Overlay */}
      <div 
        className="absolute left-0 right-0 z-20 flex flex-col items-center justify-center pointer-events-none transition-all duration-300"
        style={{ top: '12%' }} 
      >
        <div className="text-5xl font-black text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.5)] tracking-tighter text-center w-full" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {displayScore}
        </div>
        <div className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] mt-1 text-center w-full" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          Meters
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden max-h-[520px]">
        <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="w-full h-full object-cover object-bottom"
        />
      </div>
    </div>
  );
});

export default React.memo(GameEngine);
