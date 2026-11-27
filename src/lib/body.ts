// Combines several photo analyses into one body profile, then maps it to Indian menswear sizes.
import type { PhotoAnalysis } from './vision';
import { classifySkin, ColorProfile, LAB } from './color';

export interface Metric { value: number; confidence: number; method: string }
export interface BodyProfile {
  heightCm: number;
  shoulder?: Metric; chest?: Metric; waist?: Metric; hip?: Metric; inseam?: Metric; sleeve?: Metric;
  shape: { name: string; tip: string };
  sizes: { top: string; topFit: string; trouserWaist: number; trouserLength: string; reasoning: string[] };
  photosUsed: { front: number; side: number };
  overallConfidence: number;
}

const median = (a: number[]) => { const s = a.filter((x) => x > 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const cv = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return a.length > 1 && m ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) / m : 0.05; };
const ellipse = (w: number, d: number) => { const a = w / 2, b = d / 2; return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))); };
const inch = (cm: number) => cm / 2.54;

// Average male depth/width ratios (used only when there is no side photo)
const DEFAULT_DEPTH = { chest: 0.72, waist: 0.8, hip: 0.74 };

export interface Anchors { usualWaistIn?: number; usualTop?: string; weightKg?: number }

export function buildBody(heightCm: number, analyses: PhotoAnalysis[], anchors: Anchors = {}): BodyProfile {
  const fronts = analyses.filter((a) => a.ok && a.kind === 'front');
  const sides = analyses.filter((a) => a.ok && a.kind === 'side');
  const hasSide = sides.length > 0;

  const circ = (key: 'chestW' | 'waistW' | 'hipW', name: 'chest' | 'waist' | 'hip', calib: number): Metric | undefined => {
    const ws = fronts.map((f) => f[key] ?? 0).filter(Boolean);
    if (!ws.length) return undefined;
    const w = median(ws);
    const ds = sides.map((s) => s[key] ?? 0).filter(Boolean);
    const d = ds.length ? median(ds) : w * DEFAULT_DEPTH[name];
    const value = ellipse(w, d) * calib;
    const conf = Math.max(0.2, Math.min(0.92, 0.55 + (hasSide ? 0.2 : 0) + Math.min(fronts.length - 1, 2) * 0.05 - cv(ws) * 2 - fronts.reduce((a, f) => a + f.issues.length, 0) * 0.04));
    return { value, confidence: conf, method: `${hasSide ? 'Front width × side depth' : 'Front width × average depth ratio (add a side photo for better accuracy)'}, ellipse perimeter, median of ${ws.length} photo(s)` };
  };

  // Calibration: body cross-sections are "rounded rectangles", a little larger than a pure ellipse
  const chest = circ('chestW', 'chest', 1.04);
  let waist = circ('waistW', 'waist', 1.02);
  const hip = circ('hipW', 'hip', 1.03);

  // Anchor to the user's known jeans size if given (jeans waist sits ~1.5" below the natural waist)
  const reasoning: string[] = [];
  if (anchors.usualWaistIn && waist) {
    const fromSize = (anchors.usualWaistIn + 1.5) * 2.54;
    const blended = waist.value * 0.4 + fromSize * 0.6;
    reasoning.push(`Blended the photo waist (${inch(waist.value).toFixed(1)}") with your usual jeans size ${anchors.usualWaistIn}.`);
    waist = { ...waist, value: blended, confidence: Math.min(0.95, waist.confidence + 0.2), method: waist.method + ' + your stated jeans size' };
  }

  const simple = (vals: number[], method: string, base: number): Metric | undefined => {
    const v = vals.filter(Boolean); if (!v.length) return undefined;
    return { value: median(v), confidence: Math.max(0.2, Math.min(0.9, base - cv(v) * 2)), method };
  };
  const shoulder = simple(fronts.map((f) => f.shoulderCm ?? 0), 'Distance between shoulder keypoints ×1.12 (joint centre → shoulder edge)', 0.7);
  const inseam = simple(analyses.filter((a) => a.ok).map((a) => a.inseamCm ?? 0), 'Hip joint → ankle keypoint, scaled by your height', 0.72);
  const sleeve = simple(fronts.map((f) => f.sleeveCm ?? 0), 'Shoulder → elbow → wrist keypoints + 3 cm', 0.6);

  // Body shape from chest/waist/hip/shoulder
  let shape = { name: 'Rectangle', tip: 'Add structure: layered looks, horizontal details on top, straight-fit trousers.' };
  if (chest && waist) {
    const drop = inch(chest.value - waist.value);
    const shToHip = shoulder && hip ? (shoulder.value * 2.4) / hip.value : 1;
    if (waist.value > chest.value * 1.02) shape = { name: 'Oval', tip: 'Go for vertical lines, darker solid tops, open-collar shirts and straight trousers. Avoid tight tees and big belts.' };
    else if (drop >= 9) shape = { name: 'Inverted triangle', tip: 'Balance a broad upper body: slim or tapered tops, straight or relaxed trousers, lighter colours on the bottom.' };
    else if (drop >= 5 || shToHip > 1.12) shape = { name: 'Trapezoid (athletic)', tip: 'The easiest shape to dress. Slim-fit shirts and tapered chinos show your proportions.' };
    else if (hip && hip.value > chest.value * 1.03) shape = { name: 'Triangle', tip: 'Add width on top: structured shoulders, overshirts, darker trousers.' };
  }

  // Sizes: Indian brand charts are usually body-chest based
  const chestIn = chest ? inch(chest.value) : 0;
  const top = !chestIn ? (anchors.usualTop ?? 'M') :
    chestIn < 37 ? 'S' : chestIn < 39.5 ? 'M' : chestIn < 41.5 ? 'L' : chestIn < 43.5 ? 'XL' : chestIn < 45.5 ? 'XXL' : '3XL';
  if (chestIn) reasoning.push(`Chest ≈ ${chestIn.toFixed(1)}" → size ${top} on typical Indian brand charts (S 36–38, M 38–40, L 40–42, XL 42–44).`);
  const waistIn = waist ? inch(waist.value) : 32;
  const trouserWaist = anchors.usualWaistIn ?? Math.max(26, Math.round((waistIn - 1.5) / 2) * 2);
  if (!anchors.usualWaistIn && waist) reasoning.push(`Natural waist ≈ ${waistIn.toFixed(1)}". Jeans sit lower, so size ${trouserWaist}.`);
  const dropIn = chest && waist ? inch(chest.value - waist.value) : 4;
  const topFit = dropIn >= 6 ? 'Slim fit' : dropIn >= 2.5 ? 'Regular / tailored fit' : 'Regular or relaxed fit';
  reasoning.push(`Chest-to-waist drop ${dropIn.toFixed(1)}" → ${topFit}.`);
  const inseamIn = inseam ? inch(inseam.value) : 0;
  const trouserLength = !inseamIn ? 'Regular' : inseamIn < 29 ? 'Short (≈28–29" inseam), so consider ankle-length cuts' : inseamIn < 32.5 ? 'Regular (≈30–32" inseam)' : 'Long (33"+ inseam), so check the "length" option';

  const metrics = [shoulder, chest, waist, hip, inseam].filter(Boolean) as Metric[];
  const overall = metrics.length ? metrics.reduce((a, m) => a + m.confidence, 0) / metrics.length : 0;
  return { heightCm, shoulder, chest, waist, hip, inseam, sleeve, shape, sizes: { top, topFit, trouserWaist, trouserLength, reasoning }, photosUsed: { front: fronts.length, side: sides.length }, overallConfidence: overall };
}

export function buildColor(analyses: PhotoAnalysis[]): ColorProfile | null {
  const withSkin = analyses.filter((a) => a.skin);
  if (!withSkin.length) return null;
  const avg = (arr: LAB[]): LAB => [0, 1, 2].map((k) => arr.reduce((s, v) => s + v[k], 0) / arr.length) as LAB;
  const skin = avg(withSkin.map((a) => a.skin!));
  const hairs = withSkin.filter((a) => a.hair).map((a) => a.hair!);
  const n = withSkin.reduce((s, a) => s + (a.skinN ?? 0), 0);
  const spread = withSkin.reduce((s, a) => s + (a.skinSpread ?? 0), 0) / withSkin.length;
  const cp = classifySkin(skin, hairs.length ? avg(hairs) : null, n, spread);
  if (withSkin.length > 1) cp.confidence = Math.min(0.95, cp.confidence + 0.05 * (withSkin.length - 1));
  return cp;
}

export const fmt = (cm?: number) => (cm ? `${Math.round(cm)} cm · ${inch(cm).toFixed(1)}"` : '—');
