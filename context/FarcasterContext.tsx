import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface FrameContext {
  user: {
    fid?: number;
    username?: string;
    pfpUrl?: string;
    walletAddress?: string;
  };
  frameMessage?: any;
  referrerFid?: number;
  isReady: boolean;
  error?: string;
}

interface FarcasterContextType {
  frameContext: FrameContext;
  setFrameContext: (context: FrameContext) => void;
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
    const initializeFarcaster = async () => {
      try {
        if (typeof window !== 'undefined' && window.parent !== window) {
          const response = await fetch(
            `https://api.warpcast.com/v2/frames/context`,
            { method: 'POST' }
          );

          if (response.ok) {
            const data = await response.json();
            const urlParams = new URLSearchParams(window.location.search);
            const referrerFid = urlParams.get('referrer');

            setFrameContext({
              user: {
                fid: data.interactor?.fid,
                username: data.interactor?.username,
                pfpUrl: data.interactor?.pfpUrl,
                walletAddress: data.interactor?.walletAddress || data.interactor?.custody_address,
              },
              frameMessage: data,
              referrerFid: referrerFid ? parseInt(referrerFid) : undefined,
              isReady: true,
            });
          } else {
            setFrameContext((prev) => ({
              ...prev,
              isReady: true,
              error: 'Failed to fetch frame context',
            }));
          }
        } else {
          setFrameContext((prev) => ({
            ...prev,
            isReady: true,
          }));
        }
      } catch (error) {
        console.error('Farcaster initialization error:', error);
        setFrameContext((prev) => ({
          ...prev,
          isReady: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      } finally {
        setIsLoading(false);
      }
    };

    initializeFarcaster();
  }, []);

  return (
    <FarcasterContext.Provider value={{ frameContext, setFrameContext, isLoading }}>
      {children}
    </FarcasterContext.Provider>
  );
};

export const useFarcaster = () => {
  const context = useContext(FarcasterContext);
  if (!context) {
    throw new Error('useFarcaster must be used within FarcasterProvider');
  }
  return context;
};