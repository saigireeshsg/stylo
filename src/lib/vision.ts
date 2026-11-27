// On-device body analysis. Everything here runs in the browser (WASM, GPU when available),
// so no photo leaves the phone for measurement.
//
// Models (bundled in /public/models, run via MediaPipe Tasks):
//  - pose_landmarker_full: 33 body keypoints
//  - selfie_multiclass_256x256: per-pixel classes 0 bg, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 other
//
// Algorithm (per photo):
//  1. Person mask = every non-background pixel. Pixel height = top of head row → lowest foot row.
//  2. Scale: cm per pixel = the user's stated height / pixel height. Height is the anchor; everything else is derived.
//  3. Front photo: scan mask rows at anatomical levels (chest/waist/hip) between the shoulder and hip keypoints
//     and take the contiguous run around the body centre-line, giving the body WIDTH at that level.
//     Side photo: the same scan gives body DEPTH.
//  4. Circumference = perimeter of an ellipse with that width × depth (Ramanujan). With no side photo, depth
//     comes from average male depth/width ratios, which lowers confidence.
//  5. Face-skin and hair pixels give the skin colour (CIELAB) and hair contrast for colour analysis.

import { FilesetResolver, PoseLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import { rgbToLab, LAB } from './color';

const BASE = import.meta.env.BASE_URL;
let pose: PoseLandmarker | null = null;
let seg: ImageSegmenter | null = null;

export async function loadModels(onProgress?: (s: string) => void) {
  if (pose && seg) return;
  onProgress?.('Loading on-device vision runtime…');
  const fileset = await FilesetResolver.forVisionTasks(BASE + 'wasm');
  const mk = async (delegate: 'GPU' | 'CPU') => {
    onProgress?.('Loading pose model…');
    pose = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: BASE + 'models/pose_landmarker_full.task', delegate },
      runningMode: 'IMAGE', numPoses: 1,
    });
    onProgress?.('Loading body-segmentation model…');
    seg = await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: BASE + 'models/selfie_multiclass_256x256.tflite', delegate },
      runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false,
    });
  };
  try { await mk('GPU'); } catch { await mk('CPU'); }
}

export type PhotoKind = 'front' | 'side';
export interface Line { y: number; x0: number; x1: number; label: string } // normalized 0..1

export interface PhotoAnalysis {
  kind: PhotoKind;
  ok: boolean;
  issues: string[];
  pxHeight: number;
  cmPerPx: number;
  shoulderCm?: number;
  chestW?: number; waistW?: number; hipW?: number; // widths (front) or depths (side), cm
  inseamCm?: number; sleeveCm?: number; torsoCm?: number;
  skin?: LAB; skinN?: number; skinSpread?: number; hair?: LAB;
  lines: Line[];
  keypoints: { x: number; y: number; v: number }[];
  quality: number; // 0..1
}

const L = { nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lAn: 27, rAn: 28, lHeel: 29, rHeel: 30, lFt: 31, rFt: 32 };

