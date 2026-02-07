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
        const sdk = (window as any).farcasterFrameSDK;

        if (sdk) {
          await sdk.actions.ready();
          const context = await sdk.context;

          const urlParams = new URLSearchParams(window.location.search);
          const pathSegments = window.location.pathname.split('/');
          const referrerFid = urlParams.get('referrer') || (pathSegments[1] === 'r' ? pathSegments[2] : null);

          setFrameContext({
            user: {
              fid: context.user?.fid,
              username: context.user?.username,
              pfpUrl: context.user?.pfpUrl,
              walletAddress: context.user?.addresses?.[0] || context.user?.custodyAddress,
            },
            frameMessage: context,
            referrerFid: referrerFid ? parseInt(referrerFid) : undefined,
            isReady: true,
          });
          setIsLoading(false);
        } else {
          console.log('Running in development mode with mock data');
          setFrameContext({
            user: {
              fid: 12345,
              username: 'player.eth',
              pfpUrl: 'https://picsum.photos/40/40',
              walletAddress: undefined,
            },
            isReady: true,
          });
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Farcaster initialization error:', error);
        console.log('Falling back to development mode');
        setFrameContext({
          user: {
            fid: 12345,
            username: 'player.eth',
            pfpUrl: 'https://picsum.photos/40/40',
            walletAddress: undefined,
          },
          isReady: true,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        setIsLoading(false);
      }
    };

    if (typeof window !== 'undefined') {
      if ((window as any).farcasterFrameSDK) {
        initializeFarcaster();
      } else {
        const checkSDK = setInterval(() => {
          if ((window as any).farcasterFrameSDK) {
            clearInterval(checkSDK);
            initializeFarcaster();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkSDK);
          if (!(window as any).farcasterFrameSDK) {
            console.log('SDK not loaded, using development mode');
            setFrameContext({
              user: {
                fid: 12345,
                username: 'player.eth',
                pfpUrl: 'https://picsum.photos/40/40',
                walletAddress: undefined,
              },
              isReady: true,
            });
            setIsLoading(false);
          }
        }, 3000);
      }
    }
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
