import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http, useAccount, useReadContract } from 'wagmi';
import { baseSepolia } from 'viem/chains';
import { formatUnits, erc20Abi } from 'viem';
import { coinbaseWallet } from 'wagmi/connectors';
import GameEngine from './components/GameEngine';
import LoadingScreen from './components/LoadingScreen';
import { PaymentModal } from './components/PaymentModal';
import { FarcasterProvider, useFarcaster } from './context/FarcasterContext';
import { useCasterContract } from './hooks/useCasterContract';
import { GameStatus, Player, LeaderboardEntry, Tab } from './types';
import { LOGO_URL, MINER_LEVELS, USDC_BASE_ADDRESS } from './constants';
import { PlayerService } from './services/playerService';

const config = createConfig({
  chains: [baseSepolia],
  connectors: [coinbaseWallet({ appName: 'Base Ascent' })],
  transports: { [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://sepolia.base.org') },
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

const MainApp: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.ASCENT);
  const [status, setStatus] = useState<GameStatus>(GameStatus.IDLE);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerRank, setPlayerRank] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [rankingType, setRankingType] = useState<'skill' | 'grind'>('skill');
  const [taskTimers, setTaskTimers] = useState<Record<string, { time: number, focused: boolean }>>({});
  const [copied, setCopied] = useState(false);
  const [uploadingScore, setUploadingScore] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<'miner' | 'flex' | null>(null);
  const [minerUpgradeLevel, setMinerUpgradeLevel] = useState<number>(0);
  const [flexType, setFlexType] = useState<'altitude' | 'xp'>('altitude');

  const { frameContext, isLoading: isFarcasterLoading } = useFarcaster();
  const { address } = useAccount();
  const { payStartFee, paySubmitFee, isPending } = useCasterContract();

  const { data: usdcBalanceValue } = useReadContract({
    address: USDC_BASE_ADDRESS as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  const usdcBalanceFormatted = useMemo(() => {
    if (typeof usdcBalanceValue === 'bigint') return Number(formatUnits(usdcBalanceValue, 6)).toFixed(2);
    return "0.00";
  }, [usdcBalanceValue]);

  const loadData = useCallback(async () => {
    try {
      let fid = frameContext.user.fid || 12345;
      let username = frameContext.user.username || 'player.eth';
      let pfpUrl = frameContext.user.pfpUrl || '';
      let referrer = frameContext.referrerFid;

      const data = await PlayerService.getPlayer(fid, username, pfpUrl, referrer);
      setPlayer(data);
      const board = await PlayerService.getLeaderboard(15);
      setLeaderboard(board);
    } catch (e) {
      console.error("Load Error:", e);
    }
  }, [frameContext]);

  useEffect(() => { loadData().then(() => setTimeout(() => setLoading(false), 3000)); }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTaskTimers(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(taskId => {
          if (next[taskId].time > 0 && document.visibilityState === 'visible') {
            next[taskId].time -= 1;
            changed = true;
            if (next[taskId].time === 0) {
              delete next[taskId];
            }
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [player, loadData]);

  const handleTaskClick = (taskId: string, url: string) => {
    window.open(url, '_blank');
    setTaskTimers(prev => ({ ...prev, [taskId]: { time: 10, focused: true } }));
  };

  const handleStartGame = async () => {
    try {
      setStatus(GameStatus.PAYING);
      await payStartFee();
      setStatus(GameStatus.PLAYING);
    } catch (e) { setStatus(GameStatus.IDLE); }
  };

  const handleCopy = () => {
    const url = `https://base-ascent.vercel.app/r/${player?.fid}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleClaim = async () => {
    if (player) {
      await PlayerService.claimPassiveXp(player.fid);
      await loadData();
    }
  };

  const handleUpgradeMiner = async (level: number) => {
    if (!player) return;
    setMinerUpgradeLevel(level);
    setPaymentType('miner');
    setPaymentModalOpen(true);
  };

  const handleUploadHighScore = async () => {
    if (!player) return;
    setFlexType(rankingType === 'skill' ? 'altitude' : 'xp');
    setPaymentType('flex');
    setPaymentModalOpen(true);
  };

  const handlePaymentSuccess = async (txHash: string) => {
    if (!player) return;
    await loadData();
    setPaymentModalOpen(false);
  };

  const currentMiner = MINER_LEVELS[player?.minerLevel || 0];
  const nextMiner = player && player.minerLevel < 5 ? MINER_LEVELS[player.minerLevel + 1] : null;

  const passiveEarnings = useMemo(() => {
    if (!player || player.minerLevel === 0) return 0;
    const hours = (Date.now() - player.lastClaimAt) / 3600000;
    return Math.floor(hours * currentMiner.xpPerHour);
  }, [player, currentMiner]);

  if (loading || isFarcasterLoading) return <LoadingScreen />;

  return (
    <div className="h-screen bg-black text-white font-mono flex flex-col items-center overflow-hidden antialiased select-none">
      <PaymentModal
        isOpen={paymentModalOpen}
        type={paymentType}
        level={minerUpgradeLevel}
        flexType={flexType}
        fid={player?.fid}
        walletAddress={frameContext.user.walletAddress || address}
        onClose={() => {
          setPaymentModalOpen(false);
          setPaymentType(null);
        }}
        onSuccess={handlePaymentSuccess}
      />
      <header className="w-full max-w-md px-6 py-4 flex justify-between items-center border-b border-white/10 bg-black shrink-0 z-20">
        <div className="flex items-center gap-3">
          <img src={player?.pfpUrl || "https://picsum.photos/40/40"} className="w-10 h-10 rounded-full border border-white/20" alt="" />
          <div>
            <div className="text-sm font-bold">@{player?.username}</div>
            <div className="text-[9px] opacity-40 uppercase tracking-widest">FID: {player?.fid}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold">${usdcBalanceFormatted} USDC</div>
          <div className="text-[8px] opacity-40 uppercase tracking-widest font-bold">Base Sepolia</div>
        </div>
      </header>

      <main className="w-full max-w-md flex-1 flex flex-col overflow-hidden relative">
        <ParticleBackground />
        <div className="flex-1 px-5 py-6 flex flex-col overflow-hidden relative z-10">
          {activeTab === Tab.ASCENT ? (
            <div className="flex-1 flex flex-col gap-6 relative">
              {status === GameStatus.PLAYING ? (
                <GameEngine isActive={true} onGameOver={(h,x,g) => {
                  PlayerService.updatePlayerStats(player!.fid, x, g, h).then(() => {
                    loadData(); setStatus(GameStatus.GAMEOVER);
                  });
                }} multiplier={currentMiner.multiplier} />
              ) : status === GameStatus.IDLE ? (
                <div className="flex-1 flex flex-col items-center gap-2 text-center">
                   <div className="flex flex-col items-center z-10 w-full px-2 mt-8">
                    <div className="w-full h-[220px] flex items-center justify-center animate-pulse duration-[2000ms]">
                       <img src={LOGO_URL} className="max-w-full max-h-full object-contain scale-[1.6]" alt="ASCENT" />
                    </div>
                    <p className="text-[11px] opacity-40 uppercase tracking-[0.4em] font-black mt-2">ASCEND TO NEW HEIGHTS</p>
                  </div>
                  <div className="flex flex-col items-center w-full mt-auto mb-6 gap-6">
                    <button onClick={() => { setPaymentType(null); handleStartGame(); }} disabled={isPending} className="w-full max-w-[320px] py-5 border-[3px] border-white bg-white text-black font-black text-lg uppercase tracking-tight rounded-[2.5rem] active:scale-95 transition-all">
                      {isPending ? 'SYNCING...' : 'Tap to Start'}
                    </button>
                    <div className="grid grid-cols-2 gap-3 w-full max-w-[320px]">
                      <div className="p-3 bg-white/5 border border-white/10 rounded-[2rem] flex flex-col items-center">
                        <div className="text-[8px] opacity-30 uppercase font-black">XP Bonus</div>
                        <div className="text-xl font-black italic">{currentMiner.multiplier.toFixed(1)}x</div>
                      </div>
                      <div className="p-3 bg-white/5 border border-white/10 rounded-[2rem] flex flex-col items-center">
                        <div className="text-[8px] opacity-30 uppercase font-black">High Score</div>
                        <div className="text-xl font-black italic">{player?.highScore}m</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : status === GameStatus.GAMEOVER ? (
                <div className="flex-1 flex flex-col justify-center gap-8 text-center animate-in zoom-in">
                  <div className="space-y-2">
                    <h2 className="text-xs opacity-50 uppercase font-black tracking-widest">ASCENT COMPLETE</h2>
                    <div className="text-6xl font-black italic text-white tracking-tighter uppercase">SUCCESS</div>
                  </div>
                  <button onClick={() => setStatus(GameStatus.IDLE)} className="w-full bg-white text-black py-6 font-black text-xl uppercase rounded-3xl active:scale-95">Back to Hub</button>
                </div>
              ) : <div className="flex-1 flex flex-col items-center justify-center"><div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div></div>}
            </div>
          ) : activeTab === Tab.MINER ? (
            <div className="flex-1 flex flex-col gap-6 overflow-hidden items-center">
              <h2 className="text-4xl font-black italic tracking-tighter uppercase text-center w-full">Hardware</h2>
              <div className="p-5 border border-white/10 bg-white/5 rounded-3xl space-y-2 w-full text-center">
                <h3 className="text-xs font-bold uppercase tracking-widest opacity-60">AUTO MINER</h3>
                <p className="text-[10px] leading-relaxed opacity-40 uppercase font-bold">Upgrade your miner to farm more XP to reach the leaderboard and qualify for the airdrop.</p>
              </div>
              <div className="p-8 border border-white/10 bg-white/5 rounded-[40px] w-full flex-1 flex flex-col items-center justify-center gap-8">
                {player?.minerLevel === 0 ? (
                  <div className="flex flex-col items-center gap-6 w-full text-center">
                    <div className="w-20 h-20 border-2 border-dashed border-white/20 rounded-full flex items-center justify-center opacity-30"><Icons.Hardware /></div>
                    <div className="space-y-2">
                      <div className="text-xl font-black italic uppercase">MINER STATUS: LOCKED</div>
                      <p className="text-[10px] opacity-40 font-bold uppercase px-6 leading-relaxed">Unlock to start earning XP passively.</p>
                    </div>
                    <button onClick={() => handleUpgradeMiner(1)} className="w-full py-6 bg-white text-black font-black text-xl uppercase rounded-3xl active:scale-95 transition-all">Unlock Miner ($1.00)</button>
                  </div>
                ) : (
                  <>
                    <div className="text-center">
                      <div className="text-[10px] opacity-40 font-black uppercase">Miner Status</div>
                      <div className="text-4xl font-black italic">Level {player?.minerLevel}</div>
                      <div className="text-xl font-black italic mt-2">{currentMiner.xpPerHour} XP/H</div>
                    </div>
                    <div className="w-full p-8 bg-black/50 border border-white/10 rounded-[32px] flex flex-col justify-center gap-2 items-center text-center">
                      <div className="text-xs opacity-40 font-black uppercase tracking-widest">Current Earnings</div>
                      <div className="text-5xl font-black italic text-center">+{passiveEarnings} XP</div>
                      <button onClick={handleClaim} disabled={passiveEarnings === 0} className="mt-6 w-full py-4 bg-white text-black font-black text-lg rounded-2xl active:scale-95 disabled:opacity-20 transition-all">Claim XP</button>
                    </div>
                    <div className="w-full space-y-4">
                      {nextMiner ? (
                        <button onClick={() => handleUpgradeMiner(player.minerLevel + 1)} className="w-full py-5 border-2 border-white font-black text-lg hover:bg-white hover:text-black transition-all rounded-3xl">Upgrade to Lvl {player.minerLevel + 1} [${nextMiner.cost.toFixed(2)} USDC]</button>
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
               <div className="flex justify-between items-end shrink-0">
                  <h2 className="text-4xl font-black italic uppercase tracking-tighter">{rankingType === 'skill' ? 'Altitude' : 'Experience'}</h2>
                  <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                    <button onClick={() => setRankingType('skill')} className={`px-4 py-1 text-[9px] font-black uppercase rounded-lg ${rankingType === 'skill' ? 'bg-white text-black' : 'opacity-40'}`}>Altitude</button>
                    <button onClick={() => setRankingType('grind')} className={`px-4 py-1 text-[9px] font-black uppercase rounded-lg ${rankingType === 'grind' ? 'bg-white text-black' : 'opacity-40'}`}>Experience</button>
                  </div>
               </div>
               <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                  {leaderboard.map((entry, idx) => (
                    <div key={entry.fid} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black opacity-30">{idx + 1}</span>
                        <img src={entry.pfpUrl || `https://picsum.photos/seed/${entry.fid}/32/32`} className="w-8 h-8 rounded-full opacity-60 border border-white/10" />
                        <div className="text-sm font-bold">@{entry.username}</div>
                      </div>
                      <div className="text-lg font-black italic">{rankingType === 'skill' ? entry.highScore : entry.totalXp.toLocaleString()}</div>
                    </div>
                  ))}
               </div>
               <div className="shrink-0 p-4 border border-white/10 bg-white/5 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center px-2">
                     <div className="text-[10px] opacity-40 font-black uppercase tracking-widest">Your Rank</div>
                     <div className="text-[14px] font-black italic font-mono uppercase">#{playerRank} | {rankingType === 'skill' ? player?.highScore : player?.totalXp} {rankingType === 'skill' ? 'm' : 'XP'}</div>
                  </div>
                  <button onClick={handleUploadHighScore} disabled={uploadingScore} className="w-full py-4 border-2 border-white bg-black hover:bg-white hover:text-black transition-all font-black text-sm uppercase rounded-2xl active:scale-95 disabled:opacity-50">
                    {uploadingScore ? 'Processing...' : (
                      <>
                        <span className="text-white uppercase tracking-wider">FLEX {rankingType === 'skill' ? 'ALTITUDE' : 'EXPERIENCE'}</span> 
                        {((rankingType === 'skill' && player?.hasUsedAltitudeFlex) || (rankingType === 'grind' && player?.hasUsedXpFlex)) && ( <span className="text-gray-500 ml-2">($0.1 USDC)</span> )}
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
                     <div><span className="text-[9px] font-black opacity-30 uppercase">Altitude Record</span><span className="text-xl font-black italic block">{player?.highScore} Meters</span></div>
                     <div><span className="text-[9px] font-black opacity-30 uppercase">Sync Status</span><span className="text-[10px] text-green-400 font-bold block uppercase">SYNCED</span></div>
                     <div><span className="text-[9px] font-black opacity-30 uppercase">Total XP</span><span className="text-xl font-black italic block">{player?.totalXp.toLocaleString()}</span></div>
                     <div><span className="text-[9px] font-black opacity-30 uppercase">Total Games</span><span className="text-xl font-black italic block">{player?.totalRuns}</span></div>
                  </div>
               </div>
               <div className="w-full p-6 border border-white/10 bg-white/5 rounded-[40px]">
                  <h3 className="text-xs font-black uppercase opacity-30 text-center mb-4 tracking-[0.2em]">INVITE RECRUITS</h3>
                  <div className="flex items-center justify-between bg-black/50 border border-white/10 p-4 rounded-[28px] text-center mb-3">
                    <div className="w-1/2"><span className="text-[9px] opacity-30 block uppercase font-bold">Referrals</span><span className="text-2xl font-black italic">{player?.referralCount}</span></div>
                    <div className="w-1/2 border-l border-white/10"><span className="text-[9px] opacity-30 block uppercase font-bold">Referral XP</span><span className="text-xl font-black italic">{player?.referralXpEarned} XP</span></div>
                  </div>
                  <div onClick={handleCopy} className="p-4 bg-white/5 border border-white/20 rounded-2xl text-[9px] opacity-40 text-center tracking-widest uppercase cursor-pointer hover:bg-white/10 transition-all active:scale-98">
                    {copied ? 'COPIED!' : `base-ascent/r/${player?.fid}`}
                  </div>
                  <p className="text-[8px] opacity-30 text-center mt-2 italic px-4 uppercase font-bold">You earn 10% of all XP generated by your recruits hardware automatically.</p>
               </div>
               <div className="w-full p-6 border border-white/10 bg-white/5 rounded-[40px]">
                  <h3 className="text-2xl font-black italic opacity-40 text-center mb-5 tracking-widest">TASKS</h3>
                  <div className="space-y-3">
                     {[
                       { id: 'f-gabe', l: 'Follow gabe on Base', u: 'https://warpcast.com/gabexbt' },
                       { id: 'f-x', l: 'Follow gabe on X', u: 'https://x.com/gabexbt' },
                       { id: 'post-interaction', l: 'Engagement Booster', u: 'https://warpcast.com/gabexbt/0x892a0' }
                     ].map(t => (
                        <div key={t.id} className="w-full p-4 border border-white/10 rounded-[28px] flex items-center justify-between bg-black/50">
                           <div className="text-left"><div className="text-[10px] font-black uppercase">{t.l}</div><div className="text-[8px] opacity-40">+500 XP</div></div>
                           <button onClick={() => handleTaskClick(t.id, t.u)} disabled={false &&(t.id) || taskTimers[t.id]?.time > 0} className="text-[9px] font-black italic border border-white/20 px-3 py-1.5 rounded-xl active:scale-95">
                              {false &&(t.id) ? 'DONE' : taskTimers[t.id]?.time > 0 ? `SYNCING ${taskTimers[t.id].time}s` : 'CLAIM XP'}
                           </button>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>

      <nav className="w-full max-w-md bg-black border-t border-white/10 flex justify-around items-center py-4 shrink-0 relative z-20">
        {[Tab.ASCENT, Tab.MINER, Tab.RANKINGS, Tab.PROFILE].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={`flex flex-col items-center gap-1 ${activeTab === t ? 'opacity-100' : 'opacity-30'}`}>
            {t === Tab.ASCENT && <Icons.Ascent />} {t === Tab.MINER && <Icons.Hardware />}
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