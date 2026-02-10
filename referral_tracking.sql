
-- Table to track referral clicks by IP for "Deferred Deep Linking"
CREATE TABLE IF NOT EXISTS referral_clicks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_address TEXT NOT NULL,
    referral_code TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_referral_clicks_ip ON referral_clicks(ip_address);

-- RLS Policies (Allow public access for this hackathon/MVP scope)
ALTER TABLE referral_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for all users" ON referral_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable select for all users" ON referral_clicks FOR SELECT USING (true);

-- Function to clean up old logs (optional, run periodically)
CREATE OR REPLACE FUNCTION cleanup_referral_logs() RETURNS VOID AS $$
BEGIN
  DELETE FROM referral_clicks WHERE created_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;
