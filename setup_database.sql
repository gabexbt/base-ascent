-- Enable Row Level Security (RLS) on tables
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create Policies for Players Table

-- 1. Allow public read access to all player profiles (needed for leaderboards)
CREATE POLICY "Public profiles are viewable by everyone" 
ON players FOR SELECT 
USING (true);

-- 2. Allow users to insert their own profile (for new players)
-- Note: In a production environment with Supabase Auth, you would use (auth.uid() = user_id)
-- Since we are using Farcaster FIDs and client-side logic for this dev preview, we allow public insert
-- but validation should ideally happen on a backend server.
CREATE POLICY "Public can insert new player" 
ON players FOR INSERT 
WITH CHECK (true);

-- 3. Allow users to update their own profile
-- Again, without a backend verifying the Farcaster signature, we rely on the client.
-- This policy allows updates to any row for now to ensure the game functions for all users.
-- TO SECURE THIS: You must implement a backend service that verifies the Farcaster Frame signature
-- and then performs the update with a service role key.
CREATE POLICY "Public can update player stats" 
ON players FOR UPDATE 
USING (true);

-- Create Policies for Transactions Table

-- 1. Allow public read access (optional, maybe restrict to own?)
CREATE POLICY "Transactions viewable by everyone" 
ON transactions FOR SELECT 
USING (true);

-- 2. Allow public insert of transactions
CREATE POLICY "Public can insert transactions" 
ON transactions FOR INSERT 
WITH CHECK (true);

-- Note: We generally do not allow updates to transactions (immutable ledger)
