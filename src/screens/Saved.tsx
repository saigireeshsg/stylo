// Save from Myntra / Ajio / Instagram: upload a screenshot → Gemini reads it → verdict against YOUR profile.
import { useEffect, useState } from 'react';
import { useApp } from '../state';
import { compressImage, insert, list, remove, Row, update } from '../lib/store';
import { generateJSON } from '../lib/gemini';
import { paletteScore } from '../lib/color';
import { inr } from '../ui';

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
  const { body, color, toast, startTryOn } = useApp();
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

  return (
    <div className="page">
      <h1>Saved finds</h1>
      <p className="muted">Screenshot anything on Myntra, Ajio or Instagram and drop it here. You'll get an honest verdict for <i>your</i> body and colouring.</p>
      <label>Product link (optional, so you can buy later)<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.myntra.com/…" /></label>
      <label className="primary upload">
        <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) add(f); e.target.value = ''; }} />
        {busy ? 'Analysing…' : '📸 Upload screenshot'}
      </label>
      {items.map((it) => {
        const d = it.data ?? {};
        return (
          <div key={it.id} className="card saved">
            <img src={it.url} alt="" />
            <div>
              <div className="row between"><b>{d.title}</b><span className={`score s${Math.round(d.verdict_score)}`}>{d.verdict_score}/10</span></div>
              <small className="muted">{[d.brand, d.site, d.fabric, d.fit, d.price_inr ? inr(d.price_inr) : null].filter(Boolean).join(' · ')}</small>
              <p>{d.verdict}</p>
              {d.palette && <p className="small">🎨 {d.palette.note}</p>}
              <p className="small">📏 {d.size_advice}</p>
              {d.pair_with?.length > 0 && <p className="small">🧩 Pair with: {d.pair_with.join(', ')}</p>}
              <div className="row gap wrap">
                <button className="primary" onClick={() => startTryOn(null, it)}>👕 Try on me</button>
                {it.source_url ? <a className="btn" href={it.source_url} target="_blank" rel="noreferrer">Buy ↗</a>
                  : <a className="btn" href={`https://www.myntra.com/${encodeURIComponent((d.brand ? d.brand + ' ' : '') + d.title).replace(/%20/g, '-')}`} target="_blank" rel="noreferrer">Find on Myntra ↗</a>}
                <button onClick={async () => { const u = prompt('Paste product link'); if (u) { await update('saved_items', it.id, { source_url: u }); load(); } }}>🔗</button>
                <button className="danger" onClick={async () => { await remove('saved_items', it); load(); }}>🗑</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
