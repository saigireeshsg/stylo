// Outfit Studio: see YOURSELF in a full outfit (top, bottom, shoes, layer) in a chosen scene,
// with price tags pinned to each garment, swap any piece, total price and buy links.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state';
import { recommend, SCENES, Scene, OCCASIONS, Occasion } from '../lib/recommend';
import { savedToProduct, Product, Slot } from '../lib/catalog';
import { paletteScore, harmonyScore } from '../lib/color';
import { fileBlob, insert, list, Row, update } from '../lib/store';
import { tryOn } from '../lib/gemini';
import { garmentAnchors, Anchor } from '../lib/vision';
import { imageToBlob, loadImage } from '../lib/images';
import { Sheet, inr } from '../ui';
import { slim } from './Style';

const SLOT_ORDER: Slot[] = ['layer', 'top', 'bottom', 'shoes'];
const SLOT_LABEL: Record<Slot, string> = { top: 'Top', bottom: 'Bottom', layer: 'Layer', shoes: 'Shoes' };
const FALLBACK: Record<Slot, Anchor> = { layer: { x: 0.36, y: 0.3 }, top: { x: 0.5, y: 0.33 }, bottom: { x: 0.46, y: 0.6 }, shoes: { x: 0.45, y: 0.93 } };
const SIDE: Record<Slot, 'l' | 'r'> = { layer: 'l', top: 'r', bottom: 'l', shoes: 'r' };

function occasionFor(text: string): Occasion {
  const t = text.toLowerCase();
  if (/beach|goa|pool|resort|island|tropic|bali|maldives/.test(t)) return 'resort';
  if (/wedding|diwali|sangeet|haldi|puja|pooja|festiv|eid|reception|mehendi/.test(t)) return 'festive';
  if (/office|meeting|interview|work|client|presentation/.test(t)) return 'office';
  if (/date|dinner|caf|restaurant|bar|party|rooftop|club/.test(t)) return 'date';
  if (/trek|hill|mountain|manali|winter|snow|road ?trip|travel|street|mall/.test(t)) return 'weekend';
  return 'daily';
}
const keyOf = (items: Product[], sceneKey: string) => sceneKey + '|' + items.map((i) => i.id).sort().join('+');

