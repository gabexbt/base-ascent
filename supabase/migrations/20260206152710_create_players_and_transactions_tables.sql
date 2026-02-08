/*
  # Base Ascent Mini-App Database Schema

  1. New Tables
    - `players`: Stores player profiles with game stats
      - `id` (uuid, primary key)
      - `fid` (bigint, unique) - Farcaster ID
      - `username` (text) - Farcaster username
      - `pfp_url` (text) - Profile picture URL
      - `total_xp` (integer) - Total experience points
      - `total_gold` (integer) - Total gold earned
      - `high_score` (integer) - Best single run score
      - `total_runs` (integer) - Total games played
      - `miner_level` (integer) - Current AutoMiner level (0-5)
      - `has_uploaded_score` (boolean) - If player has uploaded to leaderboard
      - `has_used_altitude_flex` (boolean) - If free Flex Altitude used
      - `has_used_xp_flex` (boolean) - If free Flex Experience used
      - `referrer_fid` (bigint) - FID of player who referred them
      - `referral_count` (integer) - Number of successful referrals
      - `referral_xp_earned` (integer) - XP earned from referrals
      - `wallet_address` (text) - User's wallet address
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `transactions`: Tracks all USDC payments
      - `id` (uuid, primary key)
      - `player_id` (uuid, foreign key)
      - `fid` (bigint) - Farcaster ID
      - `amount_usdc` (numeric) - Amount in USDC
      - `transaction_type` (text) - 'miner_purchase', 'altitude_flex', 'xp_flex', 'upload_score'
      - `transaction_hash` (text) - Blockchain transaction hash
      - `status` (text) - 'pending', 'confirmed', 'failed'
      - `metadata` (jsonb) - Additional data (miner_level for purchases, etc)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `leaderboard`: Stores player rankings
      - `id` (uuid, primary key)
      - `player_id` (uuid, foreign key)
      - `fid` (bigint)
      - `username` (text)
      - `pfp_url` (text)
      - `high_score` (integer)
      - `total_xp` (integer)
      - `rank` (integer)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Public can read players and leaderboard (limited fields)
    - Service role handles inserts and updates
    - Indexes on frequently queried columns for performance

  3. Note
    - All timestamps use UTC timezone
    - Numeric type for USDC amounts ensures precision
    - Metadata jsonb allows flexible transaction data storage
*/

CREATE TABLE IF NOT EXISTS users (
  fid bigint PRIMARY KEY,
  username text NOT NULL,
  pfp_url text,
  wallet_address text,
  high_score integer DEFAULT 0,
  total_xp integer DEFAULT 0,
  total_gold integer DEFAULT 0,
  total_runs integer DEFAULT 0,
  leaderboard_high_score integer DEFAULT 0,
  leaderboard_total_xp integer DEFAULT 0,
  has_used_altitude_flex boolean DEFAULT false,
  has_used_xp_flex boolean DEFAULT false,
  last_synced_at timestamptz,
  miner_level integer DEFAULT 0,
  last_claim_at timestamptz DEFAULT now(),
  banked_passive_xp integer DEFAULT 0,
  upgrades jsonb DEFAULT '{"rapid_lift": 0, "magnet": 0, "battery": 0, "luck": 0, "stabilizer": 0}'::jsonb,
  referrer_fid bigint,
  referral_count integer DEFAULT 0,
  referral_xp_earned integer DEFAULT 0,
  completed_tasks text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fid bigint REFERENCES users(fid) ON DELETE CASCADE,
  amount_usdc numeric(10, 2) NOT NULL,
  transaction_type text NOT NULL,
  transaction_hash text,
  status text DEFAULT 'pending',
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS armory_upgrades (
  fid bigint REFERENCES users(fid) ON DELETE CASCADE,
  upgrade_type text NOT NULL,
  level integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (fid, upgrade_type)
);

CREATE TABLE IF NOT EXISTS leaderboard (
  fid bigint PRIMARY KEY,
  username text NOT NULL,
  pfp_url text,
  miner_level integer DEFAULT 0,
  high_score integer NOT NULL,
  total_xp integer NOT NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_stats (
  id integer PRIMARY KEY DEFAULT 1,
  total_usdc numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO platform_stats (id, total_usdc) VALUES (1, 0) ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_users_fid ON users(fid);
CREATE INDEX IF NOT EXISTS idx_users_high_score ON users(high_score DESC);
CREATE INDEX IF NOT EXISTS idx_users_total_xp ON users(total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_fid ON transactions(fid);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_high_score ON leaderboard(high_score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_total_xp ON leaderboard(total_xp DESC);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE armory_upgrades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players are viewable by everyone"
  ON players FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Transactions are viewable by service role"
  ON transactions FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Leaderboard is viewable by everyone"
  ON leaderboard FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Service role can insert transactions"
  ON transactions FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update transactions"
  ON transactions FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can insert players"
  ON players FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update players"
  ON players FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can insert leaderboard"
  ON leaderboard FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update leaderboard"
  ON leaderboard FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
