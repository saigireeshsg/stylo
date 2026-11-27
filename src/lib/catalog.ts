// Real product catalog: live feeds from Indian menswear brands, synced into Supabase by the `catalog` edge function.
import { supabase } from './store';
import { getConfig } from './config';

export type Slot = 'top' | 'bottom' | 'layer' | 'shoes';
export interface Product {
  id: string; title: string; brand: string; price: number; compareAt?: number | null; currency: 'INR';
  url: string; image: string; images: string[]; category: string; slot: Slot;
  colorName: string; colorHex: string; fit: string; fabric?: string | null;
  occasions: string[]; sizes: string[]; source: string;
}

export const CATEGORY_LABEL: Record<string, string> = {
  shirt: 'Shirts', tshirt: 'T-shirts', polo: 'Polos', kurta: 'Kurtas', blazer: 'Blazers', coat: 'Coats', jacket: 'Jackets',
  sweater: 'Sweaters', trousers: 'Trousers', chinos: 'Chinos', jeans: 'Jeans', cargo: 'Cargos', joggers: 'Joggers', shorts: 'Shorts',
  sneakers: 'Sneakers', loafers: 'Loafers', formal: 'Formal shoes', boots: 'Boots', sandals: 'Sandals', mojari: 'Mojaris',
};
export const SLOT_LABEL: Record<Slot, string> = { top: 'Top', bottom: 'Bottom', layer: 'Layer', shoes: 'Shoes' };

/** Shopify CDN can resize on the fly; keeps lists light. */
export function sized(url: string, w = 480) {
  if (!url) return url;
  if (url.includes('cdn.shopify.com')) return `${url.split('?')[0]}?width=${w}`;
  return url;
}
/** Product images go through our edge function so the browser can send them to the try-on model (CORS). */
export function proxied(url: string) {
  if (!url.startsWith('http')) return url;
  return `${getConfig().supabaseUrl}/functions/v1/catalog?action=img&u=${encodeURIComponent(sized(url, 900))}`;
}

const fromRow = (r: any): Product => ({
  id: r.id, title: r.title, brand: tidyBrand(r.brand, r.source), price: Number(r.price), compareAt: r.compare_at ? Number(r.compare_at) : null, currency: 'INR',
  url: r.url, image: r.image, images: r.images ?? [r.image], category: r.category, slot: r.slot, colorName: r.color_name, colorHex: r.color_hex,
  fit: r.fit ?? 'regular', fabric: r.fabric, occasions: r.occasions ?? [], sizes: r.sizes ?? [], source: r.source,
});
const BRAND_BY_HOST: Record<string, string> = {
  'www.powerlook.in': 'Powerlook', 'thehouseofrare.com': 'Rare Rabbit', 'www.thebearhouse.com': 'The Bear House', 'www.urbanmonkey.com': 'Urban Monkey',
  'www.offduty.in': 'Offduty', 'andamen.com': 'Andamen', 'www.beyours.in': 'Beyours', 'www.mrbutton.in': 'Mr Button', 'www.jaywalking.in': 'Jaywalking',
  'www.bonkerscorner.com': 'Bonkers Corner', 'www.blackberrys.com': 'Blackberrys', 'www.nicobar.com': 'Nicobar', 'www.neemans.com': "Neeman's",
  'www.baccabucci.com': 'Bacca Bucci', 'www.wearcomet.com': 'Comet', 'www.monkstory.com': 'Monkstory',
};
function tidyBrand(brand: string, host: string) {
  if (BRAND_BY_HOST[host] && (!brand || brand.length > 24 || /pvt|ltd|private|limited|international/i.test(brand))) return BRAND_BY_HOST[host];
  return brand ? brand.replace(/\b\w+/g, (w) => (w.length > 3 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w)) : BRAND_BY_HOST[host] ?? host;
}
export const storeName = (p: Product) => BRAND_BY_HOST[p.source] ?? p.source.replace(/^www\./, '');

