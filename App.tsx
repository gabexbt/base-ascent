import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http, useAccount, useReadContract } from 'wagmi';
import { base } from 'viem/chains';
import { formatUnits, erc20Abi } from 'viem';
import { coinbaseWallet } from 'wagmi/connectors';
import { pay, getPaymentStatus } from '@base-org/account';
import GameEngine from './components/GameEngine';
import LoadingScreen from './components/LoadingScreen';
import GameOver from './components/GameOver';
import { FarcasterProvider, useFarcaster } from './context/FarcasterContext';
import { useCasterContract } from './hooks/useCasterContract';
import { GameStatus, Player, LeaderboardEntry, Tab } from './types';
import { LOGO_URL, MINER_LEVELS, USDC_BASE_ADDRESS } from './constants';
import { IS_TESTNET, RECIPIENT_WALLET } from './network';
import { PlayerService } from './services/playerService';

const config = createConfig({
  chains: [base],
  connectors: [coinbaseWallet({ appName: 'Base Ascent' })],
  transports: { [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org') },
});

const queryClient = new QueryClient();

const ParticleBackground = () => {
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

const Icons = {
  Ascent: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 15-7-7-7 7"/><path d="m19 9-7-7-7 7"/></svg>,
  Hardware: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>,
  Ranking: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Profile: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
};

interface GameOverData {
  score: number;
  xp: number;
  gold: number;
  isNewHighScore: boolean;
}

const MainApp: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.ASCENT);
  const [status, setStatus] = useState<GameStatus>(GameStatus.IDLE);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerRank, setPlayerRank] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [rankingType, setRankingType] = useState<'skill' | 'grind'>('skill');
  const [taskTimers, setTaskTimers] = useState<Record<string, { time: number, focused: boolean }>>({});
  const [verifyingTaskId, setVerifyingTaskId] = useState<string | null>(null);
  const [hasLeftWindow, setHasLeftWindow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [gameOverData, setGameOverData] = useState<GameOverData | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playRandomTrack = useCallback(() => {
    const tracks = ['/audio/track1.mp3', '/audio/track2.mp3', '/audio/track3.mp3'];
    const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(randomTrack);
    audio.volume = 0.15;
    audio.loop = true;
    audio.play().catch(e => console.log("Audio play failed:", e));
    audioRef.current = audio;
  }, []);

  const { frameContext, isLoading: isFarcasterLoading } = useFarcaster();
  const { address } = useAccount();
  const { isPending } = useCasterContract();

  useEffect(() => {
    // Preload audio tracks
    const tracks = ['/audio/track1.mp3', '/audio/track2.mp3', '/audio/track3.mp3'];
    tracks.forEach(src => {
      const audio = new Audio(src);
      audio.preload = 'auto';
    });
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const { data: usdcBalanceValue } = useReadContract({
    address: USDC_BASE_ADDRESS as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      refetchInterval: 5000,
    }
  });

  const usdcBalanceFormatted = useMemo(() => {
    if (typeof usdcBalanceValue === 'bigint') return Number(formatUnits(usdcBalanceValue, 6)).toFixed(2);
    return "0.00";
  }, [usdcBalanceValue]);

  const loadData = useCallback(async () => {
    try {
      if (!frameContext.isReady) return;
      
      let fid = frameContext.user.fid;
      let username = frameContext.user.username;
      let pfpUrl = frameContext.user.pfpUrl;
      let referrer = frameContext.referrerFid;

      // Fallback for non-frame environments (browser testing) ONLY if fid is missing
      if (!fid) {
         console.log("No FID found, using fallback (dev mode)");
         fid = 18350;
         username = 'dev-preview';
         pfpUrl = 'https://placehold.co/400';
      }

      const data = await PlayerService.getPlayer(fid, username || 'unknown', pfpUrl, referrer);
      
      // Load local high score / xp if available (persistence fix)
      const localStore = localStorage.getItem(`player_stats_${fid}`);
      let localData = localStore ? JSON.parse(localStore) : null;

      if (data) {
        let mergedPlayer = { ...data };
        if (localData) {
          if (localData.highScore > mergedPlayer.highScore) {
             mergedPlayer.highScore = localData.highScore;
             // If local is higher, it means we haven't synced/flexed yet
             mergedPlayer.hasUploadedScore = false; 
          }
          // We can also merge totalXp if needed, but since we have offline farming, 
          // relying on DB + claim is safer. However, if they played and didn't sync:
          if (localData.totalXp > mergedPlayer.totalXp) {
             // Take max, assuming local has played more
             mergedPlayer.totalXp = localData.totalXp;
          }
          // Restore totalRuns from local storage if greater than DB (prevents reset)
          if (localData.totalRuns > mergedPlayer.totalRuns) {
             mergedPlayer.totalRuns = localData.totalRuns;
          }
        }
        setPlayer(mergedPlayer);
        
        const rank = await PlayerService.getPlayerRank(data.fid, rankingType);
        setPlayerRank(rank);
      }

      setIsLeaderboardLoading(true);
      const board = await PlayerService.getLeaderboard(15, rankingType);
      setLeaderboard(board);
      setIsLeaderboardLoading(false);

    } catch (e) {
      console.error("Load Error:", e);
      setIsLeaderboardLoading(false);
    }
  }, [frameContext, rankingType]);

  // Wait for frame context to be ready before loading data
  useEffect(() => { 
    if (frameContext.isReady) {
       // Clear leaderboard when switching to rankings tab to avoid flicker
       if (activeTab === Tab.RANKINGS) {
          setLeaderboard([]);
          setIsLeaderboardLoading(true);
       }
       loadData();
    }
  }, [loadData, frameContext.isReady, activeTab]);
  
  // Separate loading state management
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2500); // Fixed 2.5s load to ensure 100% bar
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTaskTimers(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(taskId => {
          if (next[taskId].time > 0) {
            next[taskId].time -= 1;
            changed = true;
            if (next[taskId].time === 0) {
              if (player) {
                // Optimistic update
                setPlayer(prev => prev ? ({
                   ...prev,
                   totalXp: prev.totalXp + 500,
                   completedTasks: [...(prev.completedTasks || []), taskId]
                }) : null);
                
                PlayerService.completeTask(player.fid, taskId, 500).then(() => loadData());
              }
              delete next[taskId];
            }
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [player, loadData]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (verifyingTaskId) setHasLeftWindow(true);
      } else {
        if (verifyingTaskId && hasLeftWindow) {
          setTaskTimers(prev => ({ ...prev, [verifyingTaskId]: { time: 10, focused: true } }));
          setVerifyingTaskId(null);
          setHasLeftWindow(false);
        }
      }
    };

    const handleBlur = () => {
      if (verifyingTaskId) setHasLeftWindow(true);
    };

    const handleFocus = () => {
      if (verifyingTaskId && hasLeftWindow) {
        setTaskTimers(prev => ({ ...prev, [verifyingTaskId]: { time: 10, focused: true } }));
        setVerifyingTaskId(null);
        setHasLeftWindow(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [verifyingTaskId, hasLeftWindow]);

  const handleTaskClick = (taskId: string, url: string) => {
    if (player?.completedTasks?.includes(taskId)) return;
    window.open(url, '_blank');
    setVerifyingTaskId(taskId);
    setHasLeftWindow(true);
  };

  const [isStarting, setIsStarting] = useState(false);

  const handleStartGame = async () => {
    if (isStarting) return;
    setIsStarting(true);
    playRandomTrack();
    try {
      // Force status update
      setStatus(GameStatus.PLAYING);
      setGameOverData(null);
    } catch (e) { 
      console.error("Start Error:", e);
      setStatus(GameStatus.IDLE); 
      stopAudio();
    }
    setTimeout(() => setIsStarting(false), 500);
  };

  const handleCopy = () => {
    const url = `https://base-ascent.vercel.app/r/${player?.username || player?.fid}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const [isClaiming, setIsClaiming] = useState(false);
  const [showClaimEffect, setShowClaimEffect] = useState(false);

  const handleClaim = async () => {
    if (player && !isClaiming) {
      setIsClaiming(true);
      setShowClaimEffect(true);
      
      try {
        await PlayerService.claimPassiveXp(player.fid);
        await loadData();
        
        // Reset effect after animation
        setTimeout(() => setShowClaimEffect(false), 2000);
      } catch (e) {
        console.error("Claim Error:", e);
      } finally {
        // Cooldown before allowing another claim
        setTimeout(() => setIsClaiming(false), 2000);
      }
    }
  };

  const handleUpgradeMiner = async (level: number) => {
    if (!player) return;
    setProcessingPayment(true);
    try {
      const cost = MINER_LEVELS[level].cost.toFixed(2);
      // @ts-ignore
      const { transactionId } = await pay({
        amount: cost,
        currency: 'USDC',
        to: RECIPIENT_WALLET,
        testnet: IS_TESTNET
      });

      await PlayerService.upgradeMiner(player.fid, level);
      await PlayerService.recordTransaction(player.fid, cost, 'miner_purchase', transactionId || 'base-pay', { miner_level: level });
      await loadData();
    } catch (e) {
      console.error(e);
      setProcessingPayment(false);
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleFlex = async () => {
    if (!player) return;
    const type = rankingType === 'skill' ? 'altitude' : 'xp';
    const hasUsedFree = type === 'altitude' ? player.hasUsedAltitudeFlex : player.hasUsedXpFlex;
    
    setProcessingPayment(true);
    try {
      let hash = 'free';
      if (!hasUsedFree) {
        // Free first time
        await PlayerService.syncPlayerStats(player.fid, player.totalXp, player.totalGold, player.highScore, player.totalRuns);
        if (type === 'altitude') {
          await PlayerService.syncAltitude(player.fid);
        } else {
          await PlayerService.syncXp(player.fid);
        }
        await PlayerService.recordTransaction(player.fid, '0', `${type}_flex_free`, 'free', { flex_type: type });
      } else {
        // Paid subsequent times
        // @ts-ignore
        const { transactionId } = await pay({
          amount: '0.10',
          currency: 'USDC',
          to: RECIPIENT_WALLET,
          testnet: IS_TESTNET
        });
        hash = transactionId;

        await PlayerService.syncPlayerStats(player.fid, player.totalXp, player.totalGold, player.highScore, player.totalRuns);
        if (type === 'altitude') {
          await PlayerService.syncAltitude(player.fid);
        } else {
          await PlayerService.syncXp(player.fid);
        }
        await PlayerService.recordTransaction(player.fid, '0.10', `${type}_flex_paid`, hash, { flex_type: type });
      }
      await loadData();
    } catch (e) {
      console.error("Payment Error:", e);
      setProcessingPayment(false);
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleGameOver = async (score: number, xp: number, gold: number) => {
    stopAudio();
    const isNewHighScore = player ? score > player.highScore : false;
    setGameOverData({ score, xp, gold, isNewHighScore });
    if (player) {
      // Update local state
      const updatedPlayer = {
        ...player,
        totalXp: player.totalXp + xp,
        highScore: Math.max(player.highScore, score),
        totalRuns: player.totalRuns + 1
      };
      setPlayer(updatedPlayer);

      // Save to localStorage for persistence across sessions
      localStorage.setItem(`player_stats_${player.fid}`, JSON.stringify({
        highScore: updatedPlayer.highScore,
        totalXp: updatedPlayer.totalXp,
        totalRuns: updatedPlayer.totalRuns
      }));
      
      // Auto-save run count to DB in background (best effort)
      PlayerService.syncPlayerStats(player.fid, updatedPlayer.totalXp, updatedPlayer.totalGold, updatedPlayer.highScore, updatedPlayer.totalRuns).catch(console.error);
    }
    setStatus(GameStatus.GAMEOVER);
  };

  const handlePlayAgain = () => {
    handleStartGame();
  };

  const handleGoHome = () => {
    setStatus(GameStatus.IDLE);
    setGameOverData(null);
    setActiveTab(Tab.ASCENT);
  };

  const currentMiner = MINER_LEVELS[player?.minerLevel || 0];
  const nextMiner = player && player.minerLevel < 5 ? MINER_LEVELS[player.minerLevel + 1] : null;

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const passiveEarnings = useMemo(() => {
    if (!player || player.minerLevel === 0) return 0;
    const hours = (now - player.lastClaimAt) / 3600000;
    const earnings = Math.floor(hours * currentMiner.xpPerHour) + (player.bankedPassiveXp || 0);
    return Math.max(0, earnings); // Prevent negative earnings
  }, [player, currentMiner, now]);

  const handleRankingChange = (type: 'skill' | 'grind') => {
    if (type === rankingType) return;
    setRankingType(type);
    setLeaderboard([]); // Clear immediately to avoid flickering
    setIsLeaderboardLoading(true); // Set loading state immediately
  };

  const syncStatus = useMemo(() => {
    if (!player) return 'UNSYNCED';
    if (rankingType === 'skill') {
      if (!player.hasUsedAltitudeFlex) return 'UNSYNCED';
      return (player.leaderboardHighScore === player.highScore && player.highScore > 0) ? 'SYNCED' : 'UNSYNCED';
    }
    if (!player.hasUsedXpFlex) return 'UNSYNCED';
    return (player.leaderboardTotalXp === player.totalXp && player.totalXp > 0) ? 'SYNCED' : 'UNSYNCED';
  }, [player, rankingType]);

  if (loading || isFarcasterLoading) return <LoadingScreen />;

  return (
    <div className="h-[100dvh] bg-black text-white font-mono flex flex-col items-center overflow-hidden antialiased select-none">
      <header className="w-full max-w-md px-6 py-4 flex justify-between items-center border-b border-white/10 bg-black shrink-0 z-20">
        <div className="flex items-center gap-3">
          <img src={player?.pfpUrl || "https://picsum.photos/40/40"} className="w-10 h-10 rounded-full border border-white/20" alt="" />
          <div>
            <div className="text-sm font-bold">@{player?.username}</div>
            <div className="text-[9px] opacity-40 uppercase tracking-widest">FID: {player?.fid}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold">${usdcBalanceFormatted} USDC</div>
        </div>
      </header>

      <main className="w-full max-w-md flex-1 flex flex-col overflow-hidden relative">
        <ParticleBackground />
        <div className="flex-1 px-5 py-6 flex flex-col overflow-hidden relative z-10">
          {activeTab === Tab.ASCENT ? (
            <div className="flex-1 flex flex-col gap-6 relative">
              {status === GameStatus.PLAYING ? (
                <GameEngine isActive={true} onGameOver={handleGameOver} multiplier={currentMiner.multiplier} />
              ) : status === GameStatus.GAMEOVER && gameOverData ? (
                <GameOver 
                  score={gameOverData.score}
                  xpGained={gameOverData.xp}
                  goldGained={gameOverData.gold}
                  isHighScore={gameOverData.isNewHighScore}
                  onPlayAgain={handlePlayAgain}
                  onGoHome={handleGoHome}
                />
              ) : status === GameStatus.IDLE ? (
                <div className="flex-1 flex flex-col items-center gap-2 text-center">
                   <div className="flex flex-col items-center z-10 w-full px-2 mt-8">
                    <div className="w-full h-[220px] flex items-center justify-center animate-pulse duration-[2000ms]">
                       <img src={LOGO_URL} className="max-w-full max-h-full object-contain scale-[1.6]" alt="ASCENT" />
                    </div>
                    <p className="text-[11px] opacity-40 uppercase tracking-[0.4em] font-black mt-6">ASCEND TO NEW HEIGHTS</p>
                  </div>
                  <div className="flex flex-col items-center w-full mt-auto mb-6 gap-6">
                    <button onClick={() => { handleStartGame(); }} disabled={isPending || isStarting} className="w-full max-w-[320px] py-5 border-[3px] border-white bg-white text-black font-black text-lg uppercase tracking-tight rounded-[2.5rem] active:scale-95 transition-all disabled:opacity-50">
                      {isPending ? 'SYNCING...' : 'Tap to Start'}
                    </button>
                    <div className="grid grid-cols-2 gap-3 w-full max-w-[320px]">
                      <div className="p-3 bg-white/5 border border-white/10 rounded-[2rem] flex flex-col items-center">
                        <div className="text-[8px] opacity-30 uppercase font-black">Miner Level</div>
                        <div className="text-xl font-black italic">LVL {player?.minerLevel || 0}</div>
                      </div>
                      <div className="p-3 bg-white/5 border border-white/10 rounded-[2rem] flex flex-col items-center">
                        <div className="text-[8px] opacity-30 uppercase font-black">High Score</div>
                        <div className="text-xl font-black italic">{player?.highScore || 0} meters</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : <div className="flex-1 flex flex-col items-center justify-center"><div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div></div>}
            </div>
          ) : activeTab === Tab.HARDWARE ? (
            <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar items-center pb-8">
              <h2 className="text-4xl font-black italic tracking-tighter uppercase text-center w-full">Hardware</h2>
              <div className="p-5 border border-white/10 bg-white/5 rounded-3xl space-y-2 w-full text-center shrink-0">
                <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">AUTO MINER</h3>
                <p className="text-[10px] leading-relaxed opacity-40 uppercase font-bold">Upgrade your miner to farm more XP to reach the leaderboard and qualify for the airdrop.</p>
              </div>
              <div className="p-8 border border-white/10 bg-white/5 rounded-[40px] w-full flex-1 flex flex-col items-center justify-center gap-8 shrink-0">
                {player?.minerLevel === 0 ? (
                  <div className="flex flex-col items-center gap-6 w-full text-center">
                    <div className="w-20 h-20 border-2 border-dashed border-white/20 rounded-full flex items-center justify-center opacity-30"><Icons.Hardware /></div>
                    <div className="space-y-2">
                      <div className="text-xl font-black italic uppercase">MINER STATUS: LOCKED</div>
                      <p className="text-[10px] opacity-40 font-bold uppercase px-6 leading-relaxed">Unlock to start earning XP passively.</p>
                    </div>
                    <button onClick={() => handleUpgradeMiner(1)} className="w-full py-6 bg-white text-black font-black text-xl uppercase rounded-3xl active:scale-95 transition-all">Unlock Miner ($0.99)</button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4 w-full">
                      <div className="p-4 bg-white/5 border border-white/10 rounded-3xl flex flex-col items-center justify-center">
                        <div className="text-[9px] opacity-40 font-black uppercase tracking-wider mb-1">Status</div>
                        <div className="text-2xl font-black italic">LVL {player?.minerLevel}</div>
                      </div>
                      <div className="p-4 bg-white/5 border border-white/10 rounded-3xl flex flex-col items-center justify-center">
                  <div className="text-[9px] opacity-40 font-black uppercase tracking-wider mb-1">Rate</div>
                  <div className="text-xl font-black italic text-center">{currentMiner.xpPerHour.toLocaleString()} XP/HR</div>
                </div>
                    </div>
                    
                    <div className="w-full p-8 bg-[#111] border border-white/10 rounded-[32px] flex flex-col justify-center gap-2 items-center text-center shrink-0">
                      <div className="text-xs opacity-40 font-black uppercase tracking-widest">Unclaimed Earnings</div>
                      <div className={`text-4xl font-black italic text-center tracking-tighter transition-all duration-300 ${showClaimEffect ? 'text-green-400 scale-110' : 'text-white'}`}>+{passiveEarnings}</div>
                      <div className="text-xs font-bold uppercase opacity-30">XP Generated</div>
                      <button 
                        onClick={handleClaim} 
                        disabled={passiveEarnings === 0 || isClaiming} 
                        className={`mt-auto w-full py-4 font-black text-lg rounded-2xl active:scale-95 disabled:opacity-20 transition-all uppercase ${showClaimEffect ? 'bg-green-400 text-black' : 'bg-white text-black'}`}
                      >
                        {isClaiming ? 'Claiming...' : showClaimEffect ? 'Claimed!' : 'Claim to Wallet'}
                      </button>
                    </div>

                    <div className="w-full">
                      {nextMiner ? (
                        <button onClick={() => handleUpgradeMiner(player.minerLevel + 1)} disabled={processingPayment} className="w-full py-5 border-2 border-white font-black text-lg hover:bg-white hover:text-black transition-all rounded-3xl disabled:opacity-50 uppercase">
                          {processingPayment ? 'Processing...' : `Upgrade to Lvl ${player.minerLevel + 1} • $${nextMiner.cost.toFixed(2)}`}
                        </button>
                      ) : (
                        <div className="py-5 border-2 border-dashed border-white/20 text-center opacity-30 font-black rounded-3xl uppercase">Max Level Reached</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : activeTab === Tab.RANKINGS ? (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
               <div className="flex flex-col gap-2 shrink-0 px-4 pt-2">
                 <div className="flex justify-between items-center w-full">
                    <h2 className="text-3xl font-black italic uppercase tracking-tighter">{rankingType === 'skill' ? 'Altitude' : 'Experience'}</h2>
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 gap-1 shrink-0">
                        <button onClick={() => handleRankingChange('skill')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg ${rankingType === 'skill' ? 'bg-white text-black' : 'opacity-40'}`}>Altitude</button>
                        <button onClick={() => handleRankingChange('grind')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg ${rankingType === 'grind' ? 'bg-white text-black' : 'opacity-40'}`}>Experience</button>
                    </div>
                 </div>
               </div>

               <div className="shrink-0 px-4 py-3 border border-white/10 bg-white/5 rounded-3xl space-y-2 text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest opacity-80">LEADERBOARD RULES</h3>
                  </div>
                  <p className="text-[9px] leading-relaxed opacity-40 uppercase font-bold">
                    {rankingType === 'skill' 
                      ? "This leaderboard is strictly for those who want to prove their skill. It ranks players based on their highest single-run score. Focus on precision and survival to climb the rankings. The Top 20 players will qualify for an upcoming airdrop."
                      : "This leaderboard rewards dedication and consistent play. It tracks your Total XP, which is a combination of your gameplay, active referrals, and earnings from your AutoMiner. Every action you take in the game builds this score over time. The Top 20 leaders here will qualify for an upcoming airdrop."
                    }
                  </p>
               </div>

               <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                  {isLeaderboardLoading ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-50">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mb-2"></div>
                      <div className="text-[10px] font-black uppercase tracking-widest">LOADING RANKS...</div>
                    </div>
                  ) : leaderboard.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-30">
                      <div className="text-[10px] font-black uppercase tracking-widest">NO RECORDS YET</div>
                    </div>
                  ) : (
                    leaderboard.map((entry, idx) => (
                      <div key={entry.fid} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-black opacity-30">{idx + 1}</span>
                          <img src={entry.pfpUrl || `https://picsum.photos/seed/${entry.fid}/32/32`} className="w-8 h-8 rounded-full opacity-60 border border-white/10" alt="" />
                          <div className="text-sm font-bold">@{entry.username}</div>
                        </div>
                        <div className="text-lg font-black italic">{rankingType === 'skill' ? entry.highScore : entry.totalXp.toLocaleString()}</div>
                      </div>
                    ))
                  )}
               </div>
               <div className="shrink-0 p-4 border border-white/10 bg-white/5 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center px-2">
                     <div className="text-[10px] opacity-40 font-black uppercase tracking-widest">Your Rank</div>
                     <div className="flex items-center gap-3">
                        <span className={`text-[9px] font-bold uppercase ${syncStatus === 'SYNCED' ? 'text-green-400' : 'text-yellow-400'}`}>{syncStatus}</span>
                        <div className="text-[14px] font-black italic font-mono uppercase">#{playerRank || 0} | {rankingType === 'skill' ? player?.highScore : player?.totalXp} {rankingType === 'skill' ? 'm' : 'XP'}</div>
                     </div>
                  </div>
                  <button onClick={handleFlex} disabled={processingPayment} className="w-full py-4 border-2 border-white bg-black active:bg-white active:text-black transition-all font-black text-sm uppercase rounded-2xl active:scale-95 disabled:opacity-50">
                    {processingPayment ? 'Processing...' : (
                      <>
                        <span className="uppercase tracking-wider">FLEX {rankingType === 'skill' ? 'ALTITUDE' : 'EXPERIENCE'}</span>
                        {((rankingType === 'skill' && player?.hasUsedAltitudeFlex) || (rankingType === 'grind' && player?.hasUsedXpFlex)) ? (
                           <span className="opacity-50 ml-2">($0.1 USDC)</span>
                        ) : (
                           <span className="text-green-400 ml-2">(FREE)</span>
                        )}
                      </>
                    )}
                  </button>
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1 pb-4 items-center w-full">
               <h2 className="text-3xl font-black italic uppercase">PROFILE</h2>
               <div className="w-full p-6 border border-white/10 bg-white/5 rounded-[40px] flex flex-col items-center">
                  <h3 className="text-2xl font-black italic uppercase opacity-40 mb-5 tracking-widest">STATS</h3>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-6 w-full text-center">
                     <div><span className="text-[9px] font-black opacity-30 uppercase">Altitude Record</span><span className="text-xl font-black italic block">{player?.highScore || 0} Meters</span></div>
                     <div><span className="text-[9px] font-black opacity-30 uppercase">Miner Level</span><span className="text-xl font-black italic block">LVL {player?.minerLevel || 0}</span></div>
                     <div><span className="text-[9px] font-black opacity-30 uppercase">Total XP</span><span className="text-xl font-black italic block">{player?.totalXp.toLocaleString()}</span></div>
                     <div><span className="text-[9px] font-black opacity-30 uppercase">Total Games</span><span className="text-xl font-black italic block">{player?.totalRuns}</span></div>
                  </div>
               </div>
               <div className="w-full p-6 border border-white/10 bg-white/5 rounded-[40px]">
                  <h3 className="text-xs font-black uppercase opacity-30 text-center mb-4 tracking-[0.2em]">INVITE RECRUITS</h3>
                  <div className="flex items-center justify-between bg-black/50 border border-white/10 p-4 rounded-[28px] text-center mb-3">
                    <div className="w-1/2"><span className="text-[9px] opacity-30 block uppercase font-bold">Referrals</span><span className="text-2xl font-black italic">{player?.referralCount || 0}</span></div>
                    <div className="w-1/2 border-l border-white/10"><span className="text-[9px] opacity-30 block uppercase font-bold">Referral XP</span><span className="text-xl font-black italic">{player?.referralXpEarned || 0} XP</span></div>
                  </div>
                  <div onClick={handleCopy} className="p-4 bg-white/5 border border-white/20 rounded-2xl text-[9px] opacity-40 text-center tracking-widest uppercase cursor-pointer hover:bg-white/10 transition-all active:scale-98">
                    {copied ? 'COPIED!' : `base-ascent.vercel.app/r/${player?.username || player?.fid}`}
                  </div>
                  <p className="text-[8px] opacity-30 text-center mt-2 italic px-4 uppercase font-bold">You earn 10% of all XP generated by your recruits hardware automatically.</p>
               </div>
               <div className="w-full p-6 border border-white/10 bg-white/5 rounded-[40px]">
                  <h3 className="text-2xl font-black italic opacity-40 text-center mb-5 tracking-widest">TASKS</h3>
                  <div className="space-y-3">
                     {[
                       { id: 'f-gabe', l: 'Follow gabe on Base', u: 'https://base.app/profile/gabexbt' },
                       { id: 'f-x', l: 'Follow gabe on X', u: 'https://x.com/gabexbt' },
                       { id: 'post-interaction', l: 'Engagement Booster', u: 'https://warpcast.com/gabexbt/0x892a0' }
                     ].map(t => (
                        <div key={t.id} className="w-full p-4 border border-white/10 rounded-[28px] flex items-center justify-between bg-black/50">
                           <div className="text-left"><div className="text-[10px] font-black uppercase">{t.l}</div><div className="text-[8px] opacity-40">+500 XP</div></div>
                           <button onClick={() => handleTaskClick(t.id, t.u)} disabled={player?.completedTasks?.includes(t.id) || taskTimers[t.id]?.time > 0 || (verifyingTaskId === t.id)} className="text-[9px] font-black italic border border-white/20 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50 transition-all min-w-[80px]">
                              {player?.completedTasks?.includes(t.id) ? 'DONE' : taskTimers[t.id]?.time > 0 ? `CHECKING... ${taskTimers[t.id].time}s` : verifyingTaskId === t.id ? 'WAITING...' : 'CLAIM XP'}
                           </button>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>

      <nav className="w-full max-w-[500px] bg-black border-t border-white/10 flex justify-around items-center py-4 shrink-0 relative z-20">
        {[Tab.ASCENT, Tab.HARDWARE, Tab.RANKINGS, Tab.PROFILE].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={`flex flex-col items-center gap-1 ${activeTab === t ? 'opacity-100' : 'opacity-30'}`}>
            {t === Tab.ASCENT && <Icons.Ascent />} {t === Tab.HARDWARE && <Icons.Hardware />}
            {t === Tab.RANKINGS && <Icons.Ranking />} {t === Tab.PROFILE && <Icons.Profile />}
            <span className="text-[9px] font-black uppercase tracking-tighter">{t}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

const App: React.FC = () => (
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <FarcasterProvider>
        <MainApp />
      </FarcasterProvider>
    </QueryClientProvider>
  </WagmiProvider>
);
export default App;
