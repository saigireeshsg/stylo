// Outfit recommender: scores top + bottom (+ optional layer) combinations against
// colour palette, colour harmony, body-shape fit rules, size availability and learned taste.
import { paletteScore, harmonyScore, isNeutral, ColorProfile } from './color';
import type { BodyProfile } from './body';
import type { Product } from './catalog';
import type { Row } from './store';

export interface Taste { colors: Record<string, number>; fits: Record<string, number>; categories: Record<string, number> }
export interface Outfit { id: string; items: Product[]; score: number; reasons: string[]; breakdown: Record<string, number> }

export const OCCASIONS = {
  daily: { label: 'Daily casual', tops: ['tshirt', 'polo', 'shirt'], bottoms: ['jeans', 'chinos', 'trousers', 'shorts'], layer: false, shoes: ['sneakers', 'loafers'] },
  office: { label: 'Office', tops: ['shirt', 'polo'], bottoms: ['chinos', 'trousers'], layer: false, shoes: ['formal', 'loafers'] },
  date: { label: 'Date night', tops: ['shirt', 'polo', 'tshirt'], bottoms: ['jeans', 'chinos', 'trousers'], layer: true, shoes: ['loafers', 'boots', 'sneakers'] },
  festive: { label: 'Festive / wedding', tops: ['kurta', 'shirt'], bottoms: ['trousers', 'chinos'], layer: true, shoes: ['mojari', 'loafers', 'formal'] },
  weekend: { label: 'Weekend out', tops: ['tshirt', 'shirt'], bottoms: ['jeans', 'trousers', 'shorts'], layer: true, shoes: ['sneakers', 'boots'] },
  resort: { label: 'Beach / resort', tops: ['shirt', 'tshirt', 'polo'], bottoms: ['shorts', 'chinos'], layer: false, shoes: ['sandals', 'loafers', 'sneakers'] },
} as const;

/** Scenes for the Outfit Studio: where you'll be decides what you wear and the try-on background. */
export interface Scene { id: string; label: string; emoji: string; occasion: Occasion; prompt: string; tip: string }
export const SCENES: Scene[] = [
  { id: 'studio', label: 'Studio', emoji: '📸', occasion: 'daily', prompt: 'a clean light-grey photo studio backdrop with soft even lighting', tip: 'Everyday basics that work anywhere.' },
  { id: 'beach', label: 'Tropical beach', emoji: '🌴', occasion: 'resort', prompt: 'a sunny tropical beach in Goa with palm trees and turquoise sea, warm golden-hour light', tip: 'Linen and light colours breathe in humidity. Shorts and sandals or loafers, no socks.' },
  { id: 'office', label: 'Office', emoji: '💼', occasion: 'office', prompt: 'a bright modern glass office lobby in Bengaluru, daylight', tip: 'Crisp collar, tailored trousers, leather shoes. Keep to two or three colours.' },
  { id: 'wedding', label: 'Indian wedding', emoji: '🪔', occasion: 'festive', prompt: 'an Indian wedding venue decorated with marigold garlands and warm fairy lights in the evening', tip: 'Rich festive colours, a kurta or bandhgala-style layer, mojaris or loafers.' },
  { id: 'cafe', label: 'Café date', emoji: '☕', occasion: 'date', prompt: 'a cozy aesthetic café with warm lights, plants and wooden interiors', tip: 'Smart casual: a good shirt, dark denim or chinos, clean loafers or boots.' },
  { id: 'street', label: 'City street', emoji: '🏙️', occasion: 'weekend', prompt: 'a lively Mumbai street in the daytime with colonial buildings', tip: 'Relaxed layers and sneakers. Comfortable but put-together.' },
  { id: 'rooftop', label: 'Rooftop night', emoji: '🌃', occasion: 'date', prompt: 'a rooftop lounge at night with city skyline lights and warm bokeh', tip: 'Darker tones and one statement piece look sharp in low light.' },
  { id: 'hills', label: 'Hill station', emoji: '🏔️', occasion: 'weekend', prompt: 'a misty Himalayan hill station with pine trees, cool overcast light', tip: 'Layer up: an overshirt or jacket, sturdy boots, earthy colours.' },
];
export type Occasion = keyof typeof OCCASIONS;

