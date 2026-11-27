// Minimal Gemini REST client (no SDK). The demo calls it straight from the browser; for production,
// move these calls behind a Supabase Edge Function so the key never ships to the client.
import { getConfig } from './config';

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };
export interface ChatTurn { role: 'user' | 'model'; text: string }

export async function blobToPart(blob: Blob): Promise<Part> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { inline_data: { mime_type: blob.type || 'image/jpeg', data: btoa(s) } };
}

async function call(model: string, body: any) {
  const { geminiKey } = getConfig();
  if (!geminiKey) throw new Error('Add your Gemini API key in Me → Settings.');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Gemini error ${r.status}`);
  return j;
}
const textOf = (j: any) => (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();

export async function generateJSON<T>(prompt: string, images: Blob[] = [], schema?: any): Promise<T> {
  const parts: Part[] = [...(await Promise.all(images.map(blobToPart))), { text: prompt }];
  const j = await call(getConfig().textModel, {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', ...(schema ? { responseSchema: schema } : {}), temperature: 0.3 },
  });
  return JSON.parse(textOf(j));
}

export async function chat(system: string, history: ChatTurn[]): Promise<string> {
  const j = await call(getConfig().textModel, {
    systemInstruction: { parts: [{ text: system }] },
    contents: history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: { temperature: 0.5, maxOutputTokens: 700 },
  });
  return textOf(j) || 'Sorry, I could not answer that.';
}

/** Virtual try-on with Gemini's image model: person photo + garment image(s) → new full-body image. */
export async function tryOn(person: Blob, garments: Blob[], instructions: string, scene = 'a clean light-grey photo studio backdrop with soft even lighting'): Promise<Blob> {
  const parts: Part[] = [await blobToPart(person), ...(await Promise.all(garments.map(blobToPart))), {
    text:
      `Virtual try-on. Image 1 is the customer. The following image(s) show the garment(s): ${instructions}.\n` +
      'Generate a photorealistic FULL-BODY photo of the SAME person from image 1 wearing these garments. ' +
      'Keep his face, skin tone, hair, body shape, height proportions and pose exactly the same. ' +
      'Copy the garment colour, pattern, fabric texture, collar and fit faithfully, and drape it realistically for his body size. ' +
      `Head to feet clearly visible, standing naturally, vertical 3:4 framing. Setting: ${scene}; match the lighting and colour of the light on him to that setting so it looks like a real photo taken there. Do not add text, watermarks or logos.`,
  }];
  const j = await call(getConfig().imageModel, { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } });
  const img = (j.candidates?.[0]?.content?.parts ?? []).find((p: any) => p.inlineData || p.inline_data);
  if (!img) throw new Error(textOf(j) || 'The image model returned no image (it may be rate-limited on the free tier). Try again in a minute.');
  const d = img.inlineData ?? img.inline_data;
  const bin = atob(d.data); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: d.mimeType ?? d.mime_type ?? 'image/png' });
}
