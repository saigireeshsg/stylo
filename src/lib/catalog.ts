// Product catalog: built-in demo items + /catalog.json produced by `npm run sync-catalog`
// (free public Shopify feeds from Indian D2C menswear brands; no paid API needed).
import { colorFromText } from './color';

export type Slot = 'top' | 'bottom' | 'layer' | 'shoes';
export interface Product {
  id: string; title: string; brand: string; price: number; currency: 'INR';
  url: string; image: string; category: string; slot: Slot;
  colorName: string; colorHex: string; fit: 'slim' | 'regular' | 'relaxed' | 'oversized';
  sizes: string[]; fabric?: string; source: string;
}

const CAT: Record<string, { slot: Slot; words: string[] }> = {
  shirt: { slot: 'top', words: ['shirt'] },
  tshirt: { slot: 'top', words: ['t-shirt', 'tshirt', 'tee'] },
  polo: { slot: 'top', words: ['polo'] },
  kurta: { slot: 'top', words: ['kurta'] },
  sweater: { slot: 'layer', words: ['sweater', 'sweatshirt', 'hoodie', 'pullover'] },
  jacket: { slot: 'layer', words: ['jacket', 'blazer', 'overshirt', 'shacket', 'bomber'] },
  jeans: { slot: 'bottom', words: ['jeans', 'denim pant'] },
  chinos: { slot: 'bottom', words: ['chino'] },
  trousers: { slot: 'bottom', words: ['trouser', 'pant', 'cargo', 'jogger'] },
  shorts: { slot: 'bottom', words: ['shorts'] },
  sneakers: { slot: 'shoes', words: ['sneaker', 'trainer', 'running shoe', 'canvas shoe'] },
  loafers: { slot: 'shoes', words: ['loafer', 'moccasin', 'driving shoe'] },
  formal: { slot: 'shoes', words: ['derby', 'oxford shoe', 'brogue', 'formal shoe'] },
  boots: { slot: 'shoes', words: ['boot', 'chelsea'] },
  sandals: { slot: 'shoes', words: ['sandal', 'slide', 'flip flop', 'flip-flop'] },
  mojari: { slot: 'shoes', words: ['mojari', 'jutti', 'juti', 'kolhapuri'] },
};
export function categorize(text: string): { category: string; slot: Slot } | null {
  const t = text.toLowerCase();
  for (const k of ['sneakers', 'loafers', 'formal', 'boots', 'sandals', 'mojari', 'polo', 'tshirt', 'kurta', 'jacket', 'sweater', 'jeans', 'chinos', 'shorts', 'trousers', 'shirt']) {
    if (CAT[k].words.some((w) => t.includes(w))) return { category: k, slot: CAT[k].slot };
  }
  return null;
}
export const fitFromText = (t: string): Product['fit'] => {
  const s = t.toLowerCase();
  return s.includes('oversize') ? 'oversized' : s.includes('relax') || s.includes('loose') || s.includes('baggy') ? 'relaxed' : s.includes('slim') || s.includes('skinny') || s.includes('taper') ? 'slim' : 'regular';
};

