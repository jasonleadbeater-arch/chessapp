import { createClient } from '@supabase/supabase-js';

// Replace these with the actual strings from your Supabase Project Settings > API
const supabaseUrl = 'https://gmxcrknuviodvxlmqmrp.supabase.co';
const supabaseAnonKey = 'sb_publishable_xgudpCUBe5njpxPxEKTs1g_fjXM8DoW';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);