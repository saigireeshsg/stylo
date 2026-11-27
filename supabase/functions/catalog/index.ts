// Stylo catalog function (Supabase Edge Function, Deno).
//  GET ?action=sync            → pull live product feeds from Indian menswear D2C Shopify stores,
//                                 classify (category, slot, colour, fit, fabric, occasions) and upsert into public.products
//                                 (rate-limited to once every 6 h unless ?force=1 with the service key)
//  GET ?action=img&u=<url>     → image proxy so the browser can send product photos to the try-on model (CORS)
//  GET ?action=status          → last sync summary
import { createClient } from 'jsr:@supabase/supabase-js@2';

const STORES = [
  // apparel
  'www.snitch.com', 'www.powerlook.in', 'thehouseofrare.com', 'www.thebearhouse.com', 'www.urbanmonkey.com',
  'www.offduty.in', 'andamen.com', 'www.beyours.in', 'www.damensch.com', 'www.almostgods.com', 'www.mrbutton.in',
  'www.jaywalking.in', 'www.bonkerscorner.com', 'www.thesouledstore.com', 'www.blackberrys.com', 'www.nicobar.com',
  // footwear
  'www.neemans.com', 'www.baccabucci.com', 'www.wearcomet.com', 'www.thomasbrooke.in', 'www.monkstory.com',
];

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const COLORS: Record<string, string> = {
  black: '#151515', white: '#F7F7F5', 'off white': '#EFEBE0', 'off-white': '#EFEBE0', cream: '#EFE6D2', ivory: '#F4EEDC', ecru: '#E9E1CF',
  beige: '#D8C3A0', sand: '#D6C3A1', stone: '#C9BFAE', khaki: '#B5A27A', camel: '#B8865B', tan: '#B98A5E', taupe: '#8B7D6B',
  brown: '#6B4A2E', chocolate: '#4A3022', coffee: '#5A3B28', mocha: '#6F4E37', rust: '#B5532C', brick: '#8E3B2E', copper: '#B06A3B',
  grey: '#8C9096', gray: '#8C9096', 'light grey': '#BFC3C8', 'dark grey': '#4E5257', charcoal: '#36393E', silver: '#C0C4CC', ash: '#B2B5B8',
  navy: '#1F2A48', 'navy blue': '#1F2A48', blue: '#2F5FA7', 'sky blue': '#8EC3E6', 'light blue': '#A9C6E3', 'powder blue': '#A9C6E3', 'ice blue': '#CFE3F2',
  'royal blue': '#2549B8', cobalt: '#1F4BB0', indigo: '#2E3A6E', denim: '#3B5A85', teal: '#1F6F6B', turquoise: '#2BB3A6', aqua: '#5CC6C0',
  green: '#2F7A45', olive: '#6B7B3A', 'olive green': '#6B7B3A', 'bottle green': '#0F4D32', emerald: '#0F7A55', mint: '#A8DCC4', sage: '#9CAF88',
  forest: '#2F5233', 'forest green': '#2F5233', 'dark green': '#24412D', 'military green': '#4B5320', moss: '#6B7A3A',
  red: '#B3242B', maroon: '#5E1A2B', burgundy: '#6B1F33', wine: '#5E1A2B', orange: '#E8742A', coral: '#F26B5B', peach: '#F2B59A',
  pink: '#E59BB0', 'dusty pink': '#C9A0A6', blush: '#E8C4C0', lavender: '#9C8AC0', lilac: '#B9A3D0', purple: '#5B3A7A', mauve: '#A7869A',
  magenta: '#A21E6A', yellow: '#E8C547', mustard: '#C99A1E', gold: '#C9A23A', lemon: '#F2E27D',
};
const COLOR_KEYS = Object.keys(COLORS).sort((a, b) => b.length - a.length);
const colorOf = (t: string) => { const s = ' ' + t.toLowerCase().replace(/[^a-z -]/g, ' ') + ' '; for (const k of COLOR_KEYS) if (s.includes(' ' + k + ' ')) return k; return null; };

// order matters: most specific first
const CATS: [string, string, RegExp][] = [
  ['mojari', 'shoes', /\b(mojari|jutti|juti|kolhapuri)\b/],
  ['sandals', 'shoes', /\b(sandals?|slides?|flip[- ]?flops?|clogs?)\b/],
  ['boots', 'shoes', /\b(boots?|chelsea)\b/],
  ['loafers', 'shoes', /\b(loafers?|moccasins?|penny|driving shoes?|mules?)\b/],
  ['formal', 'shoes', /\b(derby|derbies|oxfords? shoes?|brogues?|monk ?straps?|formal shoes?)\b/],
  ['sneakers', 'shoes', /\b(sneakers?|trainers?|running shoes?|canvas shoes?|court shoes?|shoes)\b/],
  ['blazer', 'layer', /\b(blazers?|suit jackets?|tuxedo|bandhgala|nehru jackets?|waistcoats?)\b/],
  ['coat', 'layer', /\b(coats?|trench|overcoats?|puffer|parka)\b/],
  ['jacket', 'layer', /\b(jackets?|bombers?|overshirts?|shackets?|varsity|windcheater|gilet)\b/],
  ['sweater', 'layer', /\b(sweaters?|sweatshirts?|hoodies?|pullovers?|cardigans?|knit polo)\b/],
  ['kurta', 'top', /\b(kurtas?|kurta set|sherwani|pathani)\b/],
  ['polo', 'top', /\bpolos?\b/],
  ['tshirt', 'top', /\b(t-?shirts?|tees?|henleys?|tank)\b/],
  ['shirt', 'top', /\bshirts?\b/],
  ['jeans', 'bottom', /\b(jeans|denims?)\b/],
  ['shorts', 'bottom', /\bshorts\b/],
  ['chinos', 'bottom', /\bchinos?\b/],
  ['joggers', 'bottom', /\b(joggers?|track ?pants?|sweatpants?)\b/],
  ['cargo', 'bottom', /\bcargos?\b/],
  ['trousers', 'bottom', /\b(trousers?|pants?|slacks|korean pants?)\b/],
];
const EXCLUDE = /\b(women|womens|woman|ladies|girls?|kids?|boys?|dress|skirt|bra|kurti|saree|lehenga|socks?|belts?|wallets?|perfumes?|caps?|hats?|boxers?|briefs?|trunks?|innerwear|vest|underwear|bags?|backpack|mask|gift ?card|combo|pack of|bundle|keychain|sunglasses|watch|bracelet|chain|ring|cologne|deo)\b/;
const FITS: [string, RegExp][] = [['oversized', /oversi[sz]e|boxy|drop shoulder/], ['relaxed', /relax|loose|baggy|wide[- ]leg|straight[- ]?fit|comfort fit/], ['slim', /slim|skinny|tapered|muscle fit|super slim/]];
const FABRICS = ['linen', 'cotton', 'denim', 'corduroy', 'satin', 'silk', 'wool', 'knit', 'polyester', 'rayon', 'viscose', 'suede', 'leather', 'terry', 'twill', 'oxford', 'poplin', 'seersucker', 'flannel', 'chambray', 'velvet'];

function occasionsOf(cat: string, text: string): string[] {
  const t = text.toLowerCase(); const o = new Set<string>();
  const printed = /print|floral|graphic|hawaiian|resort|cuban|camp collar|aop|tropical|abstract/.test(t);
  const formal = /formal|office|work|business|pleated|tailored|suit|smart|oxford|poplin|dobby|twill/.test(t);
  switch (cat) {
    case 'shirt': o.add('casual'); if (!printed && !/oversi/.test(t)) o.add('office'); if (formal) o.add('office'); if (printed || /linen|cuban|resort/.test(t)) o.add('resort'); if (/satin|black|silk|velvet|print/.test(t)) o.add('party'); break;
    case 'tshirt': o.add('casual'); if (/linen|resort|print/.test(t)) o.add('resort'); break;
    case 'polo': o.add('casual'); o.add('office'); o.add('resort'); break;
    case 'kurta': o.add('ethnic'); break;
    case 'blazer': o.add('office'); o.add('party'); if (/bandhgala|nehru|ethnic/.test(t)) o.add('ethnic'); break;
    case 'coat': o.add('winter'); o.add('office'); break;
    case 'jacket': o.add('casual'); o.add('winter'); if (/leather|suede|bomber/.test(t)) o.add('party'); break;
    case 'sweater': o.add('winter'); o.add('casual'); break;
    case 'jeans': o.add('casual'); o.add('party'); break;
    case 'chinos': o.add('casual'); o.add('office'); o.add('resort'); break;
    case 'trousers': o.add('office'); o.add('casual'); if (/pleated|formal|tailored/.test(t)) o.add('party'); if (/linen/.test(t)) o.add('resort'); o.add('ethnic'); break;
    case 'cargo': case 'joggers': o.add('casual'); break;
    case 'shorts': o.add('resort'); o.add('casual'); break;
    case 'sneakers': o.add('casual'); if (/white|leather|minimal|court/.test(t)) o.add('party'); break;
    case 'loafers': o.add('office'); o.add('party'); o.add('resort'); o.add('ethnic'); break;
    case 'formal': o.add('office'); o.add('party'); break;
    case 'boots': o.add('winter'); o.add('party'); o.add('casual'); break;
    case 'sandals': o.add('resort'); break;
    case 'mojari': o.add('ethnic'); break;
  }
  return [...o];
}

interface ShopifyProduct { id: number; title: string; handle: string; body_html?: string; product_type?: string; tags?: string[] | string; vendor?: string;
  options?: { name: string; values: string[] }[]; variants?: { price: string; compare_at_price?: string | null; available?: boolean; option1?: string; option2?: string; option3?: string }[]; images?: { src: string }[] }

