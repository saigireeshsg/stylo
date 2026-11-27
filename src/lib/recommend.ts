// Situations + combination engine.
// Stage 1 (on device, instant): shortlist the best pieces per slot, enumerate EVERY combination
// (top × bottom × shoes × optional layer) and score each one 0–10 with reasons.
// Stage 2 (Gemini, see judge.ts): a stylist model re-rates the top looks and explains why.
import { paletteScore, harmonyScore, isNeutral, ColorProfile } from './color';
import type { BodyProfile } from './body';
import type { Product, Slot } from './catalog';
import type { Row } from './store';

// ---------------- Situations ----------------
interface SlotSpec { cats: string[]; tag?: string }
export interface Situation {
  id: string; label: string; sub: string; tag: string; formality: number;
  slots: { top: SlotSpec; bottom: SlotSpec; shoes: SlotSpec; layer?: SlotSpec & { required?: boolean } };
  scene: string; tip: string;
}
export const SITUATIONS: Situation[] = [
  { id: 'office', label: 'Office', sub: 'Sharp, tailored, boardroom-ready', tag: 'office', formality: 3,
    slots: { top: { cats: ['shirt', 'polo'], tag: 'office' }, bottom: { cats: ['trousers', 'chinos'], tag: 'office' }, shoes: { cats: ['formal', 'loafers'] }, layer: { cats: ['blazer'] } },
    scene: 'a bright modern glass office lobby in Bengaluru, natural daylight', tip: 'Crisp collar, tailored trousers, leather shoes. Two or three colours, max.' },
  { id: 'casual', label: 'Everyday casual', sub: 'Easy, clean, put-together', tag: 'casual', formality: 1.6,
    slots: { top: { cats: ['tshirt', 'polo', 'shirt'] }, bottom: { cats: ['jeans', 'chinos', 'cargo'] }, shoes: { cats: ['sneakers', 'loafers'] }, layer: { cats: ['jacket', 'sweater'] } },
    scene: 'a sunny tree-lined street in Bandra, Mumbai, daytime', tip: 'Fit beats everything. Clean sneakers and one neutral anchor piece.' },
  { id: 'party', label: 'Date & party', sub: 'Evening, a little bolder', tag: 'party', formality: 2.6,
    slots: { top: { cats: ['shirt', 'polo', 'tshirt'] }, bottom: { cats: ['jeans', 'trousers'] }, shoes: { cats: ['loafers', 'boots', 'sneakers'] }, layer: { cats: ['blazer', 'jacket'] } },
    scene: 'a stylish rooftop lounge at night with warm city lights and bokeh', tip: 'Darker tones and one statement piece look sharp in low light.' },
  { id: 'wedding', label: 'Wedding & festive', sub: 'Kurtas, bandhgalas, celebration', tag: 'ethnic', formality: 3.2,
    slots: { top: { cats: ['kurta', 'shirt'] }, bottom: { cats: ['trousers'] }, shoes: { cats: ['mojari', 'loafers', 'formal'] }, layer: { cats: ['blazer'] } },
    scene: 'an Indian wedding venue decorated with marigold garlands and warm fairy lights, evening', tip: 'Rich colours, a kurta or bandhgala, mojaris or loafers.' },
  { id: 'beach', label: 'Beach & vacation', sub: 'Linen, shorts, sun', tag: 'resort', formality: 1,
    slots: { top: { cats: ['shirt', 'tshirt', 'polo'], tag: 'resort' }, bottom: { cats: ['shorts', 'chinos', 'trousers'], tag: 'resort' }, shoes: { cats: ['sandals', 'loafers', 'sneakers'] } },
    scene: 'a tropical beach in Goa with palm trees and turquoise sea, golden-hour light', tip: 'Linen and light colours breathe in humidity. No socks.' },
  { id: 'winter', label: 'Winter & travel', sub: 'Layers, jackets, boots', tag: 'winter', formality: 2,
    slots: { top: { cats: ['shirt', 'tshirt', 'polo'] }, bottom: { cats: ['jeans', 'chinos', 'trousers'] }, shoes: { cats: ['boots', 'sneakers'] }, layer: { cats: ['jacket', 'sweater', 'coat'], required: true } },
    scene: 'a misty Himalayan hill station with pine trees, cool overcast light', tip: 'Layer up: a jacket or knit over a shirt, sturdy boots, earthy colours.' },
];
export const situationById = (id: string) => SITUATIONS.find((s) => s.id === id) ?? SITUATIONS[0];

