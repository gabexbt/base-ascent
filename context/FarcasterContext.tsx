import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import sdk from '@farcaster/frame-sdk';

interface FrameContext {
  user: {
    fid?: number;
    username?: string;
    pfpUrl?: string;
    walletAddress?: string;
  };
  context?: any;
  referrerFid?: number;
  isReady: boolean;
}

interface FarcasterContextType {
  frameContext: FrameContext;
  isLoading: boolean;
}

const FarcasterContext = createContext<FarcasterContextType | undefined>(undefined);

export const FarcasterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [frameContext, setFrameContext] = useState<FrameContext>({
    user: {},
    isReady: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // 1. CRITICAL: Hide splash screen immediately
        await sdk.actions.ready();
        
        // 2. Load Context
        const context = await sdk.context;

        // 3. Handle Referrals (Preserving your logic)
        const urlParams = new URLSearchParams(window.location.search);
        const pathSegments = window.location.pathname.split('/');
        const referrerFid = urlParams.get('referrer') || (pathSegments[1] === 'r' ? pathSegments[2] : null);

        // 4. Set State
        setFrameContext({
          user: {
            fid: context.user.fid,
            username: context.user.username,
            pfpUrl: context.user.pfpUrl,
            walletAddress: (context as any).user?.address || (context as any).address, 
          },
          context: context,
          referrerFid: referrerFid ? parseInt(referrerFid) : undefined,
          isReady: true,
        });
      } catch (err) {
        console.error("SDK Load Error:", err);
        // Fallback for browser testing
        setFrameContext({
          user: { fid: 18350, username: 'dev-preview', pfpUrl: 'https://placehold.co/400' },
          isReady: true
        });
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  return (
    <FarcasterContext.Provider value={{ frameContext, isLoading }}>
      {children}
    </FarcasterContext.Provider>
  );
};

export const useFarcaster = () => {
  const context = useContext(FarcasterContext);
  if (!context) throw new Error('useFarcaster must be used within FarcasterProvider');
  return context;
};