/** Turns any product image (SVG data URI, CDN URL, blob/signed URL) into a raster blob for the image model. */
export async function imageToBlob(src: string): Promise<Blob> {
  if (!src.startsWith('data:')) { try { const r = await fetch(src); if (r.ok) { const b = await r.blob(); if (!b.type.includes('svg')) return b; } } catch { /* CORS: fall through */ } }
  const img = new Image(); img.crossOrigin = 'anonymous';
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  const c = document.createElement('canvas'); c.width = img.naturalWidth || 600; c.height = img.naturalHeight || 600;
  if (c.width < 400) { const k = 600 / c.width; c.width *= k; c.height *= k; }
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
