import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Only create the client when both values are present — avoids crashes during local dev
export const supabase = (url && key) ? createClient(url, key) : null;
export const IS_SUPABASE_ENABLED = !!(url && key);
