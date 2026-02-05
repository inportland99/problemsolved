import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Supabase configuration for math-lessons project
const SUPABASE_URL = 'https://ffwljxasdsgtzbwwvxyi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_aXstNBNr9UYUTnLvS3Vv9Q_QLntAUR3';

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