function classify(host: string, p: ShopifyProduct) {
  const tags = Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags ?? '');
  const head = `${p.title} ${p.product_type ?? ''}`.toLowerCase();
  const text = `${head} ${tags}`.toLowerCase();
  if (EXCLUDE.test(head) || /\b(women|womens|ladies)\b/.test(text) && !/\bmen\b/.test(text)) return null;
  const cat = CATS.find(([, , re]) => re.test(head)) ?? CATS.find(([, , re]) => re.test(text));
  if (!cat) return null;
  const optColor = (p.options ?? []).find((o) => /colou?r|shade/i.test(o.name))?.values?.[0] ?? '';
  const color = colorOf(`${optColor} ${p.title}`) ?? colorOf(tags);
  const imgs = (p.images ?? []).map((i) => i.src.split('?')[0]).slice(0, 4);
  const v = p.variants ?? [];
  if (!color || !imgs.length || !v.length) return null;
  const sizeOpt = (p.options ?? []).find((o) => /size|waist/i.test(o.name));
  const price = Math.round(Math.min(...v.map((x) => Number(x.price) || Infinity)));
  const compare = Math.round(Number(v[0].compare_at_price) || 0);
  const desc = (p.body_html ?? '').replace(/<[^>]+>/g, ' ').toLowerCase();
  const fabric = FABRICS.find((f) => text.includes(f) || desc.includes(f)) ?? null;
  return {
    id: `${host}:${p.id}`, source: host, brand: (p.vendor || host.replace(/^www\./, '').split('.')[0]).trim(),
    title: p.title.trim(), url: `https://${host}/products/${p.handle}`, image: imgs[0], images: imgs,
    price, compare_at: compare > price ? compare : null, category: cat[0], slot: cat[1],
    color_name: color, color_hex: COLORS[color], fit: (FITS.find(([, re]) => re.test(text))?.[0]) ?? 'regular',
    fabric, occasions: occasionsOf(cat[0], `${text} ${fabric ?? ''}`), sizes: sizeOpt?.values ?? [],
    available: v.some((x) => x.available !== false), updated_at: new Date().toISOString(),
  };
}

async function fetchStore(host: string) {
  const out: any[] = []; let pages = 0;
  for (let page = 1; page <= 3; page++) {
    const r = await fetch(`https://${host}/products.json?limit=250&page=${page}`, { headers: { 'User-Agent': 'Mozilla/5.0 (StyloCatalog/1.0; demo)', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) { if (page === 1) throw new Error('HTTP ' + r.status); break; }
    const { products } = await r.json() as { products: ShopifyProduct[] };
    pages++;
    for (const p of products ?? []) { const c = classify(host, p); if (c) out.push(c); }
    if (!products || products.length < 250) break;
  }
  return { items: out, pages };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'status';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  if (action === 'img') {
    const u = url.searchParams.get('u') ?? '';
    let host = '';
    try { host = new URL(u).hostname; } catch { return json({ error: 'bad url' }, 400); }
    if (!(host.endsWith('cdn.shopify.com') || host.endsWith('shopifycdn.com') || STORES.includes(host))) return json({ error: 'host not allowed' }, 403);
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (StyloCatalog/1.0)' } });
    if (!r.ok) return json({ error: 'upstream ' + r.status }, 502);
    return new Response(r.body, { headers: { ...CORS, 'Content-Type': r.headers.get('content-type') ?? 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
  }

  if (action === 'status') {
    const { data } = await db.from('catalog_meta').select('*').eq('id', 1).maybeSingle();
    const { count } = await db.from('products').select('*', { count: 'exact', head: true });
    return json({ ...data, products: count });
  }

  if (action === 'sync') {
    const { data: meta } = await db.from('catalog_meta').select('*').eq('id', 1).maybeSingle();
    const isService = (req.headers.get('authorization') ?? '').includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const force = url.searchParams.get('force') === '1' && isService;
    if (meta?.last_sync && Date.now() - new Date(meta.last_sync).getTime() < 6 * 3600e3 && !force) return json({ skipped: true, reason: 'synced recently', ...meta });
    const results = await Promise.allSettled(STORES.map(fetchStore));
    const report: Record<string, string> = {}; const all: any[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') { report[STORES[i]] = `${r.value.items.length} items (${r.value.pages} page/s)`; all.push(...r.value.items); }
      else report[STORES[i]] = 'skipped: ' + String(r.reason?.message ?? r.reason).slice(0, 80);
    });
    const seen = new Set<string>(); const rows = all.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('products').upsert(rows.slice(i, i + 500));
      if (error) return json({ error: error.message, report }, 500);
    }
    const summary = { id: 1, last_sync: new Date().toISOString(), total: rows.length, report };
    await db.from('catalog_meta').upsert(summary);
    return json(summary);
  }
  return json({ error: 'unknown action' }, 400);
});