export async function analyzePhoto(img: HTMLImageElement | HTMLCanvasElement, heightCm: number, hint?: PhotoKind): Promise<PhotoAnalysis> {
  await loadModels();
  const W = img.width, H = img.height;
  const issues: string[] = [];
  const pr = pose!.detect(img);
  const lm = pr.landmarks?.[0];
  if (!lm) return { kind: hint ?? 'front', ok: false, issues: ['No person detected. Use a clear, full-body photo.'], pxHeight: 0, cmPerPx: 0, lines: [], keypoints: [], quality: 0 };
  const kp = lm.map((p) => ({ x: p.x, y: p.y, v: p.visibility ?? 1 }));

  // Category mask (copied out because the data only lives inside the callback)
  let mask: Uint8Array = new Uint8Array(0);
  let mw = W, mh = H;
  seg!.segment(img, (res) => {
    const m = res.categoryMask!;
    mw = m.width; mh = m.height;
    mask = new Uint8Array(m.getAsUint8Array());
  });
  // Pixel data for colour sampling
  const cv = document.createElement('canvas');
  cv.width = mw; cv.height = mh;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, mw, mh);
  const px = ctx.getImageData(0, 0, mw, mh).data;

  const at = (x: number, y: number) => mask[y * mw + x];
  const isPerson = (x: number, y: number) => at(x, y) > 0;

  // Person vertical extent (columns near the centre-line, so a stray background blob doesn't count)
  const cx = Math.round(((kp[L.lSh].x + kp[L.rSh].x + kp[L.lHip].x + kp[L.rHip].x) / 4) * mw);
  const band = Math.round(mw * 0.12);
  let top = -1, bottom = -1;
  for (let y = 0; y < mh && top < 0; y++) for (let x = Math.max(0, cx - band); x < Math.min(mw, cx + band); x++) if (isPerson(x, y)) { top = y; break; }
  const footY = Math.max(kp[L.lHeel].y, kp[L.rHeel].y, kp[L.lFt].y, kp[L.rFt].y) * mh;
  for (let y = mh - 1; y >= 0 && bottom < 0; y--) {
    if (y > footY + mh * 0.04) continue;
    for (let x = 0; x < mw; x++) if (isPerson(x, y)) { bottom = y; break; }
  }
  if (top < 0 || bottom < 0) return { kind: hint ?? 'front', ok: false, issues: ['Could not segment the body.'], pxHeight: 0, cmPerPx: 0, lines: [], keypoints: kp, quality: 0 };
  if (top < mh * 0.01) issues.push('Head touches the top edge; leave some space above your head.');
  if (bottom > mh * 0.995 || kp[L.lAn].v < 0.5 || kp[L.rAn].v < 0.5) issues.push('Feet not clearly visible; include your full feet.');
  const pxH = bottom - top;
  if (pxH < mh * 0.5) issues.push('You are small in the frame; step closer so your body fills about 80% of the height.');
  const cmPerPx = heightCm / pxH;

  // Front vs side: shoulder spread relative to torso length
  const shY = ((kp[L.lSh].y + kp[L.rSh].y) / 2) * mh;
  const hipY = ((kp[L.lHip].y + kp[L.rHip].y) / 2) * mh;
  const torsoPx = hipY - shY;
  const shSpreadPx = Math.abs(kp[L.lSh].x - kp[L.rSh].x) * mw;
  const kind: PhotoKind = hint ?? (shSpreadPx / torsoPx < 0.45 ? 'side' : 'front');
  const hipSpreadPx = Math.abs(kp[L.lHip].x - kp[L.rHip].x) * mw;
  const clamped = new Set<string>();
  let critical = false;

  // Standing-pose checks: height scaling only works if he stands straight
  const ankleSpread = Math.abs(kp[L.lAn].x - kp[L.rAn].x) * mw;
  const legLen = (h: number, k: number, a: number) => Math.hypot((kp[h].x - kp[k].x) * mw, (kp[h].y - kp[k].y) * mh) + Math.hypot((kp[k].x - kp[a].x) * mw, (kp[k].y - kp[a].y) * mh);
  const legVert = (Math.max(kp[L.lAn].y, kp[L.rAn].y) * mh - hipY);
  const legStraight = legVert / Math.max(legLen(L.lHip, 25, L.lAn), legLen(L.rHip, 26, L.rAn));
  if (ankleSpread > Math.max(hipSpreadPx, shSpreadPx * 0.6) * 2.2 || legStraight < 0.85) { critical = true; } if (critical) issues.push('Please stand straight with feet about hip-width apart. A bent or wide stance makes your height (our ruler) look shorter.');
  if (Math.abs(kp[L.lSh].y - kp[L.rSh].y) * mh > torsoPx * 0.15) issues.push('Shoulders are tilted. Face the camera squarely.');

  // Row width scan: contiguous person run containing the centre-line at row y
  const lines: Line[] = [];
  const runAt = (yf: number, label: string) => {
    const y = Math.round(yf);
    const cxr = Math.round(((kp[L.lSh].x + kp[L.rSh].x) / 2 * (1 - (yf - shY) / torsoPx) + (kp[L.lHip].x + kp[L.rHip].x) / 2 * ((yf - shY) / torsoPx)) * mw);
    if (!isPerson(cxr, y)) return 0;
    let x0 = cxr, x1 = cxr;
    // A torso is never wider than ~1.25× the shoulder-keypoint spread (front) or ~0.9× the torso length (side);
    // the clamp stops the scan from running into arms or spread legs.
    const maxHalf = (kind === 'front' ? Math.max(shSpreadPx, hipSpreadPx * 1.6) * 0.62 : torsoPx * 0.45);
    while (x0 > 0 && cxr - x0 < maxHalf && isPerson(x0 - 1, y)) x0--;
    while (x1 < mw - 1 && x1 - cxr < maxHalf && isPerson(x1 + 1, y)) x1++;
    if (cxr - x0 >= maxHalf || x1 - cxr >= maxHalf) if (label) clamped.add(label);
    lines.push({ y: y / mh, x0: x0 / mw, x1: x1 / mw, label });
    return (x1 - x0 + 1) * cmPerPx;
  };
  // Median over a few rows to reduce noise
  const med = (arr: number[]) => arr.filter((v) => v > 0).sort((a, b) => a - b)[Math.floor(arr.filter((v) => v > 0).length / 2)] ?? 0;
  const scan = (frac: number, label: string) => {
    const vals = [-0.02, 0, 0.02].map((d) => runAt(shY + torsoPx * (frac + d), d === 0 ? label : ''));
    // keep only the labelled line for drawing
    for (let i = lines.length - 1; i >= 0; i--) if (!lines[i].label) lines.splice(i, 1);
    return med(vals);
  };
  const chestW = scan(0.3, kind === 'front' ? 'Chest width' : 'Chest depth');
  const waistW = scan(0.78, kind === 'front' ? 'Waist width' : 'Waist depth');
  const hipW = scan(1.08, kind === 'front' ? 'Hip width' : 'Hip depth');
  if (clamped.size) issues.push(`Arms or legs merged with your body at ${[...clamped].join(', ').toLowerCase()}, so the reading was limited to a typical range.`);

  // Arms glued to the torso inflate the chest width; detect wrists inside the torso run
  if (kind === 'front') {
    const chestLine = lines.find((l) => l.label.startsWith('Chest'));
    const wristsInside = [kp[L.lWr], kp[L.rWr], kp[L.lEl], kp[L.rEl]].some((w) => chestLine && w.x > chestLine.x0 && w.x < chestLine.x1 && w.y * mh > shY && w.y * mh < hipY);
    if (wristsInside) issues.push('Arms are touching your body. Hold them slightly away (A-pose) for accurate chest and waist width.');
  }

  const dist = (a: number, b: number) => Math.hypot((kp[a].x - kp[b].x) * mw, (kp[a].y - kp[b].y) * mh) * cmPerPx;
  const shoulderCm = kind === 'front' ? dist(L.lSh, L.rSh) * 1.12 : undefined; // keypoints sit at joint centres; ×1.12 ≈ shoulder-point to shoulder-point
  const inseamCm = ((Math.max(kp[L.lAn].y, kp[L.rAn].y) * mh - hipY) * cmPerPx) - heightCm * 0.01;
  const sleeveCm = Math.max(dist(L.lSh, L.lEl) + dist(L.lEl, L.lWr), dist(L.rSh, L.rEl) + dist(L.rEl, L.rWr)) + 3;
  const torsoCm = torsoPx * cmPerPx;

  // Skin (face-skin class 3) and hair (class 1) colour
  const skinLabs: LAB[] = [], hairLabs: LAB[] = [];
  const step = Math.max(1, Math.floor(Math.sqrt((mw * mh) / 400000)));
  for (let y = 0; y < mh; y += step) for (let x = 0; x < mw; x += step) {
    const c = at(x, y);
    if (c !== 3 && c !== 1) continue;
    const i = (y * mw + x) * 4;
    const lab = rgbToLab([px[i], px[i + 1], px[i + 2]]);
    (c === 3 ? skinLabs : hairLabs).push(lab);
  }
  const robust = (labs: LAB[]) => {
    if (labs.length < 30) return null;
    const s = [...labs].sort((a, b) => a[0] - b[0]);
    const mid = s.slice(Math.floor(s.length * 0.2), Math.floor(s.length * 0.8)); // drop highlights & shadows
    const m = (k: 0 | 1 | 2) => mid.reduce((acc, v) => acc + v[k], 0) / mid.length;
    const mean: LAB = [m(0), m(1), m(2)];
    const spread = Math.sqrt(mid.reduce((acc, v) => acc + (v[1] - mean[1]) ** 2 + (v[2] - mean[2]) ** 2, 0) / mid.length);
    return { mean, spread, n: labs.length };
  };
  const sk = robust(skinLabs), hr = robust(hairLabs);
  if (!sk) issues.push('Face is too small or hidden, so skin tone could not be measured. Add a photo with your face visible in daylight.');

  const vis = [L.lSh, L.rSh, L.lHip, L.rHip, L.lAn, L.rAn].reduce((a, i) => a + kp[i].v, 0) / 6;
  const quality = Math.max(0, Math.min(1, vis - issues.length * 0.2));

  return {
    kind, ok: quality > 0.35 && !critical, issues, pxHeight: pxH, cmPerPx,
    shoulderCm, chestW, waistW, hipW, inseamCm, sleeveCm, torsoCm,
    skin: sk?.mean, skinN: sk?.n, skinSpread: sk?.spread, hair: hr?.mean,
    lines: [...lines, { y: top / mh, x0: cx / mw - 0.08, x1: cx / mw + 0.08, label: 'Top of head' }, { y: bottom / mh, x0: cx / mw - 0.1, x1: cx / mw + 0.1, label: 'Floor' }],
    keypoints: kp, quality,
  };
}

/**
 * Where to pin each garment's price tag on a try-on image: run pose detection on the GENERATED image
 * (on device) and pick an anchor point per garment slot. Returns normalized 0..1 coordinates.
 */
export type Anchor = { x: number; y: number };
export async function garmentAnchors(img: HTMLImageElement): Promise<Record<'top' | 'layer' | 'bottom' | 'shoes', Anchor> | null> {
  await loadModels();
  const lm = pose!.detect(img).landmarks?.[0];
  if (!lm) return null;
  const P = (i: number) => lm[i];
  const lerp = (a: Anchor, b: Anchor, t: number): Anchor => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const mid = (a: Anchor, b: Anchor) => lerp(a, b, 0.5);
  const sh = mid(P(L.lSh), P(L.rSh)), hip = mid(P(L.lHip), P(L.rHip));
  return {
    top: lerp(sh, hip, 0.35),
    layer: lerp(P(L.rSh), P(L.rEl), 0.45),        // outer arm/shoulder: where a jacket shows
    bottom: lerp(P(L.lHip), P(25), 0.55),           // mid-thigh
    shoes: P(L.lFt).visibility && P(L.lFt).visibility! > 0.3 ? mid(P(L.lAn), P(L.lFt)) : P(L.lAn),
  };
}
