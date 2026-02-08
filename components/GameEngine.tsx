
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
}

const GameEngine = React.forwardRef<{ endGame: () => void }, GameEngineProps>(({ onGameOver, isActive, multiplier, upgrades, xpRef, goldRef }, ref) => {
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

  // Derived Constants based on Upgrades
  const rapidLiftMult = 1 + ((upgrades?.rapid_lift || 0) * 0.015);
  const effectiveBlockHeight = BLOCK_HEIGHT * rapidLiftMult;
  
  const magnetMult = 1 + ((upgrades?.magnet || 0) * 0.05);
  const batteryMult = 1 + ((upgrades?.battery || 0) * 0.05);
  
  const luckTolerance = 10 + ((upgrades?.luck || 0) * 2); // Base 10px + 2px per level
  const stabilizerReduc = (upgrades?.stabilizer || 0) * 0.01; // 1% per level

  // State only for UI triggers
  const [displayScore, setDisplayScore] = useState(0);
  
  // Expose endGame to parent
  React.useImperativeHandle(ref, () => ({
    endGame: () => {
      if (!isActive) return;
      const finalAltitude = Math.floor(scoreRef.current * rapidLiftMult);
      const baseXp = scoreRef.current * XP_PER_BLOCK;
      const finalXp = Math.floor(baseXp * batteryMult * multiplier);
      const baseGold = scoreRef.current * GOLD_PER_BLOCK;
      const finalGold = Math.floor(baseGold * magnetMult * multiplier);
      onGameOver(finalAltitude, finalXp, finalGold);
    }
  }));

  const playSound = useCallback((type: 'hit' | 'perfect' | 'fail' | 'gameover') => {
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
        gain.gain.setValueAtTime(0.9, now);
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
  }, []);

  const spawnBlock = useCallback((width: number, y: number, currentScore: number) => {
    const speedStep = Math.floor(currentScore / 5);
    const speedMultiplier = Math.pow(1.07, speedStep);
    const widthStep = Math.floor(currentScore / 10);
    const widthMultiplier = Math.max(0.6, 1 - (widthStep * 0.02));
    const nextWidth = Math.max(40, Math.floor(width * widthMultiplier));
    let baseSpeed = 1.0;
    
    if (currentScore < 50) {
      // Good playable speed start (6.0), very slow ramp to 7.0 over 50 levels
      baseSpeed = 6.0 + (currentScore * 0.02); 
    } else {
      // Ramp up after 50
      const swing = Math.sin(currentScore * 0.5) * 0.5;
      baseSpeed = 7.0 + ((currentScore - 50) * 0.1) + swing;
    }
    
    const finalSpeed = Math.min(baseSpeed * speedMultiplier, 16.0) * (1.0 - stabilizerReduc);

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
    startTimeRef.current = Date.now(); // Set start time
    spawnBlock(INITIAL_BLOCK_WIDTH, GAME_HEIGHT - BLOCK_HEIGHT * 2, 0);
  }, [spawnBlock]);

  const handleAction = useCallback(() => {
    // Grace period check (500ms)
    if (!isActive || !currentBlockRef.current || Date.now() - startTimeRef.current < 500) return;

    const currentBlock = currentBlockRef.current;
    const blocks = blocksRef.current;
    const lastBlock = blocks[blocks.length - 1];
    
    const overlapStart = Math.max(lastBlock.x, currentBlock.x);
    const overlapEnd = Math.min(lastBlock.x + lastBlock.width, currentBlock.x + currentBlock.width);
    const overlapWidth = overlapEnd - overlapStart;

    const currentLuckTolerance = Math.max(4, luckTolerance - Math.floor(scoreRef.current / 10));
    const isPerfect = Math.abs(currentBlock.x - lastBlock.x) < currentLuckTolerance;
    const isForgiveness = isPerfect && overlapWidth < lastBlock.width;
    
    if (overlapWidth <= 0) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      playSound('gameover');
      
      // Calculate Rewards
      // Altitude = Blocks * Effective Height (Rapid Lift)
      // Note: We use Math.ceil to ensure at least 1m if they placed blocks
      const finalAltitude = Math.floor(scoreRef.current * rapidLiftMult); 
      
      // XP = Blocks * Base XP * Upgrade Mult * Miner Mult
      const baseXp = scoreRef.current * XP_PER_BLOCK;
      const finalXp = Math.floor(baseXp * batteryMult * multiplier);
      
      // Gold = Blocks * Base Gold * Upgrade Mult * Miner Mult
      const baseGold = scoreRef.current * GOLD_PER_BLOCK;
      const finalGold = Math.floor(baseGold * magnetMult * multiplier);

      onGameOver(finalAltitude, finalXp, finalGold);
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
      if (isForgiveness) {
        particlesRef.current.push(
          { id: particleIdRef.current++, x: centerX, y: currentBlock.y + BLOCK_HEIGHT / 2, vx: 0, vy: 0, life: 1.0, scale: 10, type: 'ring' },
          { id: particleIdRef.current++, x: centerX, y: currentBlock.y - 24, vx: 0, vy: -0.6, text: 'LUCK', life: 1.4, scale: 1.4, type: 'text' }
        );
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
  }, [isActive, onGameOver, multiplier, playSound, spawnBlock, rapidLiftMult, batteryMult, magnetMult, luckTolerance]);

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
      scale: p.type === 'text' ? p.scale : p.type === 'ring' ? p.scale * 1.06 : p.scale * 0.96
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
      } else if (p.type === 'ring') {
        ctx.strokeStyle = `rgba(124,255,178,${p.life})`;
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

    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for(let i=0; i<GAME_HEIGHT; i+=4) { ctx.fillRect(0, i, GAME_WIDTH, 1); }

    // UI - Display Altitude instead of raw blocks
    const currentAltitude = Math.floor(scoreRef.current * rapidLiftMult);
    
    // Update Stats Overlay directly
    if (xpRef?.current && goldRef?.current) {
        const curXp = Math.floor(scoreRef.current * XP_PER_BLOCK * batteryMult * multiplier);
        const curGold = Math.floor(scoreRef.current * GOLD_PER_BLOCK * magnetMult * multiplier);
        xpRef.current.innerText = `+${curXp} XP`;
        goldRef.current.innerText = `+${curGold} GOLD`;
    }

    if (ctx) {
       // Only draw score if needed, but we use overlay now
    }
    
    ctx.fillStyle = WHITE;
    ctx.font = "800 60px 'JetBrains Mono'";
    ctx.textAlign = 'center';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.fillText(`${currentAltitude}`, GAME_WIDTH / 2, 100);
    ctx.shadowBlur = 0;
    
    ctx.font = "900 12px 'JetBrains Mono'";
    ctx.globalAlpha = 0.6;
    ctx.fillText('METERS', GAME_WIDTH / 2, 120);
    ctx.globalAlpha = 1.0;

    requestRef.current = requestAnimationFrame(loop);
  }, [isActive, onGameOver, multiplier, playSound, spawnBlock, rapidLiftMult, batteryMult, magnetMult, luckTolerance]);

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
    <div className="flex flex-col w-full h-full bg-black select-none touch-none" onPointerDown={handleAction}>
      <div className="flex-1 relative overflow-hidden max-h-[520px]">
        <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="w-full h-full object-cover"
        />
      </div>
    </div>
  );
});

export default GameEngine;
