import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ctx, Route, Tab } from './state';
import { currentUserId, getProfile, list, Profile, Row, saveProfile, supabase } from './lib/store';
import { loadCatalog, Product } from './lib/catalog';
import { buildBody, buildColor, BodyProfile } from './lib/body';
import type { ColorProfile } from './lib/color';
import { learnTaste } from './lib/recommend';
import { Icon } from './ui';
import { Welcome } from './screens/Welcome';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { Situation } from './screens/Situation';
import { Saved } from './screens/Saved';
import { TryOns } from './screens/TryOn';
import { Chat } from './screens/Chat';
import { Me } from './screens/Me';

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [route, setRoute] = useState<Route>({});
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photos, setPhotos] = useState<Row[]>([]);
  const [interactions, setInteractions] = useState<Row[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [msg, setMsg] = useState('');

  const toast = useCallback((m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3200); }, []);
  const refresh = useCallback(async () => {
    const id = await currentUserId(); setUser(id);
    if (!id) return;
    const [p, ph, it] = await Promise.all([getProfile(), list('photos'), list('interactions', 500)]);
    // Continuous refinement: the style guide is rebuilt from ALL stored photo analyses.
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
    loadCatalog().then((c) => { setCatalog(c); setCatalogReady(true); }).catch(() => setCatalogReady(true));
    refresh().catch((e) => toast(e.message)).finally(() => setReady(true));
    const sub = supabase()?.auth.onAuthStateChange(() => { refresh(); });
    return () => sub?.data.subscription.unsubscribe();
  }, [refresh, toast]);

  const taste = useMemo(() => learnTaste(interactions), [interactions]);
  const go = (t: Tab) => { setRoute({}); setTab(t); window.scrollTo(0, 0); };
  const value = {
    profile, photos, catalog, catalogReady, interactions, taste, refresh, toast, go, route,
    body: (profile?.body ?? null) as BodyProfile | null, color: (profile?.color ?? null) as ColorProfile | null,
    openSituation: (id: string, seed?: Product[]) => { setRoute({ situation: id, seed, nonce: Date.now() }); window.scrollTo(0, 0); },
    closeSituation: () => { setRoute({}); window.scrollTo(0, 0); },
  };

  if (!ready) return <div className="center"><span className="spinner" /></div>;
  const onboarded = profile?.height_cm && photos.length > 0 && profile?.prefs?.onboarded;

  return (
    <Ctx.Provider value={value}>
      {!user ? <Welcome onIn={refresh} />
        : !onboarded && !route.situation ? <Onboarding />
        : route.situation ? <Situation key={route.nonce} />
        : <>
          <main>{{ home: <Home />, looks: <TryOns />, saved: <Saved />, me: <Me />, chat: <Chat /> }[tab]}</main>
          <nav className="tabs">
            {([['home', 'home', 'Home'], ['looks', 'looks', 'Looks'], ['saved', 'saved', 'Saved'], ['chat', 'chat', 'Stylist'], ['me', 'me', 'Me']] as const).map(([t, icon, label]) => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => go(t)}><Icon name={icon} size={22} /><span>{label}</span></button>
            ))}
          </nav>
        </>}
      {msg && <div className="toast">{msg}</div>}
    </Ctx.Provider>
  );
}
