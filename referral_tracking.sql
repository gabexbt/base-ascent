
-- Table to track referral clicks by IP for "Deferred Deep Linking"
CREATE TABLE IF NOT EXISTS referral_clicks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_address TEXT NOT NULL,
    referral_code TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_referral_clicks_ip ON referral_clicks(ip_address);

-- RLS Policies
ALTER TABLE referral_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for all users" ON referral_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable select for all users" ON referral_clicks FOR SELECT USING (true);

-- Function to clean up old logs
CREATE OR REPLACE FUNCTION cleanup_referral_logs() RETURNS VOID AS $$
BEGIN
  DELETE FROM referral_clicks WHERE created_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- RPC to Log a Click (Captures IP automatically)
CREATE OR REPLACE FUNCTION log_referral_click(p_code TEXT)
RETURNS VOID AS $$
DECLARE
  client_ip TEXT;
BEGIN
  -- Attempt to get IP from headers (works in Supabase)
  client_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  
  -- Fallback/Cleanup IP (take first if multiple)
  IF client_ip IS NOT NULL THEN
    client_ip := split_part(client_ip, ',', 1);
  ELSE
    client_ip := 'unknown';
  END IF;

  INSERT INTO referral_clicks (ip_address, referral_code)
  VALUES (client_ip, p_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC to Check for a Deferred Referral (Matches IP)
CREATE OR REPLACE FUNCTION check_deferred_referral()
RETURNS TEXT AS $$
DECLARE
  match_code TEXT;
  client_ip TEXT;
BEGIN
  client_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  
  IF client_ip IS NOT NULL THEN
    client_ip := split_part(client_ip, ',', 1);
  ELSE
    client_ip := 'unknown';
  END IF;

  SELECT referral_code INTO match_code
  FROM referral_clicks
  WHERE ip_address = client_ip
  AND created_at > now() - INTERVAL '1 hour'
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN match_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
