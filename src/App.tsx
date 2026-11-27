import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ctx, Tab } from './state';
import { currentUserId, getProfile, isCloud, list, Profile, Row, saveProfile, signIn, signInGuest, signUp, supabase } from './lib/store';
import { loadCatalog, Product, savedToProduct } from './lib/catalog';
import { buildBody, buildColor, BodyProfile } from './lib/body';
import type { ColorProfile } from './lib/color';
import { learnTaste } from './lib/recommend';
import { Logo } from './ui';
import { Onboarding } from './screens/Onboarding';
import { Style } from './screens/Style';
import { Saved } from './screens/Saved';
import { TryOns } from './screens/TryOn';
import { Studio } from './screens/Studio';
import { Chat } from './screens/Chat';
import { Me } from './screens/Me';

function Auth({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const run = (f: () => Promise<void>) => async () => { setBusy(true); setErr(''); try { await f(); onIn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="page auth">
      <Logo size={64} />
      <h1>Your AI stylist</h1>
      <p className="muted">Sizes measured from your photos. Colours that suit your skin. See outfits on yourself before you buy.</p>
      {isCloud() ? <>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
        <div className="row gap"><button className="primary" disabled={busy} onClick={run(() => signIn(email, pw))}>Sign in</button><button disabled={busy} onClick={run(() => signUp(email, pw))}>Create account</button></div>
        <button className="link" onClick={run(signInGuest)}>Continue as guest</button>
      </> : <>
        <p className="card small">Demo mode: everything is stored on this device. Add Supabase keys in <code>.env</code> (or later in Settings) for cloud login and sync.</p>
        <button className="primary" onClick={run(signInGuest)}>Start</button>
      </>}
      {err && <p className="issues">{err}</p>}
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('studio');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photos, setPhotos] = useState<Row[]>([]);
  const [interactions, setInteractions] = useState<Row[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [msg, setMsg] = useState('');
  const [studioSeed, setStudioSeed] = useState<{ items?: Product[]; sceneId?: string; nonce: number } | null>(null);

  const toast = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3200); }, []);
  const refresh = useCallback(async () => {
    const id = await currentUserId(); setUser(id);
    if (!id) return;
    const [p, ph, it] = await Promise.all([getProfile(), list('photos'), list('interactions', 500)]);
    // Continuous refinement: the body + colour profile is rebuilt from ALL stored photo analyses.
    let prof = p;
    if (p?.height_cm) {
      const analyses = ph.map((r) => r.analysis).filter(Boolean);
      const body = analyses.length ? buildBody(p.height_cm, analyses, p.anchors ?? {}) : null;
      const color = buildColor(analyses);
      if (JSON.stringify(body) !== JSON.stringify(p.body) || JSON.stringify(color) !== JSON.stringify(p.color)) prof = await saveProfile({ body, color });
    }
    setProfile(prof); setPhotos(ph); setInteractions(it);
  }, []);

  useEffect(() => {
    (async () => {
      loadCatalog().then(setCatalog);
      try { await refresh(); } catch (e: any) { toast(e.message); }
      setReady(true);
    })();
    const s = supabase();
    const sub = s?.auth.onAuthStateChange(() => { refresh(); });
    return () => sub?.data.subscription.unsubscribe();
  }, [refresh, toast]);

  const taste = useMemo(() => learnTaste(interactions), [interactions]);
  const value = {
    profile, photos, catalog, interactions, taste, refresh, toast,
    body: (profile?.body ?? null) as BodyProfile | null, color: (profile?.color ?? null) as ColorProfile | null,
    startTryOn: (items: Product[] | null, saved?: Row, sceneId?: string) => {
      const seed = saved ? [savedToProduct(saved)].filter(Boolean) as Product[] : items ?? [];
      if (saved && !seed.length) { toast('Could not tell what garment this is. Try a clearer screenshot.'); return; }
      setStudioSeed({ items: seed, sceneId, nonce: Date.now() }); setTab('studio'); window.scrollTo(0, 0);
    }, go: setTab, studioSeed,
  };

  if (!ready) return <div className="center"><span className="spinner" /></div>;
  if (!user) return <Auth onIn={refresh} />;
  const onboarded = profile?.height_cm && photos.length > 0 && profile?.prefs?.onboarded;

  return (
    <Ctx.Provider value={value}>
      {!onboarded ? <Onboarding /> : <>
        <main>{{ studio: <Studio key={studioSeed?.nonce ?? 0} />, style: <Style />, saved: <Saved />, tryon: <TryOns />, chat: <Chat />, me: <Me /> }[tab]}</main>
        {tab !== 'chat' && tab !== 'studio' && <button className="fab" onClick={() => setTab('chat')} aria-label="Ask your stylist">💬</button>}
        <nav className="tabs">
          {([['studio', 'M4 20V9l8-5 8 5v11', 'Studio'], ['style', 'M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z', 'For you'], ['saved', 'M6 3h12v18l-6-4-6 4z', 'Saved'], ['tryon', 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4', 'Looks'], ['me', 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1-4 4-6 8-6s7 2 8 6', 'Me']] as const).map(([t, d, l]) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"><path d={d} /></svg><small>{l}</small></button>
          ))}
        </nav>
      </>}
      {msg && <div className="toast">{msg}</div>}
    </Ctx.Provider>
  );
}
