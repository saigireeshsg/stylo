#!/usr/bin/env node
// Free catalog ingestion: many Indian D2C menswear brands run on Shopify, which exposes a public
// /products.json feed. This script pulls those feeds, keeps menswear apparel, tags each item with
// category / colour / fit / sizes and writes public/catalog.json for the app.
//
// Usage:  npm run sync-catalog            (edit STORES below; stores that are not Shopify are skipped)
// Note: this is for a non-commercial demo. Check each brand's terms before using their data in production.
import { writeFileSync } from 'node:fs';

const STORES = (process.env.STORES ?? 'www.snitch.com,www.thesouledstore.com,www.urbanmonkey.com,rarerabbit.in,www.thebearhouse.com,www.offduty.in')
  .split(',').map((s) => s.trim()).filter(Boolean);
const PER_STORE = Number(process.env.PER_STORE ?? 120);

const COLORS = {
  black: '#151515', white: '#F7F7F5', 'off white': '#EFEBE0', cream: '#EFE6D2', ivory: '#F4EEDC', beige: '#D8C3A0', khaki: '#B5A27A',
  camel: '#B8865B', tan: '#B98A5E', brown: '#6B4A2E', chocolate: '#4A3022', coffee: '#5A3B28', grey: '#8C9096', gray: '#8C9096',
  charcoal: '#36393E', silver: '#C0C4CC', navy: '#1F2A48', blue: '#2F5FA7', 'sky blue': '#8EC3E6', 'light blue': '#A9C6E3',
  'royal blue': '#2549B8', indigo: '#2E3A6E', teal: '#1F6F6B', turquoise: '#2BB3A6', aqua: '#5CC6C0', green: '#2F7A45', olive: '#6B7B3A',
  'bottle green': '#0F4D32', emerald: '#0F7A55', mint: '#A8DCC4', sage: '#9CAF88', forest: '#2F5233', red: '#B3242B', maroon: '#5E1A2B',
  burgundy: '#6B1F33', wine: '#5E1A2B', rust: '#B5532C', brick: '#8E3B2E', orange: '#E8742A', coral: '#F26B5B', peach: '#F2B59A',
  pink: '#E59BB0', lavender: '#9C8AC0', purple: '#5B3A7A', magenta: '#A21E6A', yellow: '#E8C547', mustard: '#C99A1E', gold: '#C9A23A', denim: '#3B5A85',
};
const CATS = [
  ['sneakers', 'shoes', ['sneaker', 'trainer']], ['loafers', 'shoes', ['loafer', 'moccasin']], ['formal', 'shoes', ['derby', 'brogue', 'oxford shoe']],
  ['boots', 'shoes', ['boot', 'chelsea']], ['sandals', 'shoes', ['sandal', 'slide', 'flip flop']], ['mojari', 'shoes', ['mojari', 'jutti', 'kolhapuri']],
  ['polo', 'top', ['polo']], ['tshirt', 'top', ['t-shirt', 'tshirt', ' tee']], ['kurta', 'top', ['kurta']],
  ['jacket', 'layer', ['jacket', 'blazer', 'overshirt', 'shacket', 'bomber']], ['sweater', 'layer', ['sweater', 'sweatshirt', 'hoodie', 'pullover']],
  ['jeans', 'bottom', ['jeans']], ['chinos', 'bottom', ['chino']], ['shorts', 'bottom', ['shorts']],
  ['trousers', 'bottom', ['trouser', 'pant', 'cargo', 'jogger']], ['shirt', 'top', ['shirt']],
];
const WOMEN = /\b(women|woman|ladies|girls?|dress|skirt|bra|kurti|saree)\b/i;
const color = (t) => { const s = ' ' + t.toLowerCase().replace(/[^a-z ]/g, ' ') + ' '; for (const k of Object.keys(COLORS).sort((a, b) => b.length - a.length)) if (s.includes(' ' + k + ' ')) return [k, COLORS[k]]; return null; };
const fit = (t) => /oversize/i.test(t) ? 'oversized' : /relax|loose|baggy/i.test(t) ? 'relaxed' : /slim|skinny|taper/i.test(t) ? 'slim' : 'regular';

const out = [];
for (const host of STORES) {
  try {
    const r = await fetch(`https://${host}/products.json?limit=250`, { headers: { 'User-Agent': 'Mozilla/5.0 (demo catalog sync)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const { products } = await r.json();
    let n = 0;
    for (const p of products ?? []) {
      if (n >= PER_STORE) break;
      const text = `${p.title} ${p.product_type ?? ''} ${(p.tags ?? []).join?.(' ') ?? p.tags ?? ''}`;
      if (WOMEN.test(text)) continue;
      const cat = CATS.find(([, , w]) => w.some((x) => (' ' + text.toLowerCase()).includes(x)));
      const optColor = (p.options ?? []).find((o) => /colou?r/i.test(o.name))?.values?.[0] ?? '';
      const col = color(`${optColor} ${p.title} ${text}`);
      const img = p.images?.[0]?.src; const v = p.variants?.[0];
      if (!cat || !col || !img || !v) continue;
      const sizeOpt = (p.options ?? []).find((o) => /size|waist/i.test(o.name));
      out.push({
        id: `${host}-${p.id}`, title: p.title, brand: host.replace(/^www\./, '').split('.')[0], price: Math.round(Number(v.price)), currency: 'INR',
        url: `https://${host}/products/${p.handle}`, image: img.split('?')[0] + '?width=600', category: cat[0], slot: cat[1],
        colorName: col[0], colorHex: col[1], fit: fit(text), sizes: sizeOpt?.values ?? [], source: host,
      });
      n++;
    }
    console.log(`✓ ${host}: ${n} items`);
  } catch (e) { console.log(`✗ ${host}: ${e.message} (skipped)`); }
}
writeFileSync(new URL('../public/catalog.json', import.meta.url), JSON.stringify(out));
console.log(`Wrote ${out.length} products → public/catalog.json`);