export function fitsSlot(p: Product, sit: Situation, slot: Slot): boolean {
  const spec = sit.slots[slot as 'top']; if (!spec) return false;
  if (p.slot !== slot || !spec.cats.includes(p.category)) return false;
  if (spec.tag && p.occasions.length && !p.occasions.includes(spec.tag)) return false;
  return true;
}

// ---------------- Taste learned from behaviour ----------------
export interface Taste { colors: Record<string, number>; fits: Record<string, number>; categories: Record<string, number>; brands: Record<string, number> }
export function learnTaste(interactions: Row[]): Taste {
  const t: Taste = { colors: {}, fits: {}, categories: {}, brands: {} };
  const bump = (p: any, w: number) => {
    if (!p) return;
    for (const it of p.items ?? [p]) {
      if (it.colorName) t.colors[it.colorName] = (t.colors[it.colorName] ?? 0) + w;
      if (it.fit) t.fits[it.fit] = (t.fits[it.fit] ?? 0) + w;
      if (it.category) t.categories[it.category] = (t.categories[it.category] ?? 0) + w;
      if (it.brand) t.brands[it.brand] = (t.brands[it.brand] ?? 0) + w;
    }
  };
  for (const r of interactions) {
    const w = ({ like: 1, dislike: -1, pick: 1, reject: -0.5, shop: 0.6, wear: 0.4, rate: ((r.payload?.rating ?? 3) - 3) / 2 } as Record<string, number>)[r.kind] ?? 0;
    bump(r.payload?.outfit ?? r.payload?.item, w);
  }
  return t;
}
const squash = (x: number) => Math.tanh(x / 3);
const tasteOf = (p: Product, t: Taste) => (squash(t.colors[p.colorName] ?? 0) * 0.45 + squash(t.fits[p.fit] ?? 0) * 0.2 + squash(t.categories[p.category] ?? 0) * 0.2 + squash(t.brands[p.brand] ?? 0) * 0.15 + 1) / 2;

// ---------------- Rules ----------------
const FORMALITY: Record<string, number> = {
  kurta: 3.2, blazer: 4, coat: 3.2, formal: 4, loafers: 3, mojari: 3.2, shirt: 3, polo: 2.2, tshirt: 1, sweater: 1.8, jacket: 1.8,
  trousers: 3, chinos: 2.4, jeans: 1.6, cargo: 1, joggers: 0.6, shorts: 0.6, sneakers: 1.2, boots: 2.2, sandals: 0.6,
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function bodyFitScore(p: Product, body: BodyProfile | null): { s: number; note?: string } {
  if (!body || p.slot === 'shoes') return { s: 0.7 };
  const shape = body.shape.name;
  const rules: Record<string, Record<string, number>> = {
    'Oval': { regular: 0.9, relaxed: 0.75, slim: 0.35, oversized: 0.45 },
    'Inverted triangle': p.slot === 'bottom' ? { relaxed: 0.9, regular: 0.85, slim: 0.5 } : { slim: 0.9, regular: 0.8, relaxed: 0.55, oversized: 0.5 },
    'Trapezoid (athletic)': { slim: 0.95, regular: 0.85, relaxed: 0.6, oversized: 0.55 },
    'Triangle': p.slot === 'bottom' ? { regular: 0.85, relaxed: 0.65, slim: 0.45 } : { regular: 0.85, relaxed: 0.75, oversized: 0.7, slim: 0.6 },
    'Rectangle': { regular: 0.8, slim: 0.78, relaxed: 0.72, oversized: 0.72 },
  };
  const s = rules[shape]?.[p.fit] ?? 0.7;
  return { s, note: s >= 0.88 ? `${cap(p.fit)} ${p.slot === 'bottom' ? 'trousers' : 'fit'} flatter a ${shape.toLowerCase()} build` : s < 0.5 ? `${cap(p.fit)} fit is less flattering on a ${shape.toLowerCase()} build` : undefined };
}
function sizeOk(p: Product, body: BodyProfile | null) {
  if (!body || !p.sizes.length || p.slot === 'shoes') return true;
  const want = (p.slot === 'bottom' ? String(body.sizes.trouserWaist) : body.sizes.top).toUpperCase();
  const word: Record<string, string> = { S: 'SMALL', M: 'MEDIUM', L: 'LARGE' };
  return p.sizes.some((s) => { const x = s.toUpperCase().replace(/\s|-/g, ''); return x === want || x.startsWith(want + '(') || x.startsWith(want + '/') || x === word[want]; });
}

/** Single-piece score, used to shortlist and to rank product grids. 0..1 */
export function itemScore(p: Product, color: ColorProfile | null, body: BodyProfile | null, taste: Taste): number {
  const pal = p.slot === 'top' || p.slot === 'layer' ? paletteScore(p.colorHex, color).score : isNeutral(p.colorHex) ? 0.8 : paletteScore(p.colorHex, color).score * 0.8;
  return 0.42 * pal + 0.23 * bodyFitScore(p, body).s + 0.2 * tasteOf(p, taste) + 0.15 * (sizeOk(p, body) ? 1 : 0.3);
}

export interface Look { key: string; items: Product[]; score: number; breakdown: Record<string, number>; reasons: string[]; caution?: string; ai?: { score: number; verdict: string; tip: string } }
export const lookKey = (items: Product[]) => items.map((i) => i.id).sort().join('+');

export function scoreLook(items: Product[], sit: Situation, color: ColorProfile | null, body: BodyProfile | null, taste: Taste, budget: number): Look {
  const by = (s: Slot) => items.find((i) => i.slot === s);
  const top = by('top')!, bottom = by('bottom')!, shoes = by('shoes'), layer = by('layer');
  const palTop = paletteScore(top.colorHex, color), palLayer = layer ? paletteScore(layer.colorHex, color) : null;
  const h1 = harmonyScore(top.colorHex, bottom.colorHex);
  const h2 = shoes ? harmonyScore(shoes.colorHex, bottom.colorHex) : null;
  const h3 = layer ? harmonyScore(layer.colorHex, top.colorHex) : null;
  const forms = items.map((i) => FORMALITY[i.category] ?? 2);
  const mean = forms.reduce((a, b) => a + b, 0) / forms.length;
  const sd = Math.sqrt(forms.reduce((a, b) => a + (b - mean) ** 2, 0) / forms.length);
  const fTop = bodyFitScore(top, body), fBot = bodyFitScore(bottom, body);
  const price = items.reduce((s, i) => s + i.price, 0);
  const colorsUsed = new Set(items.filter((i) => !isNeutral(i.colorHex)).map((i) => i.colorName)).size;

  const breakdown = {
    palette: palLayer ? palTop.score * 0.55 + palLayer.score * 0.45 : palTop.score,
    harmony: Math.max(0, [h1.score, h2?.score ?? h1.score, h3?.score ?? h1.score].reduce((a, b) => a + b, 0) / 3 - (colorsUsed > 2 ? 0.15 : 0)),
    occasion: Math.max(0, 1 - Math.abs(mean - sit.formality) / 2) * 0.6 + Math.max(0, 1 - sd / 1.5) * 0.4,
    bodyFit: (fTop.s + fBot.s) / 2,
    taste: items.reduce((s, i) => s + tasteOf(i, taste), 0) / items.length,
    size: items.every((i) => sizeOk(i, body)) ? 1 : 0.5,
    budget: price <= budget ? 1 : Math.max(0, 1 - (price - budget) / budget),
  };
  const raw = 0.27 * breakdown.palette + 0.2 * breakdown.harmony + 0.2 * breakdown.occasion + 0.14 * breakdown.bodyFit + 0.1 * breakdown.taste + 0.05 * breakdown.size + 0.04 * breakdown.budget;
  const score = Math.round(Math.max(0, Math.min(10, ((raw - 0.35) / 0.55) * 10)) * 10) / 10;

  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const pros: [number, string][] = [
    [palTop.score, palTop.note.startsWith('Close to') ? `The ${top.colorName} top is ${lower(palTop.note)}` : palTop.note],
    [h1.score, `${cap(top.colorName)} with ${bottom.colorName}: ${lower(h1.note)}`],
    [breakdown.occasion, breakdown.occasion > 0.8 ? `Formality is spot-on for ${sit.label.toLowerCase()}` : ''],
    [fTop.s, fTop.note ?? ''], [fBot.s, fBot.note ?? ''],
    [h2?.score ?? 0, shoes ? `${cap(shoes.colorName)} ${shoes.category === 'formal' ? 'shoes' : shoes.category} ${isNeutral(shoes.colorHex) ? 'ground the look' : 'add a deliberate accent'}` : ''],
    [breakdown.taste > 0.62 ? 0.9 : 0, 'Matches colours and fits you have liked before'],
  ];
  const reasons = pros.filter(([v, t]) => t && v >= 0.7).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, t]) => t);
  const worst = Object.entries(breakdown).sort((a, b) => a[1] - b[1])[0];
  const caution = worst[1] < 0.55 ? ({
    palette: `The top's colour isn't in your ${color?.season ?? ''} palette. Keep it away from your face or add a layer`,
    harmony: colorsUsed > 2 ? 'Too many colours competing. Swap one piece for a neutral' : 'These colours compete a little',
    occasion: `Mixes dressy and casual pieces. Not ideal for ${sit.label.toLowerCase()}`,
    bodyFit: 'The cut is not the most flattering for your build', size: 'Your size may be sold out on one piece', budget: 'Over your budget', taste: 'Different from what you usually like',
  } as Record<string, string>)[worst[0]] : undefined;
  return { key: lookKey(items), items, score, breakdown, reasons, caution };
}

export interface Picks { top?: Product[]; bottom?: Product[]; shoes?: Product[]; layer?: Product[] }
/** Rate every combination: shortlist per slot (or use the user's own picks), enumerate, score, sort. */
export function rateAll(catalog: Product[], sit: Situation, color: ColorProfile | null, body: BodyProfile | null, taste: Taste, budget: number, picks: Picks = {}, withLayer = false) {
  const K = { top: 10, bottom: 8, shoes: 6, layer: 5 };
  const shortlist = (slot: Slot): Product[] => {
    if (picks[slot]?.length) return picks[slot]!;
    const CAP: Record<Slot, number> = { top: 0.32, bottom: 0.32, shoes: 0.36, layer: 0.45 };
    const pool = catalog.filter((p) => fitsSlot(p, sit, slot) && p.price <= budget * CAP[slot]).map((p) => ({ p, s: itemScore(p, color, body, taste) })).sort((a, b) => b.s - a.s);
    const out: Product[] = []; const perColor: Record<string, number> = {}; const perBrand: Record<string, number> = {};
    for (const { p } of pool) {   // diversity: max 2 per colour, 3 per brand
      if (out.length >= K[slot]) break;
      if ((perColor[p.colorName] ?? 0) >= 2 || (perBrand[p.brand] ?? 0) >= 3) continue;
      perColor[p.colorName] = (perColor[p.colorName] ?? 0) + 1; perBrand[p.brand] = (perBrand[p.brand] ?? 0) + 1; out.push(p);
    }
    return out;
  };
  const tops = shortlist('top'), bottoms = shortlist('bottom'), shoes = shortlist('shoes');
  const layerSpec = sit.slots.layer;
  const useLayer = !!layerSpec && (layerSpec.required || withLayer || !!picks.layer?.length);
  const layers: (Product | null)[] = useLayer ? shortlist('layer') : [null];
  const hasPicks = Object.values(picks).some((a) => a?.length);
  const looks: Look[] = [];
  if (!tops.length || !bottoms.length || !shoes.length) return { looks, counts: { top: tops.length, bottom: bottoms.length, shoes: shoes.length, layer: 0 } };
  for (const t of tops) for (const b of bottoms) for (const s of shoes) for (const l of layers.length ? layers : [null]) {
    const set = [...(l ? [l] : []), t, b, s];
    if (!hasPicks && set.reduce((sum, i) => sum + i.price, 0) > budget) continue;   // respect the budget unless the user hand-picked
    looks.push(scoreLook(set, sit, color, body, taste, budget));
  }
  looks.sort((a, b) => b.score - a.score);
  return { looks, counts: { top: tops.length, bottom: bottoms.length, shoes: shoes.length, layer: useLayer ? layers.length : 0 } };
}
