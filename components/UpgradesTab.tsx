import React, { useState } from 'react';
import { Player } from '../types';
import { UPGRADES, getUpgradeCost, getUpgradeValue } from '../constants';
import { PlayerService } from '../services/playerService';

// Inline Icons to avoid lucide-react dependency
const Icons = {
  ArrowUp: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>
    </svg>
  ),
  Magnet: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.2 2.2 0 0 0-3.1-3.07z"/><path d="m7 7 2 2"/>
    </svg>
  ),
  Zap: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  Crosshair: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/>
    </svg>
  ),
  Gauge: ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>
    </svg>
  )
};

interface UpgradesTabProps {
  player: Player;
  onUpdate?: () => void;
  onPurchase?: (type: string) => Promise<void>;
  isProcessing?: boolean;
}

export const UpgradesTab: React.FC<UpgradesTabProps> = ({ player, onUpdate, onPurchase, isProcessing }) => {
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<Record<string, 'processing' | 'success'>>({});
  const [error, setError] = useState<string | null>(null);

  const handlePurchaseClick = async (type: string) => {
    if (isProcessing || purchasing || purchaseStatus[type] === 'success') return;
    
    // @ts-ignore
    const currentLevel = player.upgrades[type] || 0;
    const cost = getUpgradeCost(type, currentLevel);

    if (player.totalGold < cost) {
      setError("Not enough Gold!");
      setTimeout(() => setError(null), 2000);
      return;
    }

    setPurchasing(type);
    setPurchaseStatus(prev => ({ ...prev, [type]: 'processing' }));
    try {
      if (onPurchase) {
        await onPurchase(type);
      } else {
        await PlayerService.purchaseUpgrade(player.fid, type, cost);
        if (onUpdate) await onUpdate();
      }
      setPurchaseStatus(prev => ({ ...prev, [type]: 'success' }));
      setTimeout(() => {
        setPurchaseStatus(prev => {
          const next = { ...prev };
          delete next[type];
          return next;
        });
      }, 1000);
    } catch (e: any) {
      console.error("Purchase Error Details:", e);
      const msg = e.message || e.error_description || e.details || "Purchase failed. Try again.";
      setError(msg);
      setPurchaseStatus(prev => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
    } finally {
      setPurchasing(null);
    }
  };

  // Helper to get fallback icon
  const getIcon = (type: string) => {
    switch(type) {
      case 'midas_touch': return <Icons.Magnet className="w-8 h-8 text-yellow-400" />;
      case 'overclock': return <Icons.Zap className="w-8 h-8 text-purple-400" />;
      case 'gridlock': return <Icons.Crosshair className="w-8 h-8 text-blue-400" />;
      case 'lucky_strike': return <Icons.ArrowUp className="w-8 h-8 text-green-400" />; // Changed to ArrowUp or maybe Zap with different color?
      case 'stabilizer': return <Icons.Gauge className="w-8 h-8 text-red-400" />;
      default: return <div className="w-8 h-8 bg-gray-600 rounded-full" />;
    }
  };

  return (
    <div className="flex flex-col w-full bg-black text-white p-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white uppercase tracking-wider">Armory</h2>
          <p className="text-xs text-white/40">Upgrade your hardware</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-yellow-400 tracking-tighter flex items-center justify-end gap-3">
            {player.totalGold.toLocaleString()}
            <span className="text-sm text-yellow-600 font-bold">GOLD</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4 text-center text-sm font-bold animate-pulse">
          {error}
        </div>
      )}

      {/* Upgrades List */}
      <div className="space-y-3">
        {UPGRADES.map((config) => {
          // @ts-ignore
          const currentLevel = player.upgrades?.[config.id] || 0;
          const cost = getUpgradeCost(config.id, currentLevel);
          const currentValue = getUpgradeValue(config.id, currentLevel);
          const canAfford = player.totalGold >= cost;
          const isPurchasing = purchasing === config.id || purchaseStatus[config.id] === 'processing';
          const isSuccess = purchaseStatus[config.id] === 'success';

          return (
            <div key={config.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4 relative overflow-hidden group">
              {/* Background gradient effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />

              {/* Icon */}
              <div className="flex-shrink-0 w-16 h-16 bg-white/5 rounded-lg flex items-center justify-center border border-white/10 shadow-inner">
                 {/* Try to use image, fallback to Lucide icon - using ID for image path assumption */}
                 <img 
                   src={`/assets/upgrades/${config.id}.png`} 
                   alt={config.name} 
                   className="w-12 h-12 object-contain" 
                   onError={(e) => {
                     e.currentTarget.style.display = 'none';
                     e.currentTarget.parentElement?.querySelector('.fallback-icon')?.classList.remove('hidden');
                   }}
                 />
                 <div className="fallback-icon hidden absolute">
                   {getIcon(config.id)}
                 </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <h3 className="font-bold text-white text-lg leading-tight mb-1">{config.name}</h3>
                <span className="self-start bg-white/10 text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/20 whitespace-nowrap">
                  Lvl {currentLevel}
                </span>
                <p className="text-white/60 text-xs leading-snug mt-2">{config.description}</p>
                <div className="text-[10px] text-white/40 mt-1">
                  Current: <span className="text-white/80">{config.formatValue(currentValue)}</span>
                </div>
              </div>

              {/* Action */}
              <button
                onClick={() => handlePurchaseClick(config.id)}
                disabled={!canAfford || isPurchasing || isProcessing || isSuccess}
                className={`flex-shrink-0 w-24 flex flex-col items-center justify-center py-2 rounded-lg font-bold transition-all active:scale-95 ${
                  isSuccess
                    ? 'bg-green-500 text-black'
                    : canAfford 
                      ? 'bg-white hover:bg-gray-200 text-black shadow-[0_0_15px_rgba(255,255,255,0.2)]' 
                      : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                }`}
              >
                {isPurchasing ? (
                  <span className="text-xs uppercase opacity-80">Processing...</span>
                ) : isSuccess ? (
                  <span className="text-xs uppercase opacity-80">Success!</span>
                ) : (
                  <>
                    <span className="text-xs uppercase opacity-80 mb-0.5">Buy</span>
                    <div className="flex items-center gap-1 text-sm">
                      <span>{cost.toLocaleString()}</span>
                    </div>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
