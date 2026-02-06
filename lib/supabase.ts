
import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.45.0';

/**
 * HARDCODED FALLBACKS FOR PREVIEW/DEVELOPMENT
 * These ensure the app remains functional even if environment variables 
 * are not correctly injected by the build system.
 */
const FALLBACK_URL = 'https://ribryrteuygabehtpvru.supabase.co';
const FALLBACK_KEY = 'sb_publishable_DCJiJMBcfi9NUX3btakaFA_H6GrSTVi';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY;

// Validation and logging
if (!supabaseUrl || supabaseUrl === 'your_project_url_here') {
  console.error(
    "CRITICAL ERROR: Supabase URL is missing or invalid. " +
    "Ensure NEXT_PUBLIC_SUPABASE_URL is set in .env.local or hardcoded in lib/supabase.ts."
  );
}

if (!supabaseAnonKey || supabaseAnonKey === 'your_anon_key_here') {
  console.error(
    "CRITICAL ERROR: Supabase Anon Key is missing or invalid. " +
    "Ensure NEXT_PUBLIC_SUPABASE_ANON_KEY is set in .env.local or hardcoded in lib/supabase.ts."
  );
}

/**
 * Initialize the Supabase client. 
 * We use the computed constants to guarantee strings are passed to createClient.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
