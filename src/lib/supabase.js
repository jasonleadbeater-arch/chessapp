import { createClient } from '@supabase/supabase-js';

/**
 * 1. NEXT_PUBLIC_ prefix is MANDATORY for Next.js client-side access.
 * 2. We provide the hardcoded strings as a fallback for local dev, 
 * but the variables will take priority on Render.
 */
const supabaseUrl = 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gmxcrknuviodvxlmqmrp.supabase.co';

const supabaseAnonKey = 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_xgudpCUBe5njpxPxEKTs1g_fjXM8DoW';

// Safety check for the console during debugging
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase configuration. Check environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
