import { useMemo, useState } from 'react';
import { useApp } from '../state';
import { recommend, OCCASIONS, Occasion, Outfit, SCENES } from '../lib/recommend';
import { insert } from '../lib/store';
import { Bar, inr } from '../ui';

export function Style() {
  const { catalog, body, color, taste, refresh, toast, startTryOn, profile } = useApp();
  const [occ, setOcc] = useState<Occasion>('daily');
  const [budget, setBudget] = useState(4000);
  const [seed, setSeed] = useState(0);
  const outfits = useMemo(() => recommend(catalog, body, color, taste, occ, budget), [catalog, body, color, taste, occ, budget, seed]);
  const [ab, setAb] = useState(0);
  const pair = outfits.length >= 2 ? [outfits[ab % outfits.length], outfits[(ab + 1 + Math.floor(outfits.length / 2)) % outfits.length]] : null;

  const log = async (kind: string, outfit: Outfit) => { await insert('interactions', { kind, item_id: outfit.id, payload: { outfit: { items: outfit.items.map(slim) } } }); await refresh(); };

  return (
    <div className="page">
      <h1>Hi{profile?.name ? ` ${profile.name}` : ''} 👋</h1>
      <div className="chips">{(Object.keys(OCCASIONS) as Occasion[]).map((o) => <button key={o} className={o === occ ? 'chip on' : 'chip'} onClick={() => setOcc(o)}>{OCCASIONS[o].label}</button>)}</div>
      <label className="row gap small">Budget {inr(budget)}<input type="range" min={1000} max={10000} step={500} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></label>

      {pair && pair[0].id !== pair[1].id && <div className="card">
        <b>Which suits you better?</b><p className="muted small">Each answer teaches your stylist your taste.</p>
        <div className="ab">{pair.map((o, i) => (
          <button key={o.id} className="ab-opt" onClick={async () => { await log('pick', o); await log('reject', pair[1 - i]); setAb(ab + 2); toast('Got it. Learning your taste'); }}>
            <div className="stack">{o.items.map((it) => <img key={it.id} src={it.image} alt={it.title} />)}</div>
            <small>{o.items.map((i) => i.colorName).join(' + ')}</small>
          </button>))}
        </div>
      </div>}

      <div className="row between"><h3>Picked for you</h3><button className="link" onClick={() => setSeed(seed + 1)}>↻ Refresh</button></div>
      {!outfits.length && <p className="muted">No outfits fit this budget. Try raising it.</p>}
      {outfits.map((o) => (
        <div className="card outfit" key={o.id + seed}>
          <div className="stack big">{o.items.map((it) => <img key={it.id} src={it.image} alt={it.title} loading="lazy" />)}</div>
          <div className="row between"><b>{Math.round(o.score * 100)}% match</b><span>{inr(o.items.reduce((s, i) => s + i.price, 0))}</span></div>
          <ul className="reasons">{o.reasons.slice(0, 4).map((r) => <li key={r}>{r}</li>)}</ul>
          <details><summary className="small muted">Score breakdown</summary>{Object.entries(o.breakdown).map(([k, v]) => <Bar key={k} value={Math.max(0, Math.min(1, v))} label={k} />)}</details>
          <div className="items">{o.items.map((it) => (
            <a key={it.id} href={it.url} target="_blank" rel="noreferrer" onClick={() => log('shop', o)} className="item-link">
              <span>{it.title}<small className="muted"> · {it.brand} · {it.fit} · {inr(it.price)}</small></span><span>Shop ↗</span>
            </a>))}
          </div>
          <div className="row gap">
            <button className="primary" onClick={() => startTryOn(o.items, undefined, SCENES.find((s) => s.occasion === occ)?.id)}>👕 Try on me</button>
            <button onClick={() => log('like', o).then(() => toast('Liked'))}>👍</button>
            <button onClick={() => log('dislike', o).then(() => toast('Noted. Fewer like this'))}>👎</button>
          </div>
        </div>
      ))}
    </div>
  );
}
export const slim = (p: any) => ({ id: p.id, title: p.title, colorName: p.colorName, colorHex: p.colorHex, fit: p.fit, category: p.category, price: p.price, url: p.url, brand: p.brand });
