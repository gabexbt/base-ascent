import React, { useState } from 'react';
import { Player, UpgradeType } from '../types';
import { UPGRADES_CONFIG } from '../constants';
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
  const [error, setError] = useState<string | null>(null);

  const calculateCost = (baseCost: number, level: number) => {
    return Math.floor(baseCost * Math.pow(1.5, level));
  };

  const handlePurchaseClick = async (type: string) => {
    if (isProcessing || purchasing) return;
    
    const config = UPGRADES_CONFIG[type as keyof typeof UPGRADES_CONFIG];
    // @ts-ignore
    const currentLevel = player.upgrades[type] || 0;
    const cost = calculateCost(config.baseCost, currentLevel);

    if (player.totalGold < cost) {
      setError("Not enough Gold!");
      setTimeout(() => setError(null), 2000);
      return;
    }

    setPurchasing(type);
    try {
      if (onPurchase) {
        await onPurchase(type);
      } else {
        await PlayerService.purchaseUpgrade(player.fid, type, cost);
        if (onUpdate) await onUpdate();
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Purchase failed. Try again.");
    } finally {
      setPurchasing(null);
    }
  };

  // Helper to get fallback icon
  const getIcon = (type: string) => {
    switch(type) {
      case 'rapid_lift': return <Icons.ArrowUp className="w-8 h-8 text-blue-400" />;
      case 'magnet': return <Icons.Magnet className="w-8 h-8 text-yellow-400" />;
      case 'battery': return <Icons.Zap className="w-8 h-8 text-purple-400" />;
      case 'luck': return <Icons.Crosshair className="w-8 h-8 text-green-400" />;
      case 'stabilizer': return <Icons.Gauge className="w-8 h-8 text-red-400" />;
      default: return <div className="w-8 h-8 bg-gray-600 rounded-full" />;
    }
  };

  return (
    <div className="flex flex-col w-full bg-black text-white p-4 pb-24">
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
        {Object.entries(UPGRADES_CONFIG).map(([key, config]) => {
          // @ts-ignore
          const currentLevel = player.upgrades?.[key] || 0;
          const cost = calculateCost(config.baseCost, currentLevel);
          const canAfford = player.totalGold >= cost;
          const isPurchasing = purchasing === key;

          return (
            <div key={key} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4 relative overflow-hidden group">
              {/* Background gradient effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />

              {/* Icon */}
              <div className="flex-shrink-0 w-16 h-16 bg-white/5 rounded-lg flex items-center justify-center border border-white/10 shadow-inner">
                 {/* Try to use image, fallback to Lucide icon */}
                 <img 
                   src={config.icon} 
                   alt={config.name} 
                   className="w-12 h-12 object-contain" 
                   onError={(e) => {
                     e.currentTarget.style.display = 'none';
                     e.currentTarget.parentElement?.querySelector('.fallback-icon')?.classList.remove('hidden');
                   }}
                 />
                 <div className="fallback-icon hidden absolute">
                   {getIcon(key)}
                 </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-lg leading-tight">{config.name}</h3>
                  <span className="bg-white/10 text-white text-[10px] font-bold px-1.5 py-0.5 rounded border border-white/20">
                    Lvl {currentLevel}
                  </span>
                </div>
                <p className="text-white/60 text-sm leading-snug mt-1">{config.description}</p>
                <div className="text-xs text-white/40 mt-1">
                  Next: <span className="text-white/80">+{Math.pow(1.5, currentLevel + 1).toFixed(1)}x scaling</span>
                </div>
              </div>

              {/* Action */}
              <button
                onClick={() => handlePurchaseClick(key)}
                disabled={!canAfford || isPurchasing || isProcessing}
                className={`flex-shrink-0 w-24 flex flex-col items-center justify-center py-2 rounded-lg font-bold transition-all active:scale-95 ${
                  canAfford 
                    ? 'bg-white hover:bg-gray-200 text-black shadow-[0_0_15px_rgba(255,255,255,0.2)]' 
                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                }`}
              >
                {isPurchasing ? (
                  <span className="animate-spin text-xl">⟳</span>
                ) : (
                  <>
                    <span className="text-xs uppercase opacity-80 mb-0.5">Buy</span>
                    <div className="flex items-center gap-1 text-sm">
                      <span>{cost}</span>
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
