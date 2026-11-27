// A situation (Office, Casual, Wedding…): see the outfit on YOU, every combination rated with reasons,
// build your own from real products, mix & match picks, Gemini stylist judging, buy links.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state';
import { situationById, rateAll, scoreLook, itemScore, fitsSlot, Look, Picks } from '../lib/recommend';
import { CATEGORY_LABEL, SLOT_LABEL, Product, Slot, proxied, slim, storeName } from '../lib/catalog';
import { paletteScore } from '../lib/color';
import { fileBlob, insert, list, Row, update, upsertRatings, currentUserId } from '../lib/store';
import { tryOn } from '../lib/gemini';
import { judgeLooks, finalScore } from '../lib/judge';
import { garmentAnchors, Anchor } from '../lib/vision';
import { imageToBlob, loadImage } from '../lib/images';
import { getConfig } from '../lib/config';
import { Icon, Tile, Collage, ProductCard, ScoreRing, ScoreChip, Sheet, inr } from '../ui';

const ORDER: Slot[] = ['layer', 'top', 'bottom', 'shoes'];
const FALLBACK: Record<Slot, Anchor> = { layer: { x: 0.36, y: 0.3 }, top: { x: 0.52, y: 0.33 }, bottom: { x: 0.46, y: 0.6 }, shoes: { x: 0.45, y: 0.93 } };
const SIDE: Record<Slot, 'l' | 'r'> = { layer: 'l', top: 'r', bottom: 'l', shoes: 'r' };
const BREAK_LABEL: Record<string, string> = { palette: 'Your colours', harmony: 'Colour harmony', occasion: 'Occasion fit', bodyFit: 'Body fit', taste: 'Your taste', size: 'Size stock', budget: 'Budget' };