let cache: Product[] | null = null;
export async function loadCatalog(): Promise<Product[]> {
  if (cache) return cache;
  const s = supabase();
  const out: Product[] = [];
  if (s) {
    // ~6k rows; fetch in pages of 1000
    for (let from = 0; from < 8000; from += 1000) {
      const { data, error } = await s.from('products').select('*').eq('available', true).range(from, from + 999);
      if (error || !data?.length) break;
      out.push(...data.map(fromRow));
      if (data.length < 1000) break;
    }
  }
  if (!out.length) {   // offline mode: bundled snapshot
    try { const r = await fetch(import.meta.env.BASE_URL + 'catalog.json'); if (r.ok) out.push(...(await r.json()).map(fromRow)); } catch { /* none */ }
  }
  cache = out;
  return cache;
}
export async function catalogStatus() {
  const s = supabase(); if (!s) return null;
  const { data } = await s.from('catalog_meta').select('last_sync,total').eq('id', 1).maybeSingle();
  return data;
}

/** A saved screenshot becomes a product so it can be mixed into any outfit. */
const CATS: [string, Slot, RegExp][] = [
  ['sneakers', 'shoes', /sneaker|trainer/], ['loafers', 'shoes', /loafer|moccasin/], ['formal', 'shoes', /derby|oxford shoe|brogue|formal shoe/],
  ['boots', 'shoes', /boot/], ['sandals', 'shoes', /sandal|slide|slipper/], ['mojari', 'shoes', /mojari|jutti/],
  ['blazer', 'layer', /blazer|suit jacket|bandhgala|nehru/], ['coat', 'layer', /coat/], ['jacket', 'layer', /jacket|overshirt|shacket|bomber/],
  ['sweater', 'layer', /sweater|sweatshirt|hoodie|cardigan/], ['kurta', 'top', /kurta/], ['polo', 'top', /polo/], ['tshirt', 'top', /t-?shirt|tee/],
  ['shirt', 'top', /shirt/], ['jeans', 'bottom', /jean|denim/], ['shorts', 'bottom', /shorts/], ['chinos', 'bottom', /chino/],
  ['trousers', 'bottom', /trouser|pant/],
];
export function categorize(text: string): { category: string; slot: Slot } | null {
  const t = text.toLowerCase();
  const c = CATS.find(([, , re]) => re.test(t));
  return c ? { category: c[0], slot: c[1] } : null;
}
export function savedToProduct(row: { id: string; url?: string; source_url?: string | null; data?: any }): Product | null {
  const d = row.data ?? {};
  const c = categorize(`${d.category ?? ''} ${d.title ?? ''}`);
  if (!c || !row.url) return null;
  return {
    id: 'saved-' + row.id, title: d.title ?? 'Saved item', brand: d.brand ?? d.site ?? 'Saved', price: Math.round(d.price_inr || 0), currency: 'INR',
    url: row.source_url || `https://www.myntra.com/${encodeURIComponent(`${d.brand ?? ''} ${d.title ?? ''}`.trim()).replace(/%20/g, '-')}`,
    image: row.url, images: [row.url], category: c.category, slot: c.slot, colorName: d.color_name ?? '', colorHex: /^#[0-9a-f]{6}$/i.test(d.color_hex ?? '') ? d.color_hex : '#888888',
    fit: /oversi/i.test(d.fit ?? '') ? 'oversized' : /slim/i.test(d.fit ?? '') ? 'slim' : /relax|loose/i.test(d.fit ?? '') ? 'relaxed' : 'regular',
    fabric: d.fabric, occasions: [], sizes: [], source: 'Your saved screenshot',
  };
}
export const slim = (p: Product) => ({ id: p.id, title: p.title, brand: p.brand, price: p.price, url: p.url, image: p.image, colorName: p.colorName, colorHex: p.colorHex, fit: p.fit, category: p.category, slot: p.slot });
