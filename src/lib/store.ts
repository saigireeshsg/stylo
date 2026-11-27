// Data layer. Uses Supabase (Auth + Postgres + Storage) when configured;
// otherwise falls back to an on-device IndexedDB store so the demo still works offline.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from './config';

export type Collection = 'photos' | 'saved_items' | 'tryons' | 'interactions' | 'chat_messages';
export interface Row { id: string; created_at: string; path?: string | null; url?: string; [k: string]: any }
export interface Profile { id?: string; name?: string; height_cm?: number; anchors?: any; body?: any; color?: any; prefs?: any; updated_at?: string }

let sb: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  const c = getConfig();
  if (!c.supabaseUrl || !c.supabaseAnonKey) return null;
  if (!sb) sb = createClient(c.supabaseUrl, c.supabaseAnonKey);
  return sb;
}
export const isCloud = () => !!supabase();
const BUCKET = 'stylo';

// ---------------- IndexedDB fallback ----------------
const DB = 'stylo-local';
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      for (const s of ['photos', 'saved_items', 'tryons', 'interactions', 'chat_messages', 'profile', 'blobs']) r.result.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbOp<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idb();
  return new Promise((res, rej) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => res(req.result as T);
    req.onerror = () => rej(req.error);
  });
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
const blobUrls = new Map<string, string>();

// ---------------- Auth ----------------
export async function currentUserId(): Promise<string | null> {
  const s = supabase();
  if (!s) return localStorage.getItem('stylo.localUser');
  const { data } = await s.auth.getSession();
  return data.session?.user.id ?? null;
}
export async function signUp(email: string, password: string) {
  const s = supabase()!; const { error } = await s.auth.signUp({ email, password }); if (error) throw error;
  const { error: e2 } = await s.auth.signInWithPassword({ email, password }); if (e2) throw new Error('Account created. Confirm your email, then sign in. (Tip: turn off "Confirm email" in Supabase Auth settings for demos.)');
}
export async function signIn(email: string, password: string) {
  const { error } = await supabase()!.auth.signInWithPassword({ email, password }); if (error) throw error;
}
export async function signInGuest() {
  const s = supabase();
  if (!s) { localStorage.setItem('stylo.localUser', 'local-' + uid()); return; }
  const { error } = await s.auth.signInAnonymously();
  if (error) throw new Error(error.message + ' (Enable Anonymous sign-ins in Supabase → Auth → Providers.)');
}
export async function signOut() {
  const s = supabase(); if (s) await s.auth.signOut(); else localStorage.removeItem('stylo.localUser');
}

// ---------------- Profile ----------------
export async function getProfile(): Promise<Profile | null> {
  const s = supabase(); const id = await currentUserId(); if (!id) return null;
  if (!s) return (await idbOp<Profile | undefined>('profile', 'readonly', (st) => st.get(id))) ?? null;
  const { data, error } = await s.from('profiles').select('*').eq('id', id).maybeSingle(); if (error) throw error; return data;
}
export async function saveProfile(p: Profile): Promise<Profile> {
  const s = supabase(); const id = (await currentUserId())!;
  const row = { ...(await getProfile()), ...p, id, updated_at: new Date().toISOString() };
  if (!s) { await idbOp('profile', 'readwrite', (st) => st.put(row)); return row; }
  const { data, error } = await s.from('profiles').upsert(row).select().single(); if (error) throw error; return data;
}

// ---------------- Files ----------------
async function putBlob(folder: string, blob: Blob): Promise<string> {
  const s = supabase(); const id = (await currentUserId())!;
  const ext = blob.type.includes('png') ? 'png' : 'jpg';
  const path = `${id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  if (!s) { await idbOp('blobs', 'readwrite', (st) => st.put({ id: path, blob })); return path; }
  const { error } = await s.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false }); if (error) throw error;
  return path;
}
export async function fileUrl(path?: string | null): Promise<string | undefined> {
  if (!path) return undefined;
  if (blobUrls.has(path)) return blobUrls.get(path);
  const s = supabase(); let url: string | undefined;
  if (!s) {
    const r = await idbOp<{ blob: Blob } | undefined>('blobs', 'readonly', (st) => st.get(path));
    url = r ? URL.createObjectURL(r.blob) : undefined;
  } else {
    const { data } = await s.storage.from(BUCKET).createSignedUrl(path, 60 * 60); url = data?.signedUrl;
  }
  if (url) blobUrls.set(path, url);
  return url;
}
export async function fileBlob(path: string): Promise<Blob> {
  const s = supabase();
  if (!s) return (await idbOp<{ blob: Blob }>('blobs', 'readonly', (st) => st.get(path))).blob;
  const { data, error } = await s.storage.from(BUCKET).download(path); if (error) throw error; return data;
}

// ---------------- Rows ----------------
export async function insert(col: Collection, data: Record<string, any>, blob?: Blob, folder?: string): Promise<Row> {
  const s = supabase(); const user_id = (await currentUserId())!;
  const path = blob ? await putBlob(folder ?? col, blob) : null;
  const row: Row = { id: uid(), user_id, created_at: new Date().toISOString(), ...(path ? { path } : {}), ...data };
  if (!s) { await idbOp(col, 'readwrite', (st) => st.put(row)); }
  else { const { data: d, error } = await s.from(col).insert(row).select().single(); if (error) throw error; Object.assign(row, d); }
  if (path) row.url = await fileUrl(path);
  return row;
}
export async function list(col: Collection, limit = 200): Promise<Row[]> {
  const s = supabase(); const user_id = await currentUserId(); if (!user_id) return [];
  let rows: Row[];
  if (!s) rows = (await idbOp<Row[]>(col, 'readonly', (st) => st.getAll())).filter((r) => r.user_id === user_id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  else { const { data, error } = await s.from(col).select('*').eq('user_id', user_id).order('created_at', { ascending: false }).limit(limit); if (error) throw error; rows = data ?? []; }
  await Promise.all(rows.map(async (r) => { if (r.path) r.url = await fileUrl(r.path); }));
  return rows;
}
export async function update(col: Collection, id: string, patch: Record<string, any>) {
  const s = supabase();
  if (!s) { const r = await idbOp<Row>(col, 'readonly', (st) => st.get(id)); await idbOp(col, 'readwrite', (st) => st.put({ ...r, ...patch })); return; }
  const { error } = await s.from(col).update(patch).eq('id', id); if (error) throw error;
}
export async function remove(col: Collection, row: Row) {
  const s = supabase();
  if (!s) { await idbOp(col, 'readwrite', (st) => st.delete(row.id)); if (row.path) await idbOp('blobs', 'readwrite', (st) => st.delete(row.path!)); return; }
  if (row.path) await s.storage.from(BUCKET).remove([row.path]);
  const { error } = await s.from(col).delete().eq('id', row.id); if (error) throw error;
}

/** Downscale + JPEG-compress before storing (phone photos are often 4–8 MB → ~200 KB). */
export async function compressImage(file: Blob, maxSide = 1280, quality = 0.85): Promise<{ blob: Blob; canvas: HTMLCanvasElement }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', quality));
  return { blob, canvas: c };
}