export function Situation() {
  const { route, closeSituation, catalog, body, color, taste, photos, toast, refresh, go } = useApp();
  const sit = situationById(route.situation!);
  const [budget, setBudget] = useState(sit.id === 'wedding' ? 15000 : 9000);
  const [withLayer, setWithLayer] = useState(false);
  const [picks, setPicks] = useState<Picks>({});
  const [ai, setAi] = useState<Record<string, Look['ai']>>({});
  const [current, setCurrent] = useState<Product[] | null>(null);
  const [renders, setRenders] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');
  const [judging, setJudging] = useState(false);
  const [tab, setTab] = useState<Slot>('top');
  const [cat, setCat] = useState<string>('all');
  const [showN, setShowN] = useState(24);
  const [sheet, setSheet] = useState<Product | null>(null);
  const [all, setAll] = useState(false);
  const [buy, setBuy] = useState(false);
  const [full, setFull] = useState(false);

  const { looks, counts } = useMemo(() => rateAll(catalog, sit, color, body, taste, budget, picks, withLayer), [catalog, sit.id, color, body, budget, picks, withLayer]);
  const withAi = (l: Look): Look => (ai[l.key] ? { ...l, ai: ai[l.key] } : l);
  const ranked = useMemo(() => looks.map(withAi).sort((a, b) => finalScore(b) - finalScore(a)), [looks, ai]);

  // Load previous Gemini ratings + try-ons for this situation
  useEffect(() => {
    list('outfit_ratings', 500).then((rows) => setAi(Object.fromEntries(rows.filter((r) => r.situation === sit.id && r.ai_score != null).map((r) => [r.outfit_key, { score: Number(r.ai_score), verdict: r.ai_verdict, tip: r.ai_tip }]))));
    list('tryons', 200).then(setRenders);
  }, [sit.id]);
  // Start from the seed (e.g. a saved screenshot) completed by the best look, else the top look
  useEffect(() => {
    if (current || !looks.length) return;
    const seed = route.seed ?? [];
    const have = new Set(seed.map((s) => s.slot));
    setCurrent([...seed, ...looks[0].items.filter((i) => !have.has(i.slot))]);
  }, [looks.length]);
  // Persist the rated combinations (top 40) so ratings are stored per user + situation
  useEffect(() => {
    if (!ranked.length) return;
    const t = setTimeout(async () => {
      if (!(await currentUserId())) return;
      upsertRatings(ranked.slice(0, 40).map((l) => ({
        outfit_key: l.key, situation: sit.id, items: l.items.map(slim), local_score: l.score, breakdown: l.breakdown, reasons: l.reasons,
        ai_score: l.ai?.score ?? null, ai_verdict: l.ai?.verdict ?? null, ai_tip: l.ai?.tip ?? null, final_score: finalScore(l),
      }))).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [ranked]);

  const items = current ?? [];
  const look = items.length >= 3 && items.some((i) => i.slot === 'top') && items.some((i) => i.slot === 'bottom') ? withAi(scoreLook(items, sit, color, body, taste, budget)) : null;
  const by = (s: Slot) => items.find((i) => i.slot === s);
  const total = items.reduce((s, i) => s + i.price, 0);
  const renderKey = `${sit.id}|${look?.key}`;
  const render = renders.find((r) => r.item?.key === renderKey);
  const front = photos.filter((p) => p.kind === 'front' && p.analysis?.ok).sort((a, b) => b.analysis.quality - a.analysis.quality)[0] ?? photos[0];
  const anchors: Record<Slot, Anchor> = { ...FALLBACK, ...(render?.item?.anchors ?? {}) };

  const wear = (p: Product) => {
    setCurrent([...items.filter((i) => i.slot !== p.slot), p]);
    insert('interactions', { kind: 'wear', item_id: p.id, payload: { item: slim(p) } }).catch(() => {});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const removeSlot = (s: Slot) => setCurrent(items.filter((i) => i.slot !== s));
  const toggleMix = (p: Product) => {
    const cur = picks[p.slot] ?? [];
    const next = cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [...cur, p];
    setPicks({ ...picks, [p.slot]: next.length ? next : undefined });
    if (p.slot === 'layer') setWithLayer(true);
  };
  const inMix = (p: Product) => !!picks[p.slot]?.some((x) => x.id === p.id);
  const mixCount = Object.values(picks).reduce((n, a) => n + (a?.length ?? 0), 0);

  const judge = async () => {
    if (!getConfig().geminiKey) { toast('Add your Gemini key in Me → Settings to get stylist ratings'); return; }
    setJudging(true);
    try {
      const top = ranked.filter((l) => !l.ai).slice(0, 12);
      const judged = await judgeLooks(top, sit, body, color);
      setAi({ ...ai, ...Object.fromEntries(judged.filter((l) => l.ai).map((l) => [l.key, l.ai])) });
      toast(`Stylist rated ${judged.filter((l) => l.ai).length} looks`);
    } catch (e: any) { toast(e.message); } finally { setJudging(false); }
  };

  const generate = async () => {
    if (!front) { toast('Add a full-body photo first (Me tab)'); return; }
    if (!look) return;
    try {
      setBusy('Preparing your photo and the pieces…');
      const person = await fileBlob(front.path!);
      const ordered = ORDER.map(by).filter(Boolean) as Product[];
      const garments = await Promise.all(ordered.map((i) => imageToBlob(i.image.startsWith('http') && !i.source.includes('screenshot') ? proxied(i.image) : i.image)));
      let desc = ordered.map((i, n) => `image ${n + 2} is the ${SLOT_LABEL[i.slot].toLowerCase()}: ${i.brand} ${i.colorName} ${i.fit}-fit ${CATEGORY_LABEL[i.category]?.toLowerCase() ?? i.category} ("${i.title}")`).join('; ');
      desc += '. Product photos may show a model or mannequin: use only the garment itself';
      if (body) desc += `. He wears size ${body.sizes.top} tops (${body.sizes.topFit}) and ${body.sizes.trouserWaist} waist trousers; make the fit true to that size`;
      setBusy(`Dressing you for ${sit.label.toLowerCase()}… about 20 seconds`);
      const blob = await tryOn(person, garments, desc, sit.scene);
      setBusy('Pinning the price tags…');
      const row = await insert('tryons', { item: { key: renderKey, scene: sit.label, situation: sit.id, score: finalScore(look), items: ordered.map(slim) } }, blob, 'tryons');
      const a = await garmentAnchors(await loadImage(row.url!)).catch(() => null);
      if (a) { row.item.anchors = a; await update('tryons', row.id, { item: row.item }); }
      setRenders([row, ...renders]); refresh();
    } catch (e: any) { toast(e.message); } finally { setBusy(''); }
  };
  const rate = async (n: number) => {
    if (!render) return;
    await update('tryons', render.id, { rating: n });
    await insert('interactions', { kind: 'rate', item_id: render.id, payload: { rating: n, outfit: { items: render.item.items } } });
    setRenders(renders.map((r) => (r.id === render.id ? { ...r, rating: n } : r))); refresh();
    toast(n >= 4 ? 'Noted. More looks like this' : 'Noted. Your stylist will adjust');
  };
  const share = async () => {
    if (!render?.url) { toast('Preview the look on you first'); return; }
    try {
      const b = await (await fetch(render.url)).blob();
      const file = new File([b], 'my-look.png', { type: b.type });
      if ((navigator as any).canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `My ${sit.label} look`, text: items.map((i) => `${i.brand} ${i.title} · ${inr(i.price)}`).join('\n') });
      else { const a = document.createElement('a'); a.href = render.url; a.download = 'my-look.png'; a.click(); }
    } catch { /* cancelled */ }
  };

  // Build-your-own grid
  const slotsHere = ORDER.filter((s) => sit.slots[s as 'top']);
  const cats = sit.slots[tab as 'top']?.cats ?? [];
  const grid = useMemo(() => catalog.filter((p) => fitsSlot(p, sit, tab) && (cat === 'all' || p.category === cat))
    .map((p) => ({ p, v: itemScore(p, color, body, taste) })).sort((a, b) => b.v - a.v), [catalog, sit.id, tab, cat, color, body]);
  const badgeFor = (p: Product) => { const s = paletteScore(p.colorHex, color).score; return p.slot !== 'bottom' && p.slot !== 'shoes' && s >= 0.78 ? 'Suits your colouring' : undefined; };

  const final = look ? finalScore(look) : 0;

  return (
    <>
      <div className="topbar">
        <button className="icon-btn" onClick={closeSituation} aria-label="Back"><Icon name="back" /></button>
        <div className="title">{sit.label}</div>
        <button className="icon-btn" onClick={share} aria-label="Share"><Icon name="share" /></button>
      </div>
      <div className="page" style={{ paddingTop: 0, paddingBottom: 120 }}>
        <p className="small ink2" style={{ marginTop: -6 }}>{sit.tip}</p>
        <div className="chips">{[[5000, 'Under ₹5k'], [9000, 'Under ₹9k'], [15000, 'Under ₹15k'], [30000, 'Premium']].map(([v, l]) => (
          <button key={v} className={budget === v ? 'chip on' : 'chip'} style={{ minHeight: 32, padding: '6px 12px', fontSize: 12.5 }} onClick={() => { setBudget(v as number); setCurrent(null); }}>{l}</button>))}</div>

        {/* ---------- The look on you ---------- */}
        <div className="frame">
          {render ? <>
            <img className="photo" src={render.url} alt="You wearing this outfit" onClick={() => setFull(true)} />
            <svg className="leaders" viewBox="0 0 100 100" preserveAspectRatio="none">
              {items.map((i) => { const a = anchors[i.slot]; const lx = SIDE[i.slot] === 'l' ? 15 : 85; return <line key={i.id} x1={lx} y1={a.y * 100} x2={a.x * 100} y2={a.y * 100} />; })}
            </svg>
            {items.map((i) => <span key={'d' + i.id} className="dot" style={{ left: `${anchors[i.slot].x * 100}%`, top: `${anchors[i.slot].y * 100}%` }} />)}
            {items.map((i) => <button key={'p' + i.id} className={`pricetag ${SIDE[i.slot]}`} style={{ top: `${anchors[i.slot].y * 100}%` }} onClick={() => setSheet(i)}>{inr(i.price)}</button>)}
            <span className="scene-tag">AI preview</span>
            <div className="corner"><button onClick={() => setFull(true)} aria-label="Expand"><Icon name="expand" size={18} /></button></div>
          </> : <>
            {front?.url ? <img className="photo" src={front.url} alt="Your photo" /> : <div className="photo" />}
            <div className="shade" />
            <span className="scene-tag">You · {sit.label}</span>
            <div className="frame-bottom">
              <div className="frame-items">{ORDER.map(by).filter(Boolean).map((i) => <Tile key={i!.id} src={i!.image} w={160} />)}</div>
              {busy ? <div className="busy"><span className="spinner" />{busy}</div>
                : <button className="white block pill" onClick={generate} disabled={!look}><Icon name="sparkle" size={18} />Preview this look on me</button>}
            </div>
          </>}
        </div>
        {render && <div className="row between">
          <span className="small muted">How do you look in it?</span>
          <div className="stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={n <= (render.rating ?? 0) ? 'on' : ''} onClick={() => rate(n)} aria-label={`${n} stars`}>★</button>)}</div>
        </div>}

        {/* ---------- Rating & why ---------- */}
        {look && <div className="card col gap-lg">
          <div className="row gap-lg">
            <ScoreRing v={final} />
            <div className="col grow" style={{ gap: 2 }}>
              <span className="eyebrow">{look.ai ? 'Stylist rating' : 'Our rating for you'}</span>
              <h2>{final >= 8.5 ? 'Excellent on you' : final >= 7.5 ? 'Looks great on you' : final >= 6.5 ? 'Good, with a tweak' : 'Not your best'}</h2>
              <span className="xs muted">Ranked #{Math.max(1, ranked.findIndex((l) => l.key === look.key) + 1) || '–'} of {ranked.length} combinations</span>
            </div>
          </div>
          {look.ai && <div className="ai-box"><b>“{look.ai.verdict}”</b><span className="small ink2">Tip: {look.ai.tip}</span></div>}
          <ul className="why">{look.reasons.map((r) => <li key={r}>{r}</li>)}{look.caution && <li className="warn">{look.caution}</li>}</ul>
          <details><summary className="small">Score breakdown</summary>
            <div className="bars" style={{ marginTop: 10 }}>{Object.entries(look.breakdown).flatMap(([k, v]) => { const x = Math.max(0, Math.min(1, v)); return [<span key={k + 'l'}>{BREAK_LABEL[k] ?? k}</span>, <div key={k + 't'} className="track"><div className="fill" style={{ width: `${x * 100}%` }} /></div>, <b key={k + 'v'}>{Math.round(x * 10)}</b>]; })}</div>
          </details>
        </div>}

        {/* ---------- Current outfit ---------- */}
        <div className="section">
          <div className="section-head"><h2>This look</h2>
            {sit.slots.layer && !sit.slots.layer.required && <button className="link" onClick={() => { if (by('layer')) removeSlot('layer'); else { setTab('layer'); document.getElementById('build')?.scrollIntoView({ behavior: 'smooth' }); } }}>{by('layer') ? 'Remove layer' : `+ Add ${sit.slots.layer.cats[0]}`}</button>}
          </div>
          <div className="outfit-strip">{ORDER.map(by).filter(Boolean).map((i) => (
            <button key={i!.id} className="oitem" onClick={() => setSheet(i!)}><Tile src={i!.image} w={300} /><small className="clip">{i!.brand}</small><b>{inr(i!.price)}</b></button>
          ))}</div>
        </div>

        {/* ---------- Rated combinations ---------- */}
        <div className="section">
          <div className="section-head"><h2>Top rated for you</h2><button className="link" onClick={() => setAll(true)}>All {ranked.length} ›</button></div>
          <p className="xs muted">{counts.top} tops × {counts.bottom} bottoms × {counts.shoes} shoes{counts.layer ? ` × ${counts.layer} layers` : ''}, every combination scored on your colours, build, occasion and taste.</p>
          <div className="hscroll">{ranked.slice(0, 10).map((l, n) => (
            <button key={l.key} className={`lookcard ${look?.key === l.key ? 'on' : ''}`} onClick={() => { setCurrent(l.items); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              <Collage items={l.items} />
              <div className="row between"><span className="rank">#{n + 1}</span><ScoreChip v={finalScore(l)} /></div>
              <span className="small ink2" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.ai?.verdict ?? l.reasons[0] ?? ''}</span>
            </button>
          ))}</div>
          <div className="row gap">
            <button className="blue grow" onClick={judge} disabled={judging || !ranked.length}>{judging ? <><span className="spinner" />Stylist is rating…</> : <><Icon name="sparkle" size={18} />Get stylist ratings</>}</button>
            {sit.slots.layer && !sit.slots.layer.required && <button className={withLayer ? 'white' : ''} onClick={() => setWithLayer(!withLayer)}>{withLayer ? '✓ ' : '+ '}{CATEGORY_LABEL[sit.slots.layer.cats[0]]}</button>}
          </div>
        </div>

        {/* ---------- Build your own ---------- */}
        <div className="section" id="build">
          <div className="section-head"><h2>Build your own</h2><span className="xs muted">Wear one, or Mix several to compare</span></div>
          <div className="chips">{slotsHere.map((s) => <button key={s} className={tab === s ? 'chip on' : 'chip'} onClick={() => { setTab(s); setCat('all'); setShowN(24); }}>{s === 'top' ? 'Tops' : s === 'bottom' ? 'Bottoms' : s === 'shoes' ? 'Shoes' : 'Layers'}</button>)}</div>
          {cats.length > 1 && <div className="chips">{['all', ...cats].map((c) => <button key={c} className={cat === c ? 'chip on' : 'chip'} style={{ minHeight: 30, padding: '5px 12px', fontSize: 12 }} onClick={() => { setCat(c); setShowN(24); }}>{c === 'all' ? 'All' : CATEGORY_LABEL[c] ?? c}</button>)}</div>}
          <div className="pgrid">{grid.slice(0, showN).map(({ p }) => (
            <ProductCard key={p.id} p={p} badge={badgeFor(p)} wearing={by(p.slot)?.id === p.id} onOpen={() => setSheet(p)}
              actions={<><button onClick={() => wear(p)} className={by(p.slot)?.id === p.id ? 'on' : ''}>{by(p.slot)?.id === p.id ? 'Wearing' : 'Wear'}</button><button className={inMix(p) ? 'on' : ''} onClick={() => toggleMix(p)}>{inMix(p) ? '✓ Mix' : '+ Mix'}</button></>} />
          ))}</div>
          {grid.length > showN && <button onClick={() => setShowN(showN + 24)}>Show more ({grid.length - showN} more)</button>}
          {!grid.length && <div className="empty">No pieces here yet.</div>}
        </div>

        {mixCount > 0 && <div className="mixbar">
          <div className="grow col"><b className="small">Mixing your picks</b><span className="xs ink2">{counts.top} × {counts.bottom} × {counts.shoes}{counts.layer ? ` × ${counts.layer}` : ''} = {looks.length} looks rated</span></div>
          <button className="link" onClick={() => setPicks({})}>Clear</button>
          <button className="blue" style={{ minHeight: 38 }} onClick={() => setAll(true)}>See ranking</button>
        </div>}
      </div>

      <div className="buybar">
        <div><small>TOTAL OUTFIT PRICE</small><b>{inr(total)}</b></div>
        <button className="primary pill" onClick={() => setBuy(true)} disabled={!items.length}><Icon name="bag" size={18} />Buy outfit</button>
      </div>

      {/* ---------- Sheets ---------- */}
      <Sheet open={all} onClose={() => setAll(false)} title={`${ranked.length} combinations, ranked`}>
        <p className="small muted">Scores combine your colour palette, colour harmony, occasion fit, body fit and taste.{Object.keys(ai).length ? ' Looks marked ✦ were also rated by the stylist model.' : ''}</p>
        {ranked.slice(0, 60).map((l, n) => (
          <button key={l.key} className="lookrow" onClick={() => { setCurrent(l.items); setAll(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <Collage items={l.items} w={160} />
            <div className="col" style={{ gap: 5 }}>
              <div className="row between"><span className="rank">#{n + 1}{l.ai ? ' ✦' : ''}</span><ScoreChip v={finalScore(l)} /></div>
              <span className="small clip" style={{ fontWeight: 600 }}>{l.items.map((i) => i.colorName).join(' · ')}</span>
              <span className="xs ink2">{l.ai?.verdict ?? l.reasons.slice(0, 2).join('. ')}</span>
              <span className="xs muted">{inr(l.items.reduce((s, i) => s + i.price, 0))}</span>
            </div>
          </button>
        ))}
      </Sheet>

      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet?.brand}>
        {sheet && <>
          <div className="gallery">{(sheet.images.length ? sheet.images : [sheet.image]).map((u) => <Tile key={u} src={u} w={800} />)}</div>
          <div className="col gap">
            <span className="small ink2">{sheet.title}</span>
            <span><span className="price" style={{ fontSize: 20 }}>{inr(sheet.price)}</span>{sheet.compareAt ? <span className="mrp">{inr(sheet.compareAt)}</span> : null}</span>
            <span className="xs muted">{[CATEGORY_LABEL[sheet.category], sheet.colorName, `${sheet.fit} fit`, sheet.fabric].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="card col gap" style={{ padding: 12 }}>
            {body && <span className="small"><Icon name="ruler" size={14} /> Your size: <b>{sheet.slot === 'bottom' ? `${body.sizes.trouserWaist} waist` : sheet.slot === 'shoes' ? 'your usual UK size' : body.sizes.top}</b>{sheet.sizes.length ? <span className="muted"> · available {sheet.sizes.slice(0, 8).join(', ')}</span> : null}</span>}
            {sheet.slot !== 'shoes' && <span className="small"><Icon name="palette" size={14} /> {paletteScore(sheet.colorHex, color).note}</span>}
          </div>
          <div className="row gap">
            <button className="white grow" onClick={() => { wear(sheet); setSheet(null); }}>{by(sheet.slot)?.id === sheet.id ? 'Wearing' : 'Wear in this look'}</button>
            <button onClick={() => toggleMix(sheet)}>{inMix(sheet) ? '✓ In mix' : '+ Mix'}</button>
          </div>
          <a className="btn primary block" href={sheet.url} target="_blank" rel="noreferrer" onClick={() => insert('interactions', { kind: 'shop', item_id: sheet.id, payload: { item: slim(sheet) } }).catch(() => {})}>Buy on {storeName(sheet)} ↗</a>
        </>}
      </Sheet>

      <Sheet open={buy} onClose={() => setBuy(false)} title={`Buy this look · ${inr(total)}`}>
        <p className="small muted">Each piece opens on the brand's store. Pick the size shown.</p>
        {ORDER.map(by).filter(Boolean).map((i) => (
          <a key={i!.id} className="item-link" href={i!.url} target="_blank" rel="noreferrer" onClick={() => insert('interactions', { kind: 'shop', item_id: i!.id, payload: { item: slim(i!) } }).catch(() => {})}>
            <Tile src={i!.image} w={120} />
            <span className="grow col"><b className="small clip">{i!.brand}</b><span className="xs ink2 clip">{i!.title}</span><span className="xs muted">{body ? (i!.slot === 'bottom' ? `Size ${body.sizes.trouserWaist}` : i!.slot === 'shoes' ? 'Your UK size' : `Size ${body.sizes.top}`) : ''}</span></span>
            <b>{inr(i!.price)} ↗</b>
          </a>))}
        <button onClick={() => { setBuy(false); go('chat'); }}><Icon name="chat" size={18} />Ask the stylist about this look</button>
      </Sheet>

      {full && render && <div className="lightbox" onClick={() => setFull(false)}><img src={render.url} alt="" /></div>}
    </>
  );
}