/** Learn taste from interactions: like +1, dislike -1, picked in A/B +1 / other -0.5, shop click +0.5, try-on rating. */
export function learnTaste(interactions: Row[]): Taste {
  const t: Taste = { colors: {}, fits: {}, categories: {} };
  const bump = (p: any, w: number) => {
    if (!p) return;
    for (const it of p.items ?? [p]) {
      if (it.colorName) t.colors[it.colorName] = (t.colors[it.colorName] ?? 0) + w;
      if (it.fit) t.fits[it.fit] = (t.fits[it.fit] ?? 0) + w;
      if (it.category) t.categories[it.category] = (t.categories[it.category] ?? 0) + w;
    }
  };
  for (const r of interactions) {
    const w = { like: 1, dislike: -1, pick: 1, reject: -0.5, shop: 0.5, rate: ((r.payload?.rating ?? 3) - 3) / 2 }[r.kind as string] ?? 0;
    bump(r.payload?.outfit ?? r.payload?.item, w);
  }
  return t;
}
const squash = (x: number) => Math.tanh(x / 3); // -1..1
const OCC_SHOE_RANK = (list: readonly string[], cat: string) => { const i = list.indexOf(cat); return i < 0 ? 0 : (list.length - i) * 0.04; };

function fitScore(p: Product, body: BodyProfile | null): { s: number; note?: string } {
  if (!body) return { s: 0.6 };
  const shape = body.shape.name;
  const rules: Record<string, Partial<Record<Product['fit'], number>>> = {
    'Oval': { regular: 0.9, relaxed: 0.7, slim: 0.3, oversized: 0.4 },
    'Inverted triangle': { slim: p.slot === 'top' ? 0.9 : 0.5, regular: 0.8, relaxed: p.slot === 'bottom' ? 0.9 : 0.5 },
    'Trapezoid (athletic)': { slim: 0.95, regular: 0.8, relaxed: 0.55, oversized: 0.5 },
    'Triangle': { regular: 0.85, relaxed: p.slot === 'top' ? 0.7 : 0.5, slim: p.slot === 'bottom' ? 0.4 : 0.7 },
    'Rectangle': { regular: 0.8, slim: 0.75, relaxed: 0.7, oversized: 0.7 },
  };
  const s = rules[shape]?.[p.fit] ?? 0.65;
  return { s, note: s >= 0.85 ? `${cap(p.fit)} fit suits a ${shape.toLowerCase()} build` : s < 0.5 ? `${cap(p.fit)} fit is less flattering for a ${shape.toLowerCase()} build` : undefined };
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function sizeOk(p: Product, body: BodyProfile | null) {
  if (!body || !p.sizes.length || p.slot === 'shoes') return true;
  const want = p.slot === 'bottom' ? String(body.sizes.trouserWaist) : body.sizes.top;
  return p.sizes.some((s) => s.toUpperCase().replace(/\s/g, '').startsWith(want.toUpperCase()));
}

export function recommend(catalog: Product[], body: BodyProfile | null, color: ColorProfile | null, taste: Taste, occasion: Occasion, budget: number, n = 8): Outfit[] {
  const occ = OCCASIONS[occasion];
  const tops = catalog.filter((p) => (occ.tops as readonly string[]).includes(p.category));
  const bottoms = catalog.filter((p) => (occ.bottoms as readonly string[]).includes(p.category));
  const layers = occ.layer ? catalog.filter((p) => p.slot === 'layer') : [];
  const shoes = catalog.filter((p) => p.slot === 'shoes' && (occ.shoes as readonly string[]).includes(p.category));
  const out: Outfit[] = [];
  for (const t of tops) for (const b of bottoms) {
    const layerOpts = layers.length ? [null, ...layers.slice(0, 12)] : [null];
    for (const l of layerOpts) {
      const items = [t, b, ...(l ? [l] : [])];
      const price = items.reduce((s, i) => s + i.price, 0);
      if (price > budget) continue;
      const pal = paletteScore(t.colorHex, color);           // top is nearest the face, so it matters most
      const palB = paletteScore(b.colorHex, color);
      const har = harmonyScore(t.colorHex, b.colorHex);
      const harL = l ? harmonyScore(l.colorHex, t.colorHex) : null;
      const ft = fitScore(t, body), fb = fitScore(b, body);
      const pref = items.reduce((s, i) => s + squash(taste.colors[i.colorName] ?? 0) * 0.6 + squash(taste.fits[i.fit] ?? 0) * 0.25 + squash(taste.categories[i.category] ?? 0) * 0.15, 0) / items.length;
      const sizes = items.every((i) => sizeOk(i, body)) ? 1 : 0.4;
      const breakdown = {
        palette: pal.score * 0.7 + palB.score * 0.3,
        harmony: harL ? (har.score + harL.score) / 2 : har.score,
        bodyFit: (ft.s + fb.s) / 2,
        taste: (pref + 1) / 2,
        size: sizes,
        budget: 1 - price / budget / 2,
      };
      const score = 0.3 * breakdown.palette + 0.2 * breakdown.harmony + 0.18 * breakdown.bodyFit + 0.17 * breakdown.taste + 0.1 * breakdown.size + 0.05 * breakdown.budget;
      const reasons = [pal.note, har.note, ft.note, fb.note && fb.note !== ft.note ? fb.note : undefined, harL?.note && `Layer: ${harL.note.toLowerCase()}`, sizes < 1 ? `Your size (${body?.sizes.top}/${body?.sizes.trouserWaist}) may be unavailable` : undefined, pref > 0.2 ? 'Matches colours and fits you have liked before' : undefined]
        .filter((r, i, a) => r && a.indexOf(r) === i) as string[];
      out.push({ id: items.map((i) => i.id).join('+'), items, score, reasons, breakdown });
    }
  }
  out.sort((a, b) => b.score - a.score);
  // Diversity: avoid repeating the same top, and keep ~1 in 6 exploratory picks (Thompson-style jitter)
  const picked: Outfit[] = []; const usedTop = new Set<string>();
  for (const o of out) {
    if (picked.length >= n) break;
    if (usedTop.has(o.items[0].id)) continue;
    usedTop.add(o.items[0].id); picked.push(o);
  }
  if (picked.length >= 6) {
    const explore = out.filter((o) => !usedTop.has(o.items[0].id))[Math.floor(Math.random() * 10)];
    if (explore) picked[picked.length - 1] = { ...explore, reasons: ['✨ Something new to test your taste', ...explore.reasons] };
  }
  // Shoes: chosen per outfit to harmonise with the bottom (neutral leather/white is the safe default)
  for (const o of picked) {
    const b = o.items.find((i) => i.slot === 'bottom')!;
    const left = budget - o.items.reduce((s, i) => s + i.price, 0);
    const best = shoes.map((sh) => {
      const h = harmonyScore(sh.colorHex, b.colorHex);
      const sc = 0.5 * h.score + 0.3 * (isNeutral(sh.colorHex) ? 1 : 0.5) + 0.2 * ((squash(taste.colors[sh.colorName] ?? 0) + squash(taste.categories[sh.category] ?? 0) + 2) / 4) + (sh.price <= left ? 0.1 : -0.3) + (OCC_SHOE_RANK(occ.shoes as readonly string[], sh.category));
      return { sh, sc };
    }).sort((x, y) => y.sc - x.sc)[0];
    if (best) { o.items = [...o.items, best.sh]; o.reasons.push(`${cap(best.sh.colorName)} ${best.sh.category} ground the look`); }
  }
  return picked;
}
