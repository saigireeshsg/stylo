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

export function getConfig(): Config {
  let saved: Partial<Config> = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* ignore */ }
  return {
    supabaseUrl: saved.supabaseUrl || env.VITE_SUPABASE_URL || '',
    supabaseAnonKey: saved.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || '',
    geminiKey: saved.geminiKey || env.VITE_GEMINI_API_KEY || '',
    textModel: saved.textModel || env.VITE_GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
    imageModel: saved.imageModel || env.VITE_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  };
}
export function saveConfig(c: Partial<Config>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...getConfig(), ...c })); } catch { /* ignore */ }
}
