// Stage 2 of rating: Gemini acts as a senior menswear stylist and re-rates the shortlisted looks.
import { generateJSON } from './gemini';
import type { Look, Situation } from './recommend';
import type { BodyProfile } from './body';
import type { ColorProfile } from './color';

const SCHEMA = {
  type: 'ARRAY',
  items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, score: { type: 'NUMBER' }, verdict: { type: 'STRING' }, tip: { type: 'STRING' } }, required: ['id', 'score', 'verdict', 'tip'] },
};

export async function judgeLooks(looks: Look[], sit: Situation, body: BodyProfile | null, color: ColorProfile | null) {
  const list = looks.map((l, i) => ({
    id: String(i),
    pieces: l.items.map((p) => `${p.slot}: ${p.brand} "${p.title}" (${p.colorName}, ${p.fit} fit${p.fabric ? ', ' + p.fabric : ''}, ₹${p.price})`),
  }));
  const prompt = `You are a senior menswear stylist in India. Rate each outfit for this client and situation, 0-10 with one decimal (be discerning: 9+ only for genuinely excellent looks).
Situation: ${sit.label} (${sit.sub}). Styling rule: ${sit.tip}
Client: ${body ? `${body.shape.name} build, height ${body.heightCm} cm, wears ${body.sizes.top} tops (${body.sizes.topFit})` : 'build unknown'}; ${color ? `${color.depth} skin, ${color.undertone} undertone, ${color.season} palette (best: ${color.best.map((c) => c.name).join(', ')}; avoid near face: ${color.avoid.map((c) => c.name).join(', ')})` : 'colouring unknown'}.
Judge colour harmony with his colouring, proportion and fit for his build, appropriateness for the situation, cohesion of the pieces and value.
For each: verdict = why it works or doesn't, in plain friendly words (max 22 words). tip = one concrete improvement (max 14 words).
Outfits: ${JSON.stringify(list)}`;
  const res = await generateJSON<{ id: string; score: number; verdict: string; tip: string }[]>(prompt, [], SCHEMA);
  return looks.map((l, i) => {
    const r = res.find((x) => x.id === String(i));
    return r ? { ...l, ai: { score: Math.max(0, Math.min(10, Math.round(r.score * 10) / 10)), verdict: r.verdict, tip: r.tip } } : l;
  });
}
export const finalScore = (l: Look) => (l.ai ? Math.round((l.score * 0.45 + l.ai.score * 0.55) * 10) / 10 : l.score);
