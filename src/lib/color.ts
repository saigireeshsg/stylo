// Color science helpers: sRGB <-> CIELAB, ΔE, skin tone → season → palette.

export type RGB = [number, number, number];
export type LAB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function rgbToLab([r, g, b]: RGB): LAB {
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const hexToLab = (hex: string) => rgbToLab(hexToRgb(hex));

export function deltaE(a: LAB, b: LAB): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
export const chroma = (l: LAB) => Math.hypot(l[1], l[2]);
export const hueDeg = (l: LAB) => ((Math.atan2(l[2], l[1]) * 180) / Math.PI + 360) % 360;
export const isNeutral = (hex: string) => chroma(hexToLab(hex)) < 14;

// ---------- Skin tone ----------
export type Undertone = 'warm' | 'cool' | 'neutral';
export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export interface ColorProfile {
  skinHex: string;
  hairHex: string | null;
  ita: number; // Individual Typology Angle (dermatology skin-depth metric)
  depth: string; // very light … deep
  undertone: Undertone;
  contrast: 'low' | 'medium' | 'high';
  season: Season;
  best: { name: string; hex: string }[];
  neutrals: { name: string; hex: string }[];
  avoid: { name: string; hex: string }[];
  confidence: number; // 0..1
  why: string[];
}

export function itaDepth(ita: number): string {
  if (ita > 55) return 'very light';
  if (ita > 41) return 'light';
  if (ita > 28) return 'medium';
  if (ita > 10) return 'tan';
  if (ita > -30) return 'brown';
  return 'deep';
}

export const PALETTES: Record<Season, Pick<ColorProfile, 'best' | 'neutrals' | 'avoid'> & { blurb: string }> = {
  Spring: {
    blurb: 'Warm and fresh. Clear, warm colours light you up.',
    best: [
      { name: 'Coral', hex: '#F26B5B' }, { name: 'Warm turquoise', hex: '#2BB3A6' }, { name: 'Golden yellow', hex: '#F2B33D' },
      { name: 'Light camel', hex: '#C9A27A' }, { name: 'Kelly green', hex: '#3FA34D' }, { name: 'Warm aqua', hex: '#5CC6C0' },
    ],
    neutrals: [{ name: 'Ivory', hex: '#F4EEDC' }, { name: 'Camel', hex: '#B8865B' }, { name: 'Light navy', hex: '#3A4E7A' }],
    avoid: [{ name: 'Black', hex: '#111111' }, { name: 'Icy grey', hex: '#C9CED6' }, { name: 'Burgundy', hex: '#5E1A2B' }],
  },
  Summer: {
    blurb: 'Cool and soft. Muted, cool colours look calm and refined on you.',
    best: [
      { name: 'Dusty blue', hex: '#7A9CC6' }, { name: 'Soft teal', hex: '#4E8C8F' }, { name: 'Rose', hex: '#C27C8E' },
      { name: 'Lavender', hex: '#9C8AC0' }, { name: 'Slate', hex: '#6B7B8C' }, { name: 'Powder blue', hex: '#A9C6E3' },
    ],
    neutrals: [{ name: 'Soft white', hex: '#F2F2EE' }, { name: 'Grey', hex: '#8C9096' }, { name: 'Navy', hex: '#2A3A5C' }],
    avoid: [{ name: 'Orange', hex: '#F07A1A' }, { name: 'Mustard', hex: '#C99A1E' }, { name: 'Pure black', hex: '#0A0A0A' }],
  },
  Autumn: {
    blurb: 'Warm and rich. Earthy, deep warm colours make you look healthy and grounded.',
    best: [
      { name: 'Olive', hex: '#6B7B3A' }, { name: 'Rust', hex: '#B5532C' }, { name: 'Mustard', hex: '#C99A1E' },
      { name: 'Teal', hex: '#1F6F6B' }, { name: 'Brick', hex: '#8E3B2E' }, { name: 'Forest green', hex: '#2F5233' },
    ],
    neutrals: [{ name: 'Cream', hex: '#EFE6D2' }, { name: 'Khaki', hex: '#B5A27A' }, { name: 'Chocolate', hex: '#4A3022' }, { name: 'Navy', hex: '#24324F' }],
    avoid: [{ name: 'Neon', hex: '#39FF14' }, { name: 'Icy pink', hex: '#F4C6D7' }, { name: 'Silver grey', hex: '#C0C4CC' }],
  },
  Winter: {
    blurb: 'Cool and high-contrast. Crisp, deep or vivid colours look sharp on you.',
    best: [
      { name: 'Royal blue', hex: '#2549B8' }, { name: 'Emerald', hex: '#0F7A55' }, { name: 'Burgundy', hex: '#6B1F33' },
      { name: 'Crisp white', hex: '#FAFAFA' }, { name: 'Charcoal', hex: '#33363B' }, { name: 'Magenta', hex: '#A21E6A' },
    ],
    neutrals: [{ name: 'Black', hex: '#111111' }, { name: 'White', hex: '#FFFFFF' }, { name: 'Navy', hex: '#1B2545' }, { name: 'Charcoal', hex: '#3A3D42' }],
    avoid: [{ name: 'Beige', hex: '#D8C3A0' }, { name: 'Orange', hex: '#F07A1A' }, { name: 'Muted olive', hex: '#8A8A5C' }],
  },
};

export function classifySkin(skin: LAB, hair: LAB | null, sampleCount: number, spread: number): ColorProfile {
  const [L, a, b] = skin;
  const ita = (Math.atan2(L - 50, b) * 180) / Math.PI;
  const depth = itaDepth(ita);
  const h = hueDeg(skin);
  const undertone: Undertone = h > 60 ? 'warm' : h < 48 ? 'cool' : 'neutral';
  const dL = hair ? Math.abs(L - hair[0]) : 30;
  const contrast = dL > 40 ? 'high' : dL > 22 ? 'medium' : 'low';
  const deep = ita <= 28;
  let season: Season;
  if (undertone === 'warm') season = deep ? 'Autumn' : 'Spring';
  else if (undertone === 'cool') season = deep || contrast === 'high' ? 'Winter' : 'Summer';
  else season = contrast === 'high' ? 'Winter' : deep ? 'Autumn' : 'Summer';

  const why = [
    `Skin depth: ${depth} (ITA ${ita.toFixed(0)}°) measured from face pixels only.`,
    `Undertone: ${undertone} (skin hue ${h.toFixed(0)}°; warmer = more yellow/golden, cooler = more pink/red).`,
    `Contrast between hair and skin: ${contrast}.`,
    `${season}: ${PALETTES[season].blurb}`,
  ];
  // Confidence: more face pixels + tighter colour spread + undertone far from boundary
  const margin = Math.min(Math.abs(h - 60), Math.abs(h - 48)) / 12;
  const confidence = Math.max(0.2, Math.min(0.95, 0.35 + Math.min(sampleCount / 4000, 0.3) + Math.min(margin, 1) * 0.2 - Math.min(spread / 40, 0.2)));
  const { best, neutrals, avoid } = PALETTES[season];
  return {
    skinHex: rgbToHex(labToRgbApprox(skin)), hairHex: hair ? rgbToHex(labToRgbApprox(hair)) : null,
    ita, depth, undertone, contrast, season, best, neutrals, avoid, confidence, why,
  };
}

export function labToRgbApprox([L, a, b]: LAB): RGB {
  let Y = (L + 16) / 116, X = a / 500 + Y, Z = Y - b / 200;
  const f = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  X = f(X) * 0.95047; Y = f(Y); Z = f(Z) * 1.08883;
  let R = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  let G = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  let B = X * 0.0557 + Y * -0.204 + Z * 1.057;
  const g = (c: number) => 255 * (c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c);
  return [g(R), g(G), g(B)];
}

// ---------- Garment colour scoring ----------
/** 0..1: how well a garment colour suits the user's palette. */
export function paletteScore(garmentHex: string, cp: ColorProfile | null): { score: number; note: string } {
  if (!cp) return { score: 0.5, note: 'No colour profile yet' };
  const g = hexToLab(garmentHex);
  const near = (list: { name: string; hex: string }[]) =>
    list.map((c) => ({ c, d: deltaE(g, hexToLab(c.hex)) })).sort((x, y) => x.d - y.d)[0];
  const best = near(cp.best), neu = near(cp.neutrals), av = near(cp.avoid);
  if (av && av.d < 18) return { score: 0.15, note: `Close to ${av.c.name}, which washes out ${cp.season} colouring` };
  if (best.d < 22) return { score: 1 - best.d / 60, note: `Close to ${best.c.name}, one of your best colours` };
  if (neu.d < 22) return { score: 0.8 - neu.d / 80, note: `Close to ${neu.c.name}, a safe neutral for you` };
  return { score: Math.max(0.25, 0.7 - Math.min(best.d, neu.d) / 100), note: 'Not in your core palette; wear it away from your face' };
}

/** 0..1: how well two garment colours work together. */
export function harmonyScore(topHex: string, bottomHex: string): { score: number; note: string } {
  const t = hexToLab(topHex), b = hexToLab(bottomHex);
  const dL = Math.abs(t[0] - b[0]);
  const contrastOk = dL > 15;
  if (isNeutral(topHex) || isNeutral(bottomHex)) {
    return { score: contrastOk ? 0.9 : 0.6, note: contrastOk ? 'A neutral piece anchors the look, and the light/dark contrast is good' : 'Top and bottom are too similar in lightness; add contrast' };
  }
  const dh = Math.abs(hueDeg(t) - hueDeg(b));
  const diff = Math.min(dh, 360 - dh);
  if (diff < 35) return { score: contrastOk ? 0.85 : 0.6, note: 'Analogous colours (next to each other on the colour wheel)' };
  if (diff > 150) return { score: 0.75, note: 'Complementary colours: bold, so keep the shoes neutral' };
  return { score: 0.4, note: 'These two hues compete; swap one for a neutral' };
}

// Colour-name dictionary used to tag catalog items
export const COLOR_WORDS: Record<string, string> = {
  black: '#151515', white: '#F7F7F5', 'off white': '#EFEBE0', offwhite: '#EFEBE0', cream: '#EFE6D2', ivory: '#F4EEDC',
  beige: '#D8C3A0', khaki: '#B5A27A', camel: '#B8865B', tan: '#B98A5E', brown: '#6B4A2E', chocolate: '#4A3022', coffee: '#5A3B28',
  grey: '#8C9096', gray: '#8C9096', charcoal: '#36393E', silver: '#C0C4CC', navy: '#1F2A48', blue: '#2F5FA7', 'sky blue': '#8EC3E6',
  'light blue': '#A9C6E3', 'royal blue': '#2549B8', indigo: '#2E3A6E', teal: '#1F6F6B', turquoise: '#2BB3A6', aqua: '#5CC6C0',
  green: '#2F7A45', olive: '#6B7B3A', 'bottle green': '#0F4D32', emerald: '#0F7A55', mint: '#A8DCC4', sage: '#9CAF88', forest: '#2F5233',
  red: '#B3242B', maroon: '#5E1A2B', burgundy: '#6B1F33', wine: '#5E1A2B', rust: '#B5532C', brick: '#8E3B2E', orange: '#E8742A',
  coral: '#F26B5B', peach: '#F2B59A', pink: '#E59BB0', 'dusty pink': '#C9A0A6', lavender: '#9C8AC0', purple: '#5B3A7A', magenta: '#A21E6A',
  yellow: '#E8C547', mustard: '#C99A1E', gold: '#C9A23A', denim: '#3B5A85',
};

export function colorFromText(text: string): { name: string; hex: string } | null {
  const t = ' ' + text.toLowerCase().replace(/[^a-z ]/g, ' ') + ' ';
  const keys = Object.keys(COLOR_WORDS).sort((a, b) => b.length - a.length);
  for (const k of keys) if (t.includes(' ' + k + ' ')) return { name: k, hex: COLOR_WORDS[k] };
  return null;
}
