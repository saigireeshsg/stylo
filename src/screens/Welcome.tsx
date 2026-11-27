// First-run overview (3 slides over real catalog imagery) + sign-in.
import { useMemo, useState } from 'react';
import { useApp } from '../state';
import { isCloud, signIn, signInGuest, signUp } from '../lib/store';
import { Logo, Tile, Icon } from '../ui';

const SLIDES = [
  { t: 'Your personal stylist', s: 'Add 2 photos. We measure your build, sizes and skin tone on your phone and build your own style guide.' },
  { t: 'See yourself in it', s: 'Pick a situation, like office or a wedding. Real pieces from Indian brands, previewed on you before you buy.' },
  { t: 'Every combination, rated', s: 'We score every shirt, trouser and shoe pairing for you, and tell you exactly why one looks better.' },
];

export function Welcome({ onIn }: { onIn: () => void }) {
  const { catalog } = useApp();
  const [i, setI] = useState(0);
  const [auth, setAuth] = useState(false);
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const hero = useMemo(() => {
    const pick = (cats: string[], n = 0) => catalog.filter((p) => cats.includes(p.category))[n];
    return [pick(['blazer']), pick(['shirt'], 3), pick(['loafers', 'formal']), pick(['trousers'], 2)].filter(Boolean);
  }, [catalog]);

  const run = (f: () => Promise<void>) => async () => { setBusy(true); setErr(''); try { await f(); onIn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

  if (auth) return (
    <div className="welcome">
      <button className="icon-btn" onClick={() => setAuth(false)} aria-label="Back"><Icon name="back" /></button>
      <div className="col gap-lg" style={{ marginTop: 20 }}>
        <Logo size={44} word={false} />
        <h1>Create your account</h1>
        <p className="muted">Your photos and style guide are private to you.</p>
      </div>
      {isCloud() && <div className="col gap-lg">
        <label className="field">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" /></label>
        <label className="field">Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" placeholder="At least 6 characters" /></label>
        <button className="primary block" disabled={busy || !email || pw.length < 6} onClick={run(() => signUp(email, pw))}>Create account</button>
        <button className="block" disabled={busy || !email || !pw} onClick={run(() => signIn(email, pw))}>I already have an account</button>
      </div>}
      <button className="link" onClick={run(signInGuest)} disabled={busy}>{isCloud() ? 'Continue as guest' : 'Start'}</button>
      {err && <p className="issues">{err}</p>}
    </div>
  );

  return (
    <div className="welcome">
      <div className="row between"><Logo size={30} /><button className="link" onClick={() => setAuth(true)}>Sign in</button></div>
      <div className="hero-collage">
        {hero.map((p, n) => <Tile key={p.id} src={p.image} w={500} className={`t${n + 1}`} />)}
        {hero.length > 0 && <div className="float-score"><div className="score-ring" style={{ ['--v' as any]: 92, width: 44, height: 44 }}><span style={{ width: 36, height: 36, fontSize: 13 }}>9.2</span></div>
          <div className="col"><b className="small">Office look</b><span className="xs muted">Navy suits your colouring</span></div></div>}
      </div>
      <div className="col gap-lg" onClick={() => setI((i + 1) % SLIDES.length)}>
        <div className="dots">{SLIDES.map((_, n) => <span key={n} className={n === i ? 'on' : ''} />)}</div>
        <h1 style={{ fontSize: 30 }}>{SLIDES[i].t}</h1>
        <p className="ink2">{SLIDES[i].s}</p>
      </div>
      <button className="primary block pill" style={{ minHeight: 54 }} onClick={() => (i < SLIDES.length - 1 ? setI(i + 1) : setAuth(true))}>{i < SLIDES.length - 1 ? 'Next' : 'Get started'}</button>
    </div>
  );
}