// ---- Simple garment illustrations for the built-in demo items ----
const SHAPES: Record<string, string> = {
  shirt: 'M60 20 L90 10 Q100 22 110 10 L140 20 L175 55 L155 75 L140 62 L140 190 L60 190 L60 62 L45 75 L25 55 Z M100 22 L100 190',
  tshirt: 'M62 22 L88 12 Q100 30 112 12 L138 22 L170 50 L150 70 L138 60 L138 188 L62 188 L62 60 L50 70 L30 50 Z',
  polo: 'M62 22 L88 12 L100 40 L112 12 L138 22 L170 50 L150 70 L138 60 L138 188 L62 188 L62 60 L50 70 L30 50 Z M100 40 L100 70',
  kurta: 'M65 18 L90 10 Q100 24 110 10 L135 18 L168 60 L150 76 L138 64 L145 195 L55 195 L62 64 L50 76 L32 60 Z M100 24 L100 80',
  jacket: 'M58 20 L88 10 L100 60 L112 10 L142 20 L178 60 L160 80 L144 66 L144 192 L56 192 L56 66 L40 80 L22 60 Z M100 60 L100 192',
  sweater: 'M60 22 L88 14 Q100 26 112 14 L140 22 L176 120 L156 126 L140 70 L140 186 L60 186 L60 70 L44 126 L24 120 Z',
  chinos: 'M62 12 L138 12 L146 192 L110 192 L100 60 L90 192 L54 192 Z',
  jeans: 'M62 12 L138 12 L148 192 L112 192 L100 62 L88 192 L52 192 Z M62 26 L138 26',
  trousers: 'M64 12 L136 12 L142 192 L108 192 L100 60 L92 192 L58 192 Z',
  shorts: 'M58 30 L142 30 L150 130 L108 130 L100 80 L92 130 L50 130 Z',
  sneakers: 'M20 120 Q22 92 48 88 L92 84 Q112 70 128 90 L172 104 Q188 110 186 128 L186 140 L20 140 Z M20 132 L186 132',
  loafers: 'M22 124 Q24 100 60 98 L118 94 Q150 92 176 112 Q188 124 180 136 L24 136 Z M70 100 Q96 112 122 98',
  formal: 'M22 126 Q22 102 58 100 L112 96 Q150 94 178 116 Q188 128 178 138 L22 138 Z M60 102 L92 112',
  boots: 'M60 40 L118 40 L120 100 Q160 102 180 120 Q188 134 178 142 L56 142 Z',
  sandals: 'M30 132 Q32 116 70 114 L150 112 Q180 114 182 130 L182 138 L30 138 Z M80 114 L104 96 L128 114',
  mojari: 'M20 128 Q40 100 80 102 L150 104 Q176 96 190 80 Q186 112 172 132 L22 136 Z',
};
export function garmentSvg(category: string, hex: string): string {
  const d = SHAPES[category] ?? SHAPES.tshirt;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 205"><rect width="200" height="205" fill="#f3f1ec"/><path d="${d}" fill="${hex}" stroke="rgba(0,0,0,.35)" stroke-width="2" stroke-linejoin="round"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const searchUrl = (q: string) => `https://www.myntra.com/${q.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const DEMO: [string, string, string, Product['fit'], number][] = [
  ['Olive Oxford Shirt', 'shirt', 'olive', 'slim', 1299], ['Rust Linen Shirt', 'shirt', 'rust', 'regular', 1599],
  ['Navy Oxford Shirt', 'shirt', 'navy', 'slim', 1199], ['Crisp White Shirt', 'shirt', 'white', 'slim', 999],
  ['Sky Blue Formal Shirt', 'shirt', 'sky blue', 'regular', 1099], ['Burgundy Casual Shirt', 'shirt', 'burgundy', 'regular', 1299],
  ['Mustard Crew T-Shirt', 'tshirt', 'mustard', 'regular', 599], ['Black Essential Tee', 'tshirt', 'black', 'slim', 499],
  ['Teal Pique Polo', 'polo', 'teal', 'regular', 899], ['Emerald Polo', 'polo', 'emerald', 'slim', 949],
  ['Dusty Pink Tee', 'tshirt', 'dusty pink', 'relaxed', 549], ['Charcoal Oversized Tee', 'tshirt', 'charcoal', 'oversized', 699],
  ['Cream Cotton Kurta', 'kurta', 'cream', 'regular', 1499], ['Royal Blue Kurta', 'kurta', 'royal blue', 'regular', 1699],
  ['Lavender Linen Shirt', 'shirt', 'lavender', 'regular', 1399], ['Coral Resort Shirt', 'shirt', 'coral', 'relaxed', 1199],
  ['Khaki Slim Chinos', 'chinos', 'khaki', 'slim', 1399], ['Navy Tapered Chinos', 'chinos', 'navy', 'slim', 1499],
  ['Beige Relaxed Trousers', 'trousers', 'beige', 'relaxed', 1599], ['Charcoal Formal Trousers', 'trousers', 'charcoal', 'regular', 1699],
  ['Indigo Slim Jeans', 'jeans', 'indigo', 'slim', 1799], ['Black Straight Jeans', 'jeans', 'black', 'regular', 1699],
  ['Chocolate Cargo Pants', 'trousers', 'chocolate', 'relaxed', 1499], ['Grey Pleated Trousers', 'trousers', 'grey', 'regular', 1899],
  ['Camel Overshirt', 'jacket', 'camel', 'regular', 2199], ['Forest Green Bomber', 'jacket', 'forest', 'regular', 2499],
  ['Navy Blazer', 'jacket', 'navy', 'slim', 3999], ['Grey Crew Sweatshirt', 'sweater', 'grey', 'regular', 1299],
  ['White Linen Shirt', 'shirt', 'white', 'relaxed', 1499], ['Sky Blue Linen Shirt', 'shirt', 'sky blue', 'relaxed', 1399],
  ['Beige Linen Shorts', 'shorts', 'beige', 'regular', 899], ['Navy Chino Shorts', 'shorts', 'navy', 'regular', 849], ['Olive Cargo Shorts', 'shorts', 'olive', 'relaxed', 999],
  ['White Leather Sneakers', 'sneakers', 'white', 'regular', 2499], ['Black Minimal Sneakers', 'sneakers', 'black', 'regular', 2299],
  ['Tan Suede Loafers', 'loafers', 'tan', 'regular', 2799], ['Brown Derby Shoes', 'formal', 'brown', 'regular', 2999],
  ['Black Oxford Shoes', 'formal', 'black', 'regular', 3199], ['Brown Chelsea Boots', 'boots', 'chocolate', 'regular', 3499],
  ['Tan Leather Sandals', 'sandals', 'tan', 'regular', 1299], ['Gold Embroidered Mojari', 'mojari', 'gold', 'regular', 1599],
];
export const DEMO_CATALOG: Product[] = DEMO.map(([title, category, color, fit, price], i) => {
  const c = colorFromText(color)!;
  return {
    id: 'demo-' + i, title, brand: 'Demo', price, currency: 'INR', url: searchUrl(`men ${color} ${category}`),
    image: garmentSvg(category, c.hex), category, slot: CAT[category].slot, colorName: c.name, colorHex: c.hex, fit,
    sizes: CAT[category].slot === 'bottom' ? ['28', '30', '32', '34', '36', '38'] : CAT[category].slot === 'shoes' ? ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'] : ['S', 'M', 'L', 'XL', 'XXL'], source: 'Demo catalog',
  };
});