export function Studio() {
  const { catalog, body, color, taste, photos, refresh, toast, studioSeed, go } = useApp();
  const [sceneId, setSceneId] = useState(studioSeed?.sceneId ?? 'studio');
  const [customText, setCustomText] = useState('');
  const [editingCustom, setEditingCustom] = useState(false);
  const scene: Scene = sceneId === 'custom'
    ? { id: 'custom', label: customText || 'Custom', emoji: '✏️', occasion: occasionFor(customText), prompt: customText, tip: `Styled for “${customText}”.` }
    : SCENES.find((s) => s.id === sceneId)!;

  // Taste is snapshotted per scene so the list doesn't reshuffle while you rate things
  const outfits = useMemo(() => recommend(catalog, body, color, taste, scene.occasion, 9000, 10), [catalog, body, color, scene.occasion, scene.prompt]);
  const [idx, setIdx] = useState(0);
  const [items, setItems] = useState<Product[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [renders, setRenders] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');
  const [picker, setPicker] = useState<Slot | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [buy, setBuy] = useState(false);
  const [full, setFull] = useState(false);
  const [saved, setSaved] = useState<Product[]>([]);

  useEffect(() => { list('tryons').then(setRenders); list('saved_items').then((r) => setSaved(r.map(savedToProduct).filter(Boolean) as Product[])); }, []);

  // Seeded from "Try on me" elsewhere: keep the seeded pieces, fill the missing slots from the best outfit
  useEffect(() => {
    if (!studioSeed?.items?.length || !outfits.length) return;
    const have = new Set(studioSeed.items.map((i) => i.slot));
    setItems([...studioSeed.items, ...outfits[0].items.filter((i) => !have.has(i.slot))]);
    setReasons(['Your pick, completed by your stylist']);
  }, [studioSeed?.nonce, outfits.length > 0]);
  useEffect(() => {
    if (studioSeed?.items?.length && idx === 0 && items.length) return;
    const o = outfits[idx % Math.max(1, outfits.length)];
    if (o) { setItems(o.items); setReasons(o.reasons); }
  }, [outfits, idx]);

  const sceneKey = scene.id === 'custom' ? 'custom:' + scene.prompt.toLowerCase().trim() : scene.id;
  const key = keyOf(items, sceneKey);
  const render = renders.find((r) => r.item?.key === key);
  const front = photos.filter((p) => p.kind === 'front' && p.analysis?.ok).sort((a, b) => b.analysis.quality - a.analysis.quality)[0] ?? photos[0];
  const total = items.reduce((s, i) => s + i.price, 0);
  const bySlot = (s: Slot) => items.find((i) => i.slot === s);

  const generate = async () => {
    if (!front) return toast('Add a full-body photo first (Me tab).');
    try {
      setBusy('Getting your photo and the garments…');
      const person = await fileBlob(front.path!);
      const ordered = SLOT_ORDER.map(bySlot).filter(Boolean) as Product[];
      const garments = await Promise.all(ordered.map((i) => imageToBlob(i.image)));
      let desc = ordered.map((i, n) => `image ${n + 2} is the ${SLOT_LABEL[i.slot].toLowerCase()}: ${i.colorName} ${i.fit}-fit ${i.category} ("${i.title}")`).join('; ');
      if (ordered.some((i) => i.source.includes('screenshot'))) desc += '. Some garment images are shopping screenshots: use only the garment, ignore the model, the UI and any text';
      if (body) desc += `. He wears size ${body.sizes.top} tops (${body.sizes.topFit}) and ${body.sizes.trouserWaist} waist trousers; make the fit look true to that size`;
      setBusy(`Dressing you for ${scene.label.toLowerCase()}… (10–30 s)`);
      const blob = await tryOn(person, garments, desc, scene.prompt);
      setBusy('Pinning the price tags…');
      const row = await insert('tryons', { item: { key, scene: scene.label, items: ordered.map(slim) } }, blob, 'tryons');
      const anchors = await garmentAnchors(await loadImage(row.url!)).catch(() => null);
      if (anchors) { row.item.anchors = anchors; await update('tryons', row.id, { item: row.item }); }
      setRenders([row, ...renders]);
      refresh();
    } catch (e: any) { toast(e.message); } finally { setBusy(''); }
  };

  const swap = (p: Product | null, slot: Slot) => {
    setItems([...items.filter((i) => i.slot !== slot), ...(p ? [p] : [])]);
    setReasons(['Your custom combination']);
    setPicker(null);
  };
  const alternatives = (slot: Slot) => {
    const occ = OCCASIONS[scene.occasion];
    const allowed: readonly string[] | null = slot === 'top' ? occ.tops : slot === 'bottom' ? occ.bottoms : slot === 'shoes' ? occ.shoes : null;
    const others = items.filter((i) => i.slot !== slot);
    const rank = (p: Product) => {
      const pal = slot === 'top' || slot === 'layer' ? paletteScore(p.colorHex, color).score : 0.6;
      const har = others.length ? others.reduce((s, o) => s + harmonyScore(p.colorHex, o.colorHex).score, 0) / others.length : 0.6;
      return pal * 0.5 + har * 0.5 + (allowed && allowed.includes(p.category) ? 0.2 : 0);
    };
    const pool = [...saved, ...catalog].filter((p) => p.slot === slot);
    return pool.map((p) => ({ p, s: rank(p) })).sort((a, b) => b.s - a.s);
  };
  const rate = async (n: number) => {
    if (!render) return;
    await update('tryons', render.id, { rating: n });
    await insert('interactions', { kind: 'rate', item_id: render.id, payload: { rating: n, outfit: { items: render.item.items } } });
    setRenders(renders.map((r) => (r.id === render.id ? { ...r, rating: n } : r)));
    refresh(); toast(n >= 4 ? 'Great. More like this' : 'Noted. Your stylist will adjust');
  };
  const share = async () => {
    if (!render?.url) return;
    try {
      const b = await (await fetch(render.url)).blob();
      const file = new File([b], 'my-look.png', { type: b.type });
      if ((navigator as any).canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My look', text: items.map((i) => `${i.title} ${inr(i.price)}`).join('\n') });
      else { const a = document.createElement('a'); a.href = render.url; a.download = 'my-look.png'; a.click(); }
    } catch { /* cancelled */ }
  };

  const anchors: Record<Slot, Anchor> = { ...FALLBACK, ...(render?.item?.anchors ?? {}) };

  return (
    <div className="page studio">
      <header className="studio-head">
        <div><h1>Your outfit</h1><p className="muted small">{scene.emoji} {scene.tip}</p></div>
        <div className="row gap">
          <button className="icon round" onClick={() => go('chat')} aria-label="Ask your stylist">💬</button>
          <button className="icon round" onClick={() => go('tryon')} aria-label="My looks">🗂</button>
          <button className="icon round" onClick={share} disabled={!render} aria-label="Share">⤴</button>
        </div>
      </header>

      <div className="chips">
        {SCENES.map((s) => <button key={s.id} className={s.id === sceneId ? 'chip on' : 'chip'} onClick={() => { setSceneId(s.id); setIdx(0); }}>{s.emoji} {s.label}</button>)}
        <button className={sceneId === 'custom' ? 'chip on' : 'chip'} onClick={() => setEditingCustom(true)}>✏️ {sceneId === 'custom' ? customText : 'Anywhere…'}</button>
      </div>
      {editingCustom && <form className="row gap" onSubmit={(e) => { e.preventDefault(); if (customText.trim()) { setSceneId('custom'); setIdx(0); setEditingCustom(false); } }}>
        <input style={{ flex: 1 }} autoFocus value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="e.g. Sunset cruise in Goa, Diwali at home" />
        <button className="primary">Go</button>
      </form>}

      <div className="frame">
        {render ? <>
          <img src={render.url} alt="You wearing this outfit" onClick={() => setFull(true)} />
          <svg className="leaders" viewBox="0 0 100 100" preserveAspectRatio="none">
            {items.map((i) => { const a = anchors[i.slot]; const lx = SIDE[i.slot] === 'l' ? 14 : 86; return <line key={i.id} x1={lx} y1={a.y * 100} x2={a.x * 100} y2={a.y * 100} />; })}
          </svg>
          {items.map((i) => { const a = anchors[i.slot]; return (
            <span key={i.id} className="dot" style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }} />
          ); })}
          {items.map((i) => { const a = anchors[i.slot]; return (
            <button key={i.id} className={`pricetag ${SIDE[i.slot]}`} style={{ top: `${a.y * 100}%` }} onClick={() => setDetail(i)}>{inr(i.price)}</button>
          ); })}
          <button className="expand" onClick={() => setFull(true)} aria-label="Expand">⤢</button>
        </> : <>
          {front?.url ? <img className="ghost" src={front.url} alt="" /> : <div className="ghost" />}
          <div className="frame-cta">
            <div className="flatlay">{SLOT_ORDER.map(bySlot).filter(Boolean).map((i) => <img key={i!.id} src={i!.image} alt={i!.title} />)}</div>
            {busy ? <div className="busy light"><span className="spinner" />{busy}</div>
              : <button className="primary big" onClick={generate}>✨ See me in this{scene.id !== 'studio' ? ` · ${scene.label}` : ''}</button>}
            <small>AI preview on your own photo</small>
          </div>
        </>}
      </div>

      {render && <div className="row between">
        <span className="small muted">How do you look?</span>
        <div className="stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={n <= (render.rating ?? 0) ? 'on' : ''} onClick={() => rate(n)} aria-label={`${n} stars`}>★</button>)}</div>
      </div>}

      <div className="strip">
        <div className="strip-item you">{front?.url && <img src={front.url} alt="" />}<small>Your photo</small></div>
        {SLOT_ORDER.map((s) => { const i = bySlot(s); return i ? (
          <button key={s} className="strip-item" onClick={() => setPicker(s)}><img src={i.image} alt={i.title} /><small>{inr(i.price)}</small><span className="swap">⇄</span></button>
        ) : (s === 'layer' || s === 'shoes') ? (
          <button key={s} className="strip-item add" onClick={() => setPicker(s)}><span>＋</span><small>{SLOT_LABEL[s]}</small></button>
        ) : null; })}
      </div>

      {reasons.length > 0 && <ul className="reasons small">{reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>}

      <div className="pager">
        <button className="icon" disabled={idx === 0} onClick={() => setIdx(idx - 1)} aria-label="Previous">←</button>
        <b>{String((idx % Math.max(1, outfits.length)) + 1).padStart(2, '0')} / {String(outfits.length).padStart(2, '0')}</b>
        <button className="accent" onClick={() => setIdx(idx + 1)}>＋ Another</button>
      </div>

      <div className="buybar">
        <div><small>TOTAL OUTFIT PRICE</small><b>{inr(total)}</b></div>
        <button className="primary" onClick={() => setBuy(true)}>🛍 Buy outfit</button>
      </div>

      <Sheet open={!!picker} onClose={() => setPicker(null)} title={picker ? `Choose ${SLOT_LABEL[picker].toLowerCase()}` : ''}>
        {picker && <>
          {(picker === 'layer' || picker === 'shoes') && bySlot(picker) && <button onClick={() => swap(null, picker)}>Remove {SLOT_LABEL[picker].toLowerCase()}</button>}
          <p className="muted small">Ranked by how well each piece suits your colouring and the rest of this outfit. Your saved screenshots show first.</p>
          <div className="pick-grid">{alternatives(picker).slice(0, 40).map(({ p, s }) => (
            <button key={p.id} className={`pick ${bySlot(picker)?.id === p.id ? 'on' : ''}`} onClick={() => swap(p, picker)}>
              <img src={p.image} alt="" loading="lazy" /><small className="clip">{p.title}</small><small><b>{inr(p.price)}</b> · {Math.min(99, Math.round((s / 1.2) * 100))}% match</small>
              {p.source.includes('screenshot') && <span className="tag">saved</span>}
            </button>))}
          </div>
        </>}
      </Sheet>

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.title}>
        {detail && <>
          <img className="detail-img" src={detail.image} alt="" />
          <p><b>{inr(detail.price)}</b> · {detail.brand} · {detail.fit} fit{detail.fabric ? ` · ${detail.fabric}` : ''}</p>
          {body && <p className="small">📏 Your size: <b>{detail.slot === 'bottom' ? `${body.sizes.trouserWaist} waist` : detail.slot === 'shoes' ? 'your usual UK size' : body.sizes.top}</b>{detail.slot === 'top' ? ` (${body.sizes.topFit})` : ''}</p>}
          {(detail.slot === 'top' || detail.slot === 'layer') && <p className="small">🎨 {paletteScore(detail.colorHex, color).note}</p>}
          <div className="row gap"><a className="btn primary" href={detail.url} target="_blank" rel="noreferrer" onClick={() => insert('interactions', { kind: 'shop', item_id: detail.id, payload: { item: slim(detail) } })}>Buy on {detail.source.replace(/^www\./, '')} ↗</a>
            <button onClick={() => { setPicker(detail.slot); setDetail(null); }}>⇄ Swap</button></div>
        </>}
      </Sheet>

      <Sheet open={buy} onClose={() => setBuy(false)} title={`Buy this outfit · ${inr(total)}`}>
        <p className="muted small">Each piece opens on its store. Sizes picked for you are shown.</p>
        {SLOT_ORDER.map(bySlot).filter(Boolean).map((i) => (
          <a key={i!.id} className="item-link" href={i!.url} target="_blank" rel="noreferrer" onClick={() => insert('interactions', { kind: 'shop', item_id: i!.id, payload: { item: slim(i) } })}>
            <img src={i!.image} alt="" /><span>{i!.title}<small className="muted"> · {body ? (i!.slot === 'bottom' ? `size ${body.sizes.trouserWaist}` : i!.slot === 'shoes' ? 'your UK size' : `size ${body.sizes.top}`) : ''}</small></span><b>{inr(i!.price)} ↗</b>
          </a>))}
      </Sheet>

      {full && render && <div className="lightbox" onClick={() => setFull(false)}><img src={render.url} alt="" /></div>}
    </div>
  );
}
