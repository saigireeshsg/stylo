// Runtime config: build-time env vars, overridable from the in-app Settings screen (handy for demos).
export interface Config {
  supabaseUrl: string;
  supabaseAnonKey: string;
  geminiKey: string;
  textModel: string;
  imageModel: string;
}
const KEY = 'stylo.config';
const env = import.meta.env;
// Stylo's Supabase project. The publishable key is meant to ship in clients; Row Level Security protects the data.
const DEFAULT_SUPABASE_URL = 'https://axlrgnmzaageulewyyip.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_kh6NmIt03jZPgK9zH71TWw_cCW76uev';

export function getConfig(): Config {
  let saved: Partial<Config> = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* ignore */ }
  const local = saved.supabaseUrl === 'local'; // offline/demo mode: device storage + bundled catalog.json
  return {
    supabaseUrl: local ? '' : saved.supabaseUrl || env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    supabaseAnonKey: saved.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY,
    geminiKey: saved.geminiKey || env.VITE_GEMINI_API_KEY || '',
    textModel: saved.textModel || env.VITE_GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
    imageModel: saved.imageModel || env.VITE_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  };
}
export function saveConfig(c: Partial<Config>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...getConfig(), ...c })); } catch { /* ignore */ }
}