let cache: Product[] | null = null;
export async function loadCatalog(): Promise<Product[]> {
  if (cache) return cache;
  let synced: Product[] = [];
  try { const r = await fetch(import.meta.env.BASE_URL + 'catalog.json'); if (r.ok) synced = await r.json(); } catch { /* no synced catalog */ }
  cache = [...synced, ...DEMO_CATALOG];
  return cache;
}

/** A saved screenshot becomes a product so it can be mixed into any outfit. */
export function savedToProduct(row: { id: string; url?: string; source_url?: string | null; data?: any }): Product | null {
  const d = row.data ?? {};
  const c = categorize(`${d.category ?? ''} ${d.title ?? ''}`);
  if (!c || !row.url) return null;
  return {
    id: 'saved-' + row.id, title: d.title ?? 'Saved item', brand: d.brand ?? d.site ?? 'Saved', price: Math.round(d.price_inr || 0), currency: 'INR',
    url: row.source_url || searchUrl(`${d.brand ?? ''} ${d.title ?? ''}`), image: row.url, category: c.category, slot: c.slot,
    colorName: d.color_name ?? '', colorHex: /^#[0-9a-f]{6}$/i.test(d.color_hex ?? '') ? d.color_hex : '#888888', fit: fitFromText(d.fit ?? ''),
    sizes: [], fabric: d.fabric, source: 'Your saved screenshot',
  };
}
