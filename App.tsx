import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http, useAccount, useBalance } from 'wagmi';
import { base, baseSepolia } from 'viem/chains';
import { formatUnits, erc20Abi } from 'viem';
import { coinbaseWallet } from 'wagmi/connectors';
import { pay, getPaymentStatus } from '@base-org/account';
import sdk from '@farcaster/frame-sdk';
import GameEngine from './components/GameEngine';
import LoadingScreen from './components/LoadingScreen';
import GameOver from './components/GameOver';
import { UpgradesTab } from './components/UpgradesTab';
import { FarcasterProvider, useFarcaster } from './context/FarcasterContext';
import { useCasterContract } from './hooks/useCasterContract';
import { GameStatus, Player, LeaderboardEntry, Tab, UpgradeType } from './types';
import { LOGO_URL, MINER_LEVELS, USDC_BASE_ADDRESS, getUpgradeCost } from './constants';
import { IS_TESTNET, RECIPIENT_WALLET } from './network';
import { PlayerService } from './services/playerService';

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
  Upgrades: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  Hardware: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>,
  Ranking: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Profile: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
};

interface GameOverData {
  score: number;
  xp: number;
  gold: number;
  isNewHighScore: boolean;
  hasDoubled: boolean;
}

const MainApp: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.ASCENT);
  const [showNeynarGuide, setShowNeynarGuide] = useState(false);
  const [status, setStatus] = useState<GameStatus>(GameStatus.IDLE);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerRank, setPlayerRank] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [rankingType, setRankingType] = useState<'skill' | 'grind'>('skill');
  const [taskTimers, setTaskTimers] = useState<Record<string, { time: number, focused: boolean }>>({});
  const [copied, setCopied] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<{ miner: 'idle' | 'loading' | 'success' | 'error'; double: 'idle' | 'loading' | 'success' | 'error'; flex: 'idle' | 'loading' | 'success' | 'error'; recharge: 'idle' | 'loading' | 'success' | 'error' }>({ miner: 'idle', double: 'idle', flex: 'idle', recharge: 'idle' });
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [gameOverData, setGameOverData] = useState<GameOverData | null>(null);
  const [globalRevenue, setGlobalRevenue] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gameRef = useRef<{ endGame: () => void }>(null);
  const sessionXpRef = useRef<HTMLDivElement>(null);
  const sessionGoldRef = useRef<HTMLDivElement>(null);

  // Tab Switch Game Over Logic
  useEffect(() => {
    if (status === GameStatus.PLAYING && activeTab !== Tab.ASCENT) {
      // Trigger game over via ref
      if (gameRef.current) {
        gameRef.current.endGame();
      }
    }
  }, [activeTab, status]);
  
  // Payment Timeout Helper - REMOVED per user request


  const playRandomTrack = useCallback(() => {
    const tracks = ['/audio/track1.mp3', '/audio/track2.mp3', '/audio/track3.mp3'];
    const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(randomTrack);
    audio.volume = 0.12;
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

  const { data: usdcBalance } = useBalance({
    address: address,
    token: USDC_BASE_ADDRESS as `0x${string}`,
    query: {
      refetchInterval: 5000,
    }
  });

  const usdcBalanceFormatted = useMemo(() => {
    if (!address) return "-";
    if (usdcBalance) return Number(usdcBalance.formatted).toFixed(2);
    return "-";
  }, [usdcBalance, address]);

  // Sync wallet address to database when connected
  useEffect(() => {
    if (player?.fid && address) {
      PlayerService.updateWalletAddress(player.fid, address);
    }
  }, [player?.fid, address]);


  const loadData = useCallback(async (silent = false) => {
    try {
      if (frameContext.user?.fid && !silent) {
         const currentUrl = window.location.href;
         PlayerService.log(`URL: ${currentUrl}`);
      }

      let fid = frameContext.user.fid;
        let username = frameContext.user.username;
        let pfpUrl = frameContext.user.pfpUrl;
      
      // Parse Referrer from URL (priority) or Frame Context
      // Get URL params for referral
      const fullUrl = window.location.href;
      const refMatch = fullUrl.match(/[?&](ref|referrer)=([^&#]+)/);
      let rawRef = refMatch ? refMatch[2] : null;

      // Also check standard params just in case
      if (!rawRef) {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
        rawRef = searchParams.get('ref') || searchParams.get('referrer') || hashParams.get('ref') || hashParams.get('referrer');
      }

      // Clean the referrer string
      const cleanRef = rawRef ? rawRef.replace(/[^a-zA-Z0-9_-]/g, '') : null;
      
      if (cleanRef) PlayerService.log(`Found Ref: ${cleanRef}`);

      // PERSISTENCE: Check local storage if URL param is missing
      // This handles redirects where params might be stripped but were caught earlier
      const storedRef = localStorage.getItem('referral_code');
      let referrer = cleanRef || storedRef || frameContext.referrerFid;

      // Save to local storage if found
      if (cleanRef) {
        localStorage.setItem('referral_code', cleanRef);
      }

      // Fallback for non-frame environments (browser testing) ONLY if fid is missing
      if (!fid) {
         console.log("No FID found, using fallback (dev mode)");
         fid = 18350;
         username = 'dev-preview';
         pfpUrl = 'https://placehold.co/400';
      }

      const data = await PlayerService.getPlayer(fid, username || 'unknown', pfpUrl, referrer);
      const revenue = await PlayerService.getGlobalRevenue();
      setGlobalRevenue(revenue);
      
      // Load local high score / xp if available (persistence fix)
      const localStore = localStorage.getItem(`player_stats_v2_${fid}`);
      let localData = localStore ? JSON.parse(localStore) : null;

      if (data) {
        let mergedPlayer = { ...data };
        
        // Check for Remote Reset (Token Mismatch)
        const serverResetToken = data.resetToken;
        const localResetToken = localData?.resetToken;

        // If server has a token and it differs from local, strictly use server data (RESET)
        const isRemoteReset = serverResetToken && serverResetToken !== localResetToken;

        if (localData && !isRemoteReset) {
          if (localData.highScore > mergedPlayer.highScore) {
             mergedPlayer.highScore = localData.highScore;
             mergedPlayer.hasUploadedScore = false; 
          }
          if (localData.totalXp > mergedPlayer.totalXp) {
             mergedPlayer.totalXp = localData.totalXp;
          }
          if (localData.totalRuns > mergedPlayer.totalRuns) {
             mergedPlayer.totalRuns = localData.totalRuns;
          }
          if (localData.totalGold > mergedPlayer.totalGold) { // Persist Gold too
             mergedPlayer.totalGold = localData.totalGold;
          }
        }
        
        // Update local storage with latest token if reset occurred
        if (isRemoteReset || !localData) {
           localStorage.setItem(`player_stats_v2_${fid}`, JSON.stringify({
             highScore: mergedPlayer.highScore,
             totalXp: mergedPlayer.totalXp,
             totalGold: mergedPlayer.totalGold,
             totalRuns: mergedPlayer.totalRuns,
             resetToken: serverResetToken
           }));
        }

        setPlayer(mergedPlayer);
        
        const rank = await PlayerService.getPlayerRank(data.fid, rankingType);
        if (rank === 0 && ((rankingType === 'skill' && data.hasUsedAltitudeFlex) || (rankingType === 'grind' && data.hasUsedXpFlex))) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const retryRank = await PlayerService.getPlayerRank(data.fid, rankingType);
          setPlayerRank(retryRank);
        } else {
          setPlayerRank(rank);
        }
      }

      const fetchLeaderboard = async (attempt: number = 0): Promise<LeaderboardEntry[]> => {
        const board = await PlayerService.getLeaderboard(100, rankingType);
        if (board.length === 0 && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 500));
          return fetchLeaderboard(attempt + 1);
        }
        return board;
      };

      if (!silent) setIsLeaderboardLoading(true);
      const board = await fetchLeaderboard();
      setLeaderboard(board);
      if (!silent) setIsLeaderboardLoading(false);

    } catch (e) {
      console.error("Load Error:", e);
      if (!silent) setIsLeaderboardLoading(false);
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

  useEffect(() => {
    if (!frameContext.isReady || (activeTab !== Tab.RANKINGS && activeTab !== Tab.PROFILE)) return;
    
    // Only refresh silently if we already have data
    const shouldSilentRefresh = leaderboard.length > 0;
    
    const interval = setInterval(() => loadData(shouldSilentRefresh), 10000); 
    return () => clearInterval(interval);
  }, [frameContext.isReady, activeTab, loadData, leaderboard.length]);
  
  // Separate loading state management
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2500); // Fixed 2.5s load to ensure 100% bar
    return () => clearTimeout(timer);
  }, []);

  // Deferred Deep Linking Check (Fix for App Store stripping params)
  useEffect(() => {
    const checkDeferred = async () => {
       // Only check if player exists and has NO referrer
       if (player && !player.referrerFid && !player.referrerUsername) {
          // Avoid checking multiple times if already checked
          if (sessionStorage.getItem('deferred_checked')) {
             PlayerService.log('Deferred Check Skipped: Already checked session');
             return;
          }
          
          PlayerService.log('Starting Deferred Deep Link Check...');
          sessionStorage.setItem('deferred_checked', 'true');
          const code = await PlayerService.checkDeferredReferral();
          
          if (code) {
             PlayerService.log(`Deferred Deep Link Found: ${code}`);
             const res = await PlayerService.redeemReferral(player.fid, code);
             if (res.success) {
                PlayerService.log(`Deferred Referral Redeemed: ${code}`);
                loadData(); // Refresh to show referrer
             } else {
                PlayerService.log(`Redeem Failed: ${res.message}`);
             }
          } else {
             PlayerService.log('No Deferred Deep Link Found for IP');
          }
       }
    };
    
    checkDeferred();
  }, [player?.fid]); // Only run when player ID changes (login)

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
                // Optimistic update: 50,000 XP, 10,000 GOLD, 5 Free Spins
                setPlayer(prev => prev ? ({
                   ...prev,
                   totalXp: prev.totalXp + 50000,
                   totalGold: prev.totalGold + 10000,
                   ascentsRemaining: (prev.ascentsRemaining || 0) + 5,
                   completedTasks: [...(prev.completedTasks || []), taskId]
                }) : null);
                
                // Sync first to ensure DB has latest stats before adding rewards
                PlayerService.syncPlayerStats(player.fid, player.totalXp, player.totalGold, player.highScore, player.totalRuns)
                  .then(() => PlayerService.completeTask(player.fid, taskId, 50000, 10000, 5))
                  .then(() => loadData());
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

  // Game interruption on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && status === GameStatus.PLAYING) {
           gameRef.current?.endGame();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [status]);

  const handleTaskClick = (taskId: string, url: string) => {
    if (player?.completedTasks?.includes(taskId)) return;
    
    if (taskId === 'neynar-notifications') {
       setShowNeynarGuide(true);
       return;
    }

    // Use SDK for native navigation
    sdk.actions.openUrl(url);

    // Start 10s verification timer immediately
    setTaskTimers(prev => ({ ...prev, [taskId]: { time: 10, focused: true } }));
  };

  const [neynarLoading, setNeynarLoading] = useState(false);
  const [debugRefresh, setDebugRefresh] = useState(0); // For forcing debug console updates

  const handleNeynarConfirm = useCallback(async () => {
    setNeynarLoading(true);
    try {
      // Attempt to add frame (enable notifications)
      const result = await sdk.actions.addFrame();
      
      if (result.added) {
         console.log("Frame added/Notifications enabled:", result.notificationDetails);
         // Immediate success if added
         setShowNeynarGuide(false);
         setTaskTimers(prev => ({ ...prev, ['neynar-notifications']: { time: 2, focused: true } })); 
      } else {
        // If result.added is false, it might be because:
        // 1. User rejected
        // 2. Already added (SDK might return false or error, behavior varies)
        // 3. Context invalid
        console.log("User declined or already added");
        
        // We will NOT auto-close here, we let the user click "I've done this" if they are stuck
        // But we stop loading
      }
    } catch (e) {
      console.error("Add Frame/Notification Error:", e);
      // If error, we stop loading and let user manually close/claim
    } finally {
      setNeynarLoading(false);
    }
  }, []);

  // Manual override for users who are stuck or already added
  const handleNeynarManualClose = () => {
    setShowNeynarGuide(false);
    // We assume if they are manually closing from this screen, they might have done it.
    // We trigger the timer to verify/claim.
    setTaskTimers(prev => ({ ...prev, ['neynar-notifications']: { time: 5, focused: true } }));
  };

  const [isStarting, setIsStarting] = useState(false);

  const handleStartGame = async () => {
    if (isStarting) return;
    
    // Check Ascents
    if (!player || (player.ascentsRemaining || 0) <= 0) {
      // Should not happen if button is correct, but safety check
      return;
    }

    setIsStarting(true);
    
    try {
      // Deduct Ascent on Backend
      const success = await PlayerService.startGameAttempt(player.fid);
      if (!success) {
        throw new Error("Failed to deduct ascent");
      }

      // Optimistic update
      setPlayer(prev => prev ? ({ ...prev, ascentsRemaining: prev.ascentsRemaining - 1 }) : null);

      playRandomTrack();
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

  const handleRechargeAscents = async () => {
    if (!player) return;
    setProcessingPayment(true);
    setPaymentError(null);
    setPaymentStatus(prev => ({ ...prev, recharge: 'loading' }));
    
    const safetyTimeout = setTimeout(() => {
      setProcessingPayment(false);
      setPaymentStatus(prev => ({ ...prev, recharge: 'idle' }));
      setPaymentError("Payment timed out");
    }, 15000);

    try {
      // @ts-ignore
      const payment = await pay({
        amount: '0.10',
        to: RECIPIENT_WALLET,
        testnet: true
      });
      const txId = payment?.id;

      // Optimistic update
      setPlayer({
        ...player,
        ascentsRemaining: (player.ascentsRemaining || 0) + 10
      });

      await PlayerService.rechargeAscents(player.fid, '0.10', txId || 'base-pay');
      await loadData();

      clearTimeout(safetyTimeout);
      setPaymentStatus(prev => ({ ...prev, recharge: 'success' }));
      setTimeout(() => setPaymentStatus(prev => ({ ...prev, recharge: 'idle' })), 1200);
    } catch (e: any) {
      console.error("Recharge Error:", e);
      setPaymentStatus(prev => ({ ...prev, recharge: 'error' }));
      setPaymentError(e?.message || 'Payment failed');
      setTimeout(() => {
        setPaymentStatus(prev => ({ ...prev, recharge: 'idle' }));
        setPaymentError(null);
      }, 1500);
    } finally {
      clearTimeout(safetyTimeout);
      setProcessingPayment(false);
    }
  };

  const handleShare = () => {
    const refId = player?.fid || player?.username;
    const url = `https://base-ascent.vercel.app/launch.html?ref=${refId}`;
    const text = "I'm climbing to the moon on Base Ascent! 🚀\n\nPlay now and get free upgrades:";
    
    // Use SDK to open native composer (Better than copy-paste)
    const intentUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;
    
    try {
      // @ts-ignore
      if (sdk.actions.composeCast) {
         // @ts-ignore
         sdk.actions.composeCast({ text, embeds: [url] });
      } else {
         sdk.actions.openUrl(intentUrl);
      }
    } catch (e) {
      console.error("Share error:", e);
      sdk.actions.openUrl(intentUrl);
    }
  };

  const handleCopy = () => {
    // User requested Username over FID for cleaner links
    // Use username if available, fallback to FID
    const refId = player?.username || player?.fid;
    
    // Updated to use the clean /r/ link format
    const url = `https://base-ascent.vercel.app/r/${refId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const [isClaiming, setIsClaiming] = useState(false);
  const [showClaimEffect, setShowClaimEffect] = useState(false);

  const [lastClaimedAmount, setLastClaimedAmount] = useState(0);

  const handleClaim = async () => {
    if (player && !isClaiming) {
      setLastClaimedAmount(passiveEarnings);
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

  const handlePurchaseUpgrade = async (type: UpgradeType) => {
    if (!player) return;
    const currentLevel = player.upgrades?.[type] || 0;
    const cost = getUpgradeCost(type, currentLevel);
    
    if (player.totalGold < cost) return;

    setProcessingPayment(true);
    try {
        // Optimistic update
        const newUpgrades = { ...player.upgrades, [type]: currentLevel + 1 };
        setPlayer({
            ...player,
            totalGold: player.totalGold - cost,
            upgrades: newUpgrades
        });

        await PlayerService.purchaseUpgrade(player.fid, type, cost);
        await loadData();
    } catch (e) {
        console.error("Purchase Error:", e);
        await loadData(); // Revert
        throw e; // Rethrow for UpgradesTab to handle
    } finally {
        setProcessingPayment(false);
    }
  };

  const handleUpgradeMiner = async (level: number) => {
    if (!player) return;
    
    // Safety check for levels
    if (level < 1 || level > 5) {
      console.error("Invalid level:", level);
      return;
    }
    
    setProcessingPayment(true);
    setPaymentError(null);
    setPaymentStatus(prev => ({ ...prev, miner: 'loading' }));
    
    const safetyTimeout = setTimeout(() => {
      setProcessingPayment(false);
      setPaymentStatus(prev => ({ ...prev, miner: 'idle' }));
      setPaymentError("Transaction timed out");
    }, 15000);
    
    // Calculate pending passive XP before upgrade
    const currentMiner = MINER_LEVELS[player.minerLevel] || MINER_LEVELS[0]; // Use current level for pending calc
    let newBankedXp = player.bankedPassiveXp || 0;
    
    if (player.minerLevel > 0 && currentMiner) {
      const now = new Date();
      const lastClaim = new Date(player.lastClaimAt);
      const hours = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
      const pending = Math.floor(hours * currentMiner.xpPerHour);
      newBankedXp += pending;
    }

    try {
      const nextMiner = MINER_LEVELS[level]; // Target level config
      if (!nextMiner) return;
      const cost = nextMiner.cost;

      // @ts-ignore
      const payment = await pay({
        amount: cost.toFixed(2),
        to: RECIPIENT_WALLET,
        testnet: true
      });
      const txId = payment?.id;

      // Optimistic Update
      setPlayer({
        ...player,
        minerLevel: level,
        bankedPassiveXp: newBankedXp,
        lastClaimAt: new Date()
      });

      await PlayerService.upgradeMiner(player.fid, level);
      await PlayerService.recordTransaction(player.fid, cost.toString(), 'miner_purchase', txId || 'base-pay', { miner_level: level });
      await loadData();
      
      clearTimeout(safetyTimeout);
      setPaymentStatus(prev => ({ ...prev, miner: 'success' }));
      setTimeout(() => setPaymentStatus(prev => ({ ...prev, miner: 'idle' })), 1500);
    } catch (e: any) {
      console.error("Miner Upgrade Error:", e);
      setPaymentStatus(prev => ({ ...prev, miner: 'error' }));
      setPaymentError(e?.message || 'Payment failed');
      setTimeout(() => {
        setPaymentStatus(prev => ({ ...prev, miner: 'idle' }));
        setPaymentError(null);
      }, 1000);
    } finally {
      clearTimeout(safetyTimeout);
      setProcessingPayment(false);
    }
  };

  const handleFlex = async () => {
    if (!player) return;
    const type = rankingType === 'skill' ? 'altitude' : 'xp';
    const hasUsedFree = type === 'altitude' ? player.hasUsedAltitudeFlex : player.hasUsedXpFlex;
    
    setProcessingPayment(true);
    setPaymentError(null);
    setPaymentStatus(prev => ({ ...prev, flex: 'loading' }));
    const safetyTimeout = setTimeout(() => {
        setProcessingPayment(false);
        setPaymentStatus(prev => ({ ...prev, flex: 'idle' }));
        setPaymentError("Transaction timed out");
    }, 15000);

    try {
      let hash = 'free';
      if (!hasUsedFree) {
        await PlayerService.syncPlayerStats(player.fid, player.totalXp, player.totalGold, player.highScore, player.totalRuns);
        if (type === 'altitude') {
          await PlayerService.syncAltitude(player.fid);
        } else {
          await PlayerService.syncXp(player.fid);
        }
        await PlayerService.recordTransaction(player.fid, '0', `${type}_flex_free`, 'free', { flex_type: type });
      } else {
        // @ts-ignore
        const payment = await pay({
          amount: '0.10',
          to: RECIPIENT_WALLET,
          testnet: true
        });
        hash = payment?.id;

        await PlayerService.syncPlayerStats(player.fid, player.totalXp, player.totalGold, player.highScore, player.totalRuns);
        if (type === 'altitude') {
          await PlayerService.syncAltitude(player.fid);
        } else {
          await PlayerService.syncXp(player.fid);
        }
        await PlayerService.recordTransaction(player.fid, '0.10', `${type}_flex_paid`, hash, { flex_type: type });
      }
      await loadData();
      setPaymentStatus(prev => ({ ...prev, flex: 'success' }));
      setTimeout(() => setPaymentStatus(prev => ({ ...prev, flex: 'idle' })), 1200);
    } catch (e: any) {
      console.error("Flex/Payment Error:", e);
      const msg = e.message || "Transaction failed. Please try again.";
      setPaymentStatus(prev => ({ ...prev, flex: 'error' }));
      setPaymentError(msg);
      setTimeout(() => {
        setPaymentStatus(prev => ({ ...prev, flex: 'idle' }));
        setPaymentError(null);
      }, 1500);
    } finally {
      clearTimeout(safetyTimeout);
      setProcessingPayment(false);
    }
  };

  const handleGameOver = useCallback(async (score: number, xp: number, gold: number) => {
    stopAudio();
    const isNewHighScore = player ? score > player.highScore : false;
    setGameOverData({ score, xp, gold, isNewHighScore, hasDoubled: false });
    if (player) {
      // Update local state
      const updatedPlayer = {
        ...player,
        totalXp: player.totalXp + xp,
        totalGold: player.totalGold + gold, // FIX: Credit Gold correctly
        highScore: Math.max(player.highScore, score),
        totalRuns: player.totalRuns + 1
      };
      setPlayer(updatedPlayer);

      // Save to localStorage for persistence across sessions
      localStorage.setItem(`player_stats_v2_${player.fid}`, JSON.stringify({
        highScore: updatedPlayer.highScore,
        totalXp: updatedPlayer.totalXp,
        totalGold: updatedPlayer.totalGold, // Persist Gold too
        totalRuns: updatedPlayer.totalRuns,
        resetToken: player.resetToken // Preserve reset token
      }));
      
      // Auto-save run count to DB in background (best effort)
      PlayerService.syncPlayerStats(player.fid, updatedPlayer.totalXp, updatedPlayer.totalGold, updatedPlayer.highScore, updatedPlayer.totalRuns).catch(console.error);
    }
    setStatus(GameStatus.GAMEOVER);
  }, [player, stopAudio]);

  const handlePlayAgain = () => {
    handleStartGame();
  };

  const handleGoHome = () => {
    setStatus(GameStatus.IDLE);
    setGameOverData(null);
    setActiveTab(Tab.ASCENT);
  };

  const currentMiner = MINER_LEVELS[player?.minerLevel || 0] || MINER_LEVELS[0];
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
    // Do NOT clear leaderboard immediately. Keep stale data until new data loads.
    setIsLeaderboardLoading(true);
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

  const [showConfetti, setShowConfetti] = useState(false); // Deprecated, but keeping var for cleanup if needed, will replace logic
  const [showDoubleSuccess, setShowDoubleSuccess] = useState(false);

  const handleDoubleUp = async () => {
    if (!gameOverData || !player || showDoubleSuccess) return;
    
    // REMOVED: Incorrect check that blocked execution because player.highScore was already updated
    // if (gameOverData.score <= player.highScore) return;

    setProcessingPayment(true);
    setPaymentError(null);
    setPaymentStatus(prev => ({ ...prev, double: 'loading' }));
    const safetyTimeout = setTimeout(() => {
      setProcessingPayment(false);
      setPaymentStatus(prev => ({ ...prev, double: 'idle' }));
      setPaymentError("Transaction timed out");
    }, 15000);
    try {
       // @ts-ignore
       const payment = await pay({
          amount: '0.10',
          to: RECIPIENT_WALLET,
          testnet: true
       });
       const txId = payment?.id;
       
       await PlayerService.doubleUpRun(
         player.fid, 
         gameOverData.score, 
         gameOverData.xp, 
         gameOverData.gold, 
         txId || 'base-pay', 
         0.10
       );
       
       clearTimeout(safetyTimeout);
       
       setGameOverData({
         ...gameOverData,
         score: gameOverData.score * 2,
         xp: gameOverData.xp * 2,
         gold: gameOverData.gold * 2,
         hasDoubled: true
       });
       
       await loadData();
       setPaymentStatus(prev => ({ ...prev, double: 'success' }));
       setShowDoubleSuccess(true);
       
    } catch (e: any) {
      console.error(e);
      setPaymentStatus(prev => ({ ...prev, double: 'error' }));
      setPaymentError(e?.message || 'Double up failed');
      setTimeout(() => {
        setPaymentStatus(prev => ({ ...prev, double: 'idle' }));
        setPaymentError(null);
      }, 1000);
    } finally {
      clearTimeout(safetyTimeout);
      setProcessingPayment(false);
    }
  };

  if (loading || isFarcasterLoading) return <LoadingScreen />;

  // Error State if Player fails to load
  if (!player) {
    return (
      <div className="h-[100dvh] bg-black text-white font-mono flex flex-col items-center justify-center p-8 text-center">
        <div className="text-red-500 font-bold text-xl mb-4">CONNECTION ERROR</div>
        <p className="opacity-60 mb-8">Could not load player profile. The database might be resetting or your connection is unstable.</p>
        <button onClick={() => window.location.reload()} className="px-6 py-3 bg-white text-black font-black rounded-xl uppercase">Retry</button>
      </div>
    );
  }

  return (
    // Outer Wrapper - Mobile Simulator Container
      <div className="h-[100dvh] bg-black flex justify-center text-white font-sans">
      {/* Inner App Container */}
      <div className="w-full max-w-[480px] h-[100dvh] relative bg-black shadow-2xl flex flex-col">
      
      {/* Header - Always on top */}
      <header className="w-full max-w-[480px] px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex justify-between items-center border-b border-white/10 bg-black/80 backdrop-blur-sm shrink-0 z-20 fixed top-0 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-3">
          <img src={player?.pfpUrl || "https://picsum.photos/40/40"} className="w-10 h-10 rounded-full border border-white/20" alt="" />
          <div>
            <div className="text-sm font-bold">@{player?.username?.replace(/\.base\.eth$/, '')}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold">${usdcBalanceFormatted} USDC</div>
        </div>
      </header>

      {/* Main Content Area - Scrollable Container for Tabs */}
      <main className={`absolute inset-x-0 flex flex-col z-10 ${(activeTab === Tab.ASCENT || activeTab === Tab.RANKINGS) ? 'overflow-hidden' : 'overflow-y-auto'} custom-scrollbar overscroll-none bg-black`} style={{ top: 'calc(74px + env(safe-area-inset-top))', bottom: 'calc(90px + env(safe-area-inset-bottom))' }}>
        <div className={`w-full ${(activeTab === Tab.ASCENT || activeTab === Tab.RANKINGS) ? 'h-full' : 'min-h-full'} flex flex-col relative ${activeTab === Tab.ASCENT ? 'pb-0' : 'pb-8'}`}>
          
          <ParticleBackground />

          <div className="flex-1 flex flex-col relative w-full h-full" key={activeTab}>
            {activeTab === Tab.ASCENT ? (
              <div className="flex flex-col items-center w-full h-full pb-4 px-4">
                {status === GameStatus.PLAYING ? (
                  <>
                    <div className="w-full max-w-[340px] flex-1 min-h-0 bg-black rounded-3xl overflow-hidden border-[3px] border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.05)] relative ring-1 ring-white/10 z-10 mt-2 mb-2 select-none touch-none">
                      <GameEngine 
                        ref={gameRef}
                        isActive={true} 
                        onGameOver={handleGameOver} 
                        multiplier={currentMiner.multiplier}
                        upgrades={player.upgrades}
                        xpRef={sessionXpRef}
                        goldRef={sessionGoldRef}
                      />
                    </div>
                    
                    {/* Session Stats - Unobtrusive */}
                    <div className="w-full max-w-[340px] grid grid-cols-2 gap-3 z-10 shrink-0">
                       <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-3 flex flex-col items-center justify-center">
                          <div className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">XP Earned</div>
                          <div ref={sessionXpRef} className="text-xl font-black italic text-green-400 leading-none">+0 XP</div>
                       </div>
                       <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-3 flex flex-col items-center justify-center">
                          <div className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Gold Earned</div>
                          <div ref={sessionGoldRef} className="text-xl font-black italic text-yellow-400 leading-none">+0 GOLD</div>
                       </div>
                    </div>

                  </>
                ) : status === GameStatus.GAMEOVER && gameOverData ? (
                  <div className="w-full h-full min-h-0">
                    <GameOver 
                      score={gameOverData.score}
                      xpGained={gameOverData.xp}
                      goldGained={gameOverData.gold}
                      isHighScore={gameOverData.isNewHighScore}
                      onPlayAgain={handlePlayAgain}
                      onGoHome={handleGoHome}
                      onDoubleUp={handleDoubleUp}
                      isProcessing={processingPayment}
                      doubleUpStatus={paymentStatus.double}
                      ascentsRemaining={player?.ascentsRemaining}
                      onRefill={handleRechargeAscents}
                      hasDoubled={gameOverData.hasDoubled}
                    />
                    {showDoubleSuccess && gameOverData && (
                      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center animate-in fade-in duration-300">
                         {/* Overlay Background */}
                         <div className="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
                         
                         {/* Content */}
                         <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-[320px] p-8 text-center animate-in zoom-in-95 duration-300">
                            
                            {/* Title */}
                            <div className="text-6xl font-black text-[#FFD700] italic uppercase tracking-tighter drop-shadow-[0_0_30px_rgba(255,215,0,0.5)] scale-110 mb-4 animate-bounce">
                               DOUBLED!
                            </div>

                            {/* Stats */}
                            <div className="flex flex-col gap-4 w-full">
                               <div className="bg-white/10 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                                  <div className="text-[10px] opacity-60 uppercase font-bold tracking-widest mb-1">New Altitude</div>
                                  <div className="text-4xl font-black italic">{gameOverData.score}m</div>
                               </div>
                               
                               <div className="grid grid-cols-2 gap-4">
                                  <div className="bg-white/10 border border-white/10 rounded-2xl p-3 backdrop-blur-md">
                                    <div className="text-[9px] opacity-60 uppercase font-bold tracking-widest mb-1">XP Earned</div>
                                    <div className="text-2xl font-black italic text-purple-400">+{gameOverData.xp}</div>
                                  </div>
                                  <div className="bg-white/10 border border-white/10 rounded-2xl p-3 backdrop-blur-md">
                                    <div className="text-[9px] opacity-60 uppercase font-bold tracking-widest mb-1">Gold Earned</div>
                                    <div className="text-2xl font-black italic text-yellow-400">+{gameOverData.gold}</div>
                                  </div>
                               </div>
                            </div>

                            {/* Continue Button */}
                            <button 
                              onClick={() => {
                                setShowDoubleSuccess(false);
                                setPaymentStatus(prev => ({ ...prev, double: 'idle' }));
                              }}
                              className="w-full py-5 mt-4 bg-white text-black font-black text-xl uppercase rounded-[2rem] shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-95 transition-all"
                            >
                              Continue
                            </button>
                         </div>
                      </div>
                    )}
                  </div>
                ) : status === GameStatus.IDLE ? (
                  <div className="flex-1 flex flex-col items-center text-center w-full px-5 py-4 h-full justify-between overflow-hidden">
                     <div className="flex flex-col items-center justify-center z-10 w-full px-2 flex-shrink min-h-0">
                      <div className="w-full h-auto max-h-[25vh] aspect-square flex items-center justify-center animate-pulse duration-[2000ms]">
                         <img src={LOGO_URL} className="max-w-full max-h-full object-contain scale-[1.5]" alt="ASCENT" />
                      </div>
                      <p className="text-[10px] opacity-40 uppercase tracking-[0.4em] font-black mt-4">ASCEND TO NEW HEIGHTS</p>
                    </div>
                    <div className="flex flex-col items-center w-full shrink-0 gap-4 pb-4">
                       
                      {/* Ascents Counter */}
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[10px] font-bold text-white/60 tracking-widest uppercase">Ascents Available</span>
                        <span className={`text-4xl font-black ${player?.ascentsRemaining === 0 ? 'text-red-500' : 'text-white'} drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-colors duration-300`}>
                          {player?.ascentsRemaining ?? 0}
                        </span>
                      </div>

                      <button 
                        onClick={() => { 
                          if ((player?.ascentsRemaining || 0) > 0) {
                            handleStartGame();
                          } else {
                            handleRechargeAscents();
                          }
                        }} 
                        disabled={isPending || isStarting || processingPayment || loading} 
                        className={`w-full max-w-[280px] py-5 border-[3px] 
                          ${(player?.ascentsRemaining || 0) > 0 
                            ? "border-white bg-white text-black" 
                            : "border-[#FFD700] bg-[#FFD700] text-black shadow-[0_0_30px_rgba(255,215,0,0.6)] animate-pulse"} 
                          font-black text-sm uppercase tracking-tight rounded-[2.5rem] active:scale-95 transition-all disabled:opacity-50 
                          ${(player?.ascentsRemaining || 0) > 0 ? "shadow-[0_0_30px_rgba(255,255,255,0.3)]" : ""}`}
                      >
                        {loading ? 'LOADING...' : 
                         isPending ? 'SYNCING...' : 
                         processingPayment ? 'PROCESSING...' :
                         (player?.ascentsRemaining || 0) > 0 ? 'Tap to Start (-1 Ascent)' : 'RECHARGE (+10) - $0.10'}
                      </button>

                      {paymentError && (
                        <div className="text-red-400 text-[10px] font-bold animate-pulse mt-[-8px]">
                          {paymentError}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4 w-full max-w-[280px]">
                        <div className="p-3 bg-white/5 border border-white/10 rounded-[1.5rem] flex flex-col items-center backdrop-blur-md">
                          <div className="text-[8px] opacity-30 uppercase font-black">Miner Level</div>
                          <div className="text-lg font-black italic">LVL {player?.minerLevel || 0}</div>
                        </div>
                        <div className="p-3 bg-white/5 border border-white/10 rounded-[1.5rem] flex flex-col items-center backdrop-blur-md">
                          <div className="text-[8px] opacity-30 uppercase font-black">High Score</div>
                          <div className="text-lg font-black italic">{player?.highScore || 0} m</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : <div className="flex-1 flex flex-col items-center justify-center"><div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div></div>}
              </div>
            ) : activeTab === Tab.UPGRADES ? (
              <UpgradesTab 
                player={player} 
                onPurchase={handlePurchaseUpgrade} 
                isProcessing={processingPayment} 
              />
            ) : activeTab === Tab.HARDWARE ? (
              <div className="flex-1 flex flex-col gap-6 items-center pb-10 p-5 w-full">
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
                    <button onClick={() => handleUpgradeMiner(1)} disabled={processingPayment} className="w-full py-6 bg-white text-black font-black text-xl uppercase rounded-3xl active:scale-95 transition-all disabled:opacity-50">
                      {paymentStatus.miner === 'loading' ? 'Processing...' : paymentStatus.miner === 'success' ? 'Success' : paymentStatus.miner === 'error' ? 'Failed' : 'Unlock Miner ($0.99)'}
                    </button>
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
                      <div className={`text-4xl font-black italic text-center tracking-tighter transition-all duration-300 ${showClaimEffect ? 'scale-110' : 'text-white'}`}>+{showClaimEffect ? lastClaimedAmount : passiveEarnings}</div>
                      <div className="text-xs font-bold uppercase opacity-30">XP Generated</div>
                      <button 
                        onClick={handleClaim} 
                        disabled={passiveEarnings === 0 || isClaiming} 
                        className={`mt-auto w-full py-4 font-black text-lg rounded-2xl active:scale-95 disabled:opacity-20 transition-all uppercase ${showClaimEffect ? 'bg-green-400 text-black' : 'bg-white text-black'}`}
                      >
                        {isClaiming ? 'Claiming...' : showClaimEffect ? 'Success!' : 'Claim to Wallet'}
                      </button>
                    </div>

                    <div className="w-full">
                      {nextMiner ? (
                        <button onClick={() => handleUpgradeMiner(player.minerLevel + 1)} disabled={processingPayment} className="w-full py-5 border-2 border-white font-black text-lg hover:bg-white hover:text-black transition-all rounded-3xl disabled:opacity-50 uppercase">
                          {paymentStatus.miner === 'loading' ? 'Processing...' : paymentStatus.miner === 'success' ? 'Success' : paymentStatus.miner === 'error' ? 'Failed' : `Upgrade to Lvl ${player.minerLevel + 1} • $${nextMiner.cost.toFixed(2)}`}
                        </button>
                      ) : (
                        <div className="py-5 border-2 border-dashed border-white/20 text-center opacity-30 font-black rounded-3xl uppercase">Max Level Reached</div>
                      )}
                    </div>
                    {paymentStatus.miner === 'error' && paymentError && (
                      <div className="text-[9px] font-bold uppercase text-red-400 px-2">{paymentError}</div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : activeTab === Tab.RANKINGS ? (
            <div className="flex flex-col w-full h-full relative">
               {/* Scrollable List Wrapper */}
               <div className="flex-1 relative min-h-0">
                   <div className="h-full overflow-y-auto pb-6 custom-scrollbar px-4 pt-6 space-y-4">
                       
                       {/* Header & Controls */}
                       <div className="flex justify-between items-center w-full shrink-0">
                          <h2 className="text-3xl font-black italic uppercase tracking-tighter">{rankingType === 'skill' ? 'Altitude' : 'Experience'}</h2>
                          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 gap-1 shrink-0">
                              <button onClick={() => handleRankingChange('skill')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg ${rankingType === 'skill' ? 'bg-white text-black' : 'opacity-40'}`}>Altitude</button>
                              <button onClick={() => handleRankingChange('grind')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg ${rankingType === 'grind' ? 'bg-white text-black' : 'opacity-40'}`}>Experience</button>
                          </div>
                       </div>

                       {/* Airdrop Status */}
                       <div className="shrink-0 px-4 py-3 border border-white/10 bg-white/5 rounded-3xl space-y-2 text-left">
                          <div className="flex justify-between items-center mb-1">
                             <div className="text-[9px] opacity-40 font-black uppercase tracking-widest">Airdrop Pool Status</div>
                             <div className="text-[9px] font-black uppercase text-green-400">{Math.min(100, (globalRevenue / 2000) * 100).toFixed(1)}% FILLED</div>
                          </div>
                          <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden border border-white/5">
                             <div 
                                className="h-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-1000 ease-out"
                                style={{ width: `${Math.min(100, (globalRevenue / 2000) * 100)}%` }}
                             ></div>
                          </div>
                       </div>

                       {/* Rules */}
                       <div className="shrink-0 px-4 py-3 border border-white/10 bg-white/5 rounded-3xl space-y-2 text-left">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-white"></div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest opacity-80">LEADERBOARD RULES</h3>
                          </div>
                          <p className="text-[9px] leading-relaxed opacity-40 uppercase font-bold">
                            {rankingType === 'skill' 
                              ? "This leaderboard is strictly for those who want to prove their skill. It ranks players based on their highest single-run score. Focus on precision and survival to climb the rankings. The Top 20 players will be rewarded when the Airdrop Rewards Pool is full."
                              : "This leaderboard rewards dedication and consistent play. It tracks your Total XP, which is a combination of your gameplay, active referrals, and earnings from your AutoMiner. Every action you take in the game builds this score over time. The Top 20 players will be rewarded when the Airdrop Rewards Pool is full."
                            }
                          </p>
                       </div>

                       {/* List */}
                       <div className="space-y-2 pb-4">
                          {isLeaderboardLoading ? (
                            <div className="flex flex-col items-center justify-center py-10 opacity-50">
                              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mb-2"></div>
                              <div className="text-[10px] font-black uppercase tracking-widest">LOADING RANKS...</div>
                            </div>
                          ) : leaderboard.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 opacity-30">
                              <div className="text-[10px] font-black uppercase tracking-widest">NO RECORDS YET</div>
                            </div>
                          ) : (
                            leaderboard.map((entry, idx) => (
                              <div key={entry.fid} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                                <div className="flex items-center gap-4">
                                  <span className="text-[10px] font-black opacity-30">{idx + 1}</span>
                                  <img src={entry.pfpUrl || `https://picsum.photos/seed/${entry.fid}/32/32`} className="w-8 h-8 rounded-full opacity-60 border border-white/10" alt="" />
                                  <div className="text-sm font-bold">@{entry.username?.replace(/\.base\.eth$/, '')}</div>
                                </div>
                                <div className="text-lg font-black italic">{rankingType === 'skill' ? entry.highScore : entry.totalXp.toLocaleString()}</div>
                              </div>
                            ))
                          )}
                       </div>
                   </div>
                   {/* Fade Effect */}
                   <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-black to-transparent pointer-events-none z-10"></div>
               </div>

               {/* Your Rank (Sticky) */}
               <div className="shrink-0 p-4 bg-black z-20 relative border-t border-white/10">
                  <div className="p-4 border border-white/10 bg-white/5 rounded-3xl space-y-4">
                      <div className="flex justify-between items-center px-2">
                         <div className="text-[10px] opacity-40 font-black uppercase tracking-widest">Your Rank</div>
                         <div className="flex items-center gap-3">
                            <span className={`text-[9px] font-bold uppercase ${syncStatus === 'SYNCED' ? 'text-green-400' : 'text-yellow-400'}`}>{syncStatus}</span>
                            <div className="text-[14px] font-black italic font-mono uppercase">#{playerRank > 0 ? playerRank : '-'} | {rankingType === 'skill' ? player?.highScore : player?.totalXp} {rankingType === 'skill' ? 'm' : 'XP'}</div>
                         </div>
                      </div>
                      <button onClick={handleFlex} disabled={processingPayment} className="w-full py-4 border-2 border-white bg-black active:bg-white active:text-black transition-all font-black text-sm uppercase rounded-2xl active:scale-95 disabled:opacity-50">
                        {paymentStatus.flex === 'loading' ? 'Processing...' : paymentStatus.flex === 'success' ? 'Synced' : paymentStatus.flex === 'error' ? 'Failed' : (
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
                      {paymentStatus.flex === 'error' && paymentError && (
                        <div className="text-[9px] font-bold uppercase text-red-400 px-2">{paymentError}</div>
                      )}
                  </div>
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-3 pr-1 pb-10 mt-6 items-center w-full">
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
                  {player?.referrerUsername && (
                    <div className="text-[9px] text-center font-bold text-green-400 mb-4 uppercase tracking-wider animate-in fade-in slide-in-from-top-2">
                       Referred by @{player.referrerUsername}
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-black/50 border border-white/10 p-4 rounded-[28px] text-center mb-3">
                    <div className="w-1/2"><span className="text-[9px] opacity-30 block uppercase font-bold">Referrals</span><span className="text-2xl font-black italic">{player?.referralCount || 0}</span></div>
                    <div className="w-1/2 border-l border-white/10"><span className="text-[9px] opacity-30 block uppercase font-bold">Referral XP</span><span className="text-xl font-black italic">{player?.referralXpEarned || 0} XP</span></div>
                  </div>
                  <div onClick={handleCopy} className="p-4 bg-white/5 border border-white/20 rounded-2xl text-[9px] opacity-40 text-center tracking-widest uppercase cursor-pointer hover:bg-white/10 transition-all active:scale-98">
                    {copied ? 'COPIED!' : `base-ascent.vercel.app/r/${player?.username || player?.fid}`}
                  </div>
                  <p className="text-[8px] opacity-30 text-center mt-2 italic px-4 uppercase font-bold">You earn 20% of all XP generated by your recruits hardware automatically.</p>
               </div>
               <div className="w-full p-6 border border-white/10 bg-white/5 rounded-[40px]">
                  <h3 className="text-2xl font-black italic opacity-40 text-center mb-5 tracking-widest">TASKS</h3>
                  <div className="space-y-3">
                     {[
                       { id: 'f-gabe', l: 'Follow gabe on Base', u: 'https://base.app/profile/gabexbt' },
                       { id: 'f-x', l: 'Follow gabe on X', u: 'https://x.com/gabexbt' },
                       { id: 'post-interaction', l: 'Engagement Booster', u: 'https://warpcast.com/gabexbt/0x892a0' },
                       { id: 'neynar-notifications', l: 'Pin App & Enable Notifications', u: '#' }
                     ].map(t => (
                        <div key={t.id} className="w-full p-4 border border-white/10 rounded-[28px] flex items-center justify-between bg-black/50">
                           <div className="text-left"><div className="text-[10px] font-black uppercase">{t.l}</div><div className="text-[8px] opacity-40">+50K XP • 10K GOLD • 5 SPINS</div></div>
                           <button onClick={() => handleTaskClick(t.id, t.u)} disabled={player?.completedTasks?.includes(t.id) || (taskTimers[t.id]?.time > 0)} className="text-[9px] font-black italic border border-white/20 px-3 py-1.5 rounded-xl active:scale-95 disabled:opacity-50 transition-all min-w-[100px]">
                              {player?.completedTasks?.includes(t.id) ? 'DONE' : taskTimers[t.id]?.time > 0 ? `VERIFYING (${taskTimers[t.id]?.time}s)` : 'COMPLETE TASK'}
                           </button>
                        </div>
                     ))}
                  </div>
               </div>

               {/* Mobile Debug Console - Remove or set DEBUG=false before public launch */}
               <div className="w-full p-6 border border-white/10 bg-white/5 rounded-[40px] mt-4">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <h3 className="text-[10px] font-black uppercase opacity-30 tracking-widest">DEBUG CONSOLE</h3>
                    <button 
                      onClick={() => setDebugRefresh(prev => prev + 1)}
                      className="text-[9px] font-bold bg-white/10 px-2 py-1 rounded-lg active:scale-95"
                    >
                      REFRESH
                    </button>
                  </div>
                  <div className="bg-black/50 p-4 rounded-xl font-mono text-[9px] text-green-400 h-32 overflow-y-auto space-y-1 border border-white/5">
                    {PlayerService.logs.length === 0 ? (
                      <div className="opacity-30 italic text-center py-4">No logs yet...</div>
                    ) : (
                      PlayerService.logs.map((log, i) => (
                        <div key={i} className="break-all border-b border-white/5 pb-1 last:border-0">{log}</div>
                      ))
                    )}
                  </div>
                  <div className="text-[8px] opacity-30 text-center mt-2">Screenshots of this help debug referral issues.</div>
               </div>
            </div>
          )}
        </div>
      </div>
      </main>

      {/* Bottom Navigation - Fixed */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] flex justify-around items-center px-6 py-4 bg-black/95 backdrop-blur-md border-t border-white/10 shrink-0 z-50 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
        <button onClick={() => setActiveTab(Tab.ASCENT)} className={`flex flex-col items-center gap-1.5 transition-all p-2 rounded-xl ${activeTab === Tab.ASCENT ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/70'}`}>
          <Icons.Ascent />
          <span className="text-[9px] font-black uppercase tracking-widest">Ascent</span>
        </button>
        <button onClick={() => setActiveTab(Tab.UPGRADES)} className={`flex flex-col items-center gap-1.5 transition-all p-2 rounded-xl ${activeTab === Tab.UPGRADES ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/70'}`}>
          <Icons.Upgrades />
          <span className="text-[9px] font-black uppercase tracking-widest">Armory</span>
        </button>
        <button onClick={() => setActiveTab(Tab.HARDWARE)} className={`flex flex-col items-center gap-1.5 transition-all p-2 rounded-xl ${activeTab === Tab.HARDWARE ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/70'}`}>
          <Icons.Hardware />
          <span className="text-[9px] font-black uppercase tracking-widest">Miner</span>
        </button>
        <button onClick={() => setActiveTab(Tab.RANKINGS)} className={`flex flex-col items-center gap-1.5 transition-all p-2 rounded-xl ${activeTab === Tab.RANKINGS ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/70'}`}>
          <Icons.Ranking />
          <span className="text-[9px] font-black uppercase tracking-widest">Ranks</span>
        </button>
        <button onClick={() => setActiveTab(Tab.PROFILE)} className={`flex flex-col items-center gap-1.5 transition-all p-2 rounded-xl ${activeTab === Tab.PROFILE ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/70'}`}>
          <Icons.Profile />
          <span className="text-[9px] font-black uppercase tracking-widest">Profile</span>
        </button>
      </nav>

      {showNeynarGuide && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-[320px] bg-[#1a1a1a] rounded-[24px] p-6 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
             <div className="w-12 h-12 mx-auto mb-4 bg-white rounded-xl flex items-center justify-center">
               <img src="/icon.png" alt="App Icon" className="w-12 h-12 rounded-xl" onError={(e) => e.currentTarget.style.display = 'none'} />
               <span className="text-black text-2xl" style={{ display: 'none' }}>🚀</span>
             </div>
             
             <h3 className="text-lg font-bold text-white mb-2">Add Base Ascent to Base</h3>
             
             <div className="space-y-3 mb-6">
                <div className="bg-[#2a2a2a] p-3 rounded-xl flex items-center gap-3 text-left">
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white shrink-0"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                   <div>
                     <div className="text-[13px] font-semibold text-white">Add to pinned apps</div>
                     <div className="text-[10px] text-gray-400">Find this app in Pinned Apps on Home</div>
                   </div>
                </div>
                
                <div className="bg-[#2a2a2a] p-3 rounded-xl flex items-center gap-3 text-left">
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white shrink-0"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                   <div>
                     <div className="text-[13px] font-semibold text-white">Enable notifications</div>
                     <div className="text-[10px] text-gray-400">We will send you notifs about this mini app</div>
                   </div>
                </div>
             </div>

             <div className="flex gap-3">
                 <button 
                   onClick={handleNeynarManualClose} 
                   className="flex-1 py-3 text-[13px] font-semibold bg-[#2a2a2a] text-white rounded-xl active:scale-95 transition-all"
                 >
                   I've done this
                 </button>
                 <button 
                   onClick={handleNeynarConfirm} 
                   disabled={neynarLoading}
                   className="flex-1 py-3 text-[13px] font-semibold bg-white text-black rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2"
                 >
                   {neynarLoading ? (
                     <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                   ) : 'Add'}
                 </button>
               </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

import { Providers } from './Providers';

const App: React.FC = () => (
  <Providers>
    <FarcasterProvider>
      <MainApp />
    </FarcasterProvider>
  </Providers>
);
export default App;
