// Save from Myntra / Ajio / Instagram: upload a screenshot → Gemini reads it → verdict against YOUR profile.
import { useEffect, useState } from 'react';
import { useApp } from '../state';
import { compressImage, insert, list, remove, Row, update } from '../lib/store';
import { generateJSON } from '../lib/gemini';
import { paletteScore } from '../lib/color';
import { inr, Icon, ScoreChip } from '../ui';
import { savedToProduct } from '../lib/catalog';

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_clothing: { type: 'BOOLEAN' }, title: { type: 'STRING' }, brand: { type: 'STRING' }, site: { type: 'STRING' },
    price_inr: { type: 'NUMBER' }, category: { type: 'STRING' }, color_name: { type: 'STRING' }, color_hex: { type: 'STRING' },
    pattern: { type: 'STRING' }, fabric: { type: 'STRING' }, fit: { type: 'STRING' }, sizes_visible: { type: 'ARRAY', items: { type: 'STRING' } },
    verdict_score: { type: 'NUMBER' }, verdict: { type: 'STRING' }, size_advice: { type: 'STRING' }, pair_with: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['is_clothing', 'title', 'category', 'color_name', 'color_hex', 'verdict_score', 'verdict', 'size_advice', 'pair_with'],
};

export function Saved() {
  const { body, color, toast, openSituation } = useApp();
  const [items, setItems] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const load = () => list('saved_items').then(setItems);
  useEffect(() => { load(); }, []);

  const add = async (file: File) => {
    setBusy(true);
    try {
      const { blob } = await compressImage(file, 1100, 0.85);
      const prompt = `You are a men's stylist. Read this shopping screenshot (Myntra, Ajio, Amazon, Instagram, etc.). Extract the main men's garment's details exactly as shown (price in INR if visible, else 0).
Then judge it for THIS customer and give a 1-10 verdict_score:
- Body: ${body ? `${body.shape.name}; chest ${Math.round(body.chest?.value ?? 0)} cm, waist ${Math.round(body.waist?.value ?? 0)} cm; recommended top size ${body.sizes.top} (${body.sizes.topFit}), jeans waist ${body.sizes.trouserWaist}` : 'unknown'}
- Colour season: ${color ? `${color.season}; best colours ${color.best.map((c) => c.name).join(', ')}; avoid ${color.avoid.map((c) => c.name).join(', ')}` : 'unknown'}
verdict: 1-2 short, friendly sentences explaining why. size_advice: which size to pick and why (mention the brand's chart if it is visible). pair_with: 3 specific items to pair it with. color_hex: the garment's main colour.`;
      const data: any = await generateJSON(prompt, [blob], SCHEMA);
      if (data.color_hex) data.palette = paletteScore(data.color_hex, color);
      await insert('saved_items', { source_url: url || null, data }, blob, 'saved');
      setUrl(''); await load();
      toast(data.is_clothing ? 'Saved and analysed ✓' : 'Saved, but this does not look like clothing');
    } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };

  const styleIt = (it: Row) => {
    const p = savedToProduct(it);
    if (!p) { toast("Couldn't tell what garment this is. Try a clearer screenshot."); return; }
    const sit = ({ kurta: 'wedding', mojari: 'wedding', blazer: 'office', formal: 'office', shorts: 'beach', sandals: 'beach', jacket: 'winter', sweater: 'winter', coat: 'winter', boots: 'winter' } as Record<string, string>)[p.category] ?? 'casual';
    openSituation(sit, [p]);
  };

  return (
    <div className="page">
      <div className="col gap"><span className="eyebrow">From any app</span><h1>Saved finds</h1>
        <p className="ink2 small">Screenshot anything on Myntra, Ajio or Instagram. Get an honest verdict for your body and colouring, then style it into a full look.</p></div>
      <div className="card col gap-lg">
        <label className="field">Product link (optional)<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.myntra.com/…" /></label>
        <label className="btn primary block pill" style={{ minHeight: 50 }}>
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) add(f); e.target.value = ''; }} />
          {busy ? <><span className="spinner" />Analysing…</> : <><Icon name="camera" size={18} />Upload a screenshot</>}
        </label>
      </div>
      {!items.length && <div className="empty"><Icon name="saved" size={30} /><p>Nothing saved yet.</p></div>}
      {items.map((it) => {
        const d = it.data ?? {};
        return (
          <div key={it.id} className="card saved-card">
            <div className="tile"><img src={it.url} alt="" /></div>
            <div className="col gap">
              <div className="row between gap"><b className="small" style={{ lineHeight: 1.3 }}>{d.title}</b>{d.verdict_score != null && <ScoreChip v={Number(d.verdict_score)} />}</div>
              <span className="xs muted">{[d.brand, d.site, d.fabric, d.fit, d.price_inr ? inr(d.price_inr) : null].filter(Boolean).join(' · ')}</span>
              <p className="small ink2">{d.verdict}</p>
              {d.palette && <p className="xs ink2"><Icon name="palette" size={13} /> {d.palette.note}</p>}
              <p className="xs ink2"><Icon name="ruler" size={13} /> {d.size_advice}</p>
              <div className="row gap wrap" style={{ marginTop: 4 }}>
                <button className="white" style={{ minHeight: 38 }} onClick={() => styleIt(it)}><Icon name="sparkle" size={16} />Style it</button>
                {it.source_url ? <a className="btn" style={{ minHeight: 38 }} href={it.source_url} target="_blank" rel="noreferrer">Buy ↗</a>
                  : <button style={{ minHeight: 38 }} onClick={async () => { const u = prompt('Paste the product link'); if (u) { await update('saved_items', it.id, { source_url: u }); load(); } }}><Icon name="link" size={16} /></button>}
                <button className="danger" style={{ minHeight: 38 }} onClick={async () => { await remove('saved_items', it); load(); }} aria-label="Delete"><Icon name="trash" size={16} /></button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
