# Project Context: Base Ascent

## Tech Stack
- **Frontend:** React (Vite)
- **Database:** Supabase (PostgreSQL)
- **Blockchain:** Base Mainnet (Coinbase L2)
- **SDK:** @farcaster/frame-sdk (v2)
- **Wallet:** Wagmi + Viem + Coinbase Wallet SDK

## Critical Rules
1. **Farcaster Loading:**
   - Must call `sdk.actions.ready()` immediately on load.
   - Use `sdk.context` to get `fid` and `username`.
   - Do NOT use the `window.farcaster` hack; use the import.

2. **Database (Supabase):**
   - Use the `anon` key for client-side queries.
   - Tables: `players`, `leaderboard`, `transactions`.
   - RLS is enabled; users can only update their own rows via Edge Functions (or strict policies).

3. **Payments (Base Mainnet):**
   - USDC Contract: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
   - Dev Wallet: `0x53481a207B5dd683a7C018157709A5092774b09A`
   - Always use `base` chain (chainId: 8453), not Sepolia.

4. **Deployment:**
   - Platform: Vercel
   - Config: `vercel.json` handles CORS for `/.well-known/farcaster.json`.