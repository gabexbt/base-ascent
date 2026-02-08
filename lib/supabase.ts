
import { createClient } from '@supabase/supabase-js';

/**
 * HARDCODED FALLBACKS FOR PREVIEW/DEVELOPMENT
 * These ensure the app remains functional even if environment variables 
 * are not correctly injected by the build system.
 */
const FALLBACK_URL = 'https://acwxyvfyshztkbsayibr.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjd3h5dmZ5c2h6dGtic2F5aWJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0Mzc4NjUsImV4cCI6MjA4NjAxMzg2NX0.FTVIg0-gTfThZJsJx6wwJyDr6g2_kFMof1pPkRHVzG0';

const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
const supabaseAnonKey = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY;

// Validation and logging
if (!supabaseUrl || supabaseUrl === 'https://acwxyvfyshztkbsayibr.supabase.co') {
  console.warn(
    "Warning: Using fallback Supabase URL. " +
    "Ensure NEXT_PUBLIC_SUPABASE_URL is set."
  );
}

/**
 * Initialize the Supabase client. 
 * We use the computed constants to guarantee strings are passed to createClient.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
