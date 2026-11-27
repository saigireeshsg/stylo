# Stylo: AI stylist for men (demo PWA)

A mobile-first PWA. Upload 2–3 full-body photos and the app works out your **height-scaled body measurements, sizes, body shape and skin-tone colour palette on the device**. It then recommends outfits, judges Myntra and Ajio screenshots, shows **virtual try-ons on your own photo**, and explains everything in a chat with a stylist.

## Outfit Studio (main screen)
- **See yourself** in a full outfit (layer, top, bottom, shoes): one Gemini image call with your best front photo plus each garment image.
- **Scenes**: Studio, Tropical beach, Office, Indian wedding, Café date, City street, Rooftop night, Hill station, or type any place ("sunset cruise in Goa"). The scene sets the occasion, so the stylist picks clothes that suit it, and the background of the try-on.
- **Price tags pinned to each garment**: MediaPipe pose runs on the generated image (on device) to find the chest, thigh, feet and arm.
- **Swap any piece**: alternatives are ranked by your palette and their harmony with the rest of the outfit. Your saved Myntra/Ajio screenshots can be mixed in.
- **"Another"** cycles the stylist's next pick. **Buy outfit** lists each piece with your size and a store link. Rate a look (1–5 ★) and the recommender learns from it.
- Every render is cached per outfit and scene in `tryons`, so revisiting doesn't use up Gemini quota.

## What runs where (₹0 setup, only a Gemini key)

| Feature | How | Cost |
|---|---|---|
| Body measurement (pose, segmentation) | MediaPipe Pose + Selfie-Multiclass models **bundled in `/public/models`**, running in the browser via WASM/GPU | Free, on device |
| Skin tone, undertone, season, palette | CIELAB colour science on face-skin pixels (ITA° + hue angle) | Free, on device |
| Outfit recommendations and learning | Rule-based scorer + taste learned from 👍/👎, A/B picks, try-on ratings | Free, on device |
| Screenshot verdict (Myntra/Ajio/Instagram) | Gemini text model (vision) | Gemini key |
| Virtual try-on | Gemini image model (`gemini-2.5-flash-image`) | Gemini key (the free tier is rate-limited) |
| Explain-only stylist chat | Gemini text model with the user's profile as context | Gemini key |
| Login, photos, history | Supabase Auth + Postgres + private Storage bucket, **or** IndexedDB on the device if Supabase isn't configured | Free tier |
| Catalog | Built-in demo items + `npm run sync-catalog` (public Shopify `/products.json` feeds of Indian D2C brands) | Free |

## Run it

```bash
npm install
cp .env.example .env      # add keys (all optional; Gemini is needed for try-on/chat/screenshots)
npm run dev               # http://localhost:5173
```

The phone camera and PWA install need HTTPS. For a phone demo, deploy `dist/` to Vercel, Netlify or Cloudflare Pages (`npm run build`), or tunnel the dev server.

### Supabase (optional but recommended)
1. Create a project, then open **SQL Editor** and run `supabase/schema.sql`. This creates the tables, Row Level Security and the private `stylo` bucket.
2. Auth → Providers: enable **Email** (turn off "Confirm email" for demos) and **Anonymous** (for the "Continue as guest" option).
3. Put the URL and anon key in `.env`, or paste them in-app under **Me → Settings**.

### Real products
```bash
npm run sync-catalog                     # writes public/catalog.json
STORES=www.snitch.com,example.in npm run sync-catalog
```
Stores that aren't Shopify are skipped. It's for a demo only, so check each brand's terms before any production use.

## The measurement algorithm (src/lib/vision.ts, src/lib/body.ts)
1. **Person mask** from the segmenter, then pixel height = top of the head to the floor contact point.
2. **Scale**: cm per pixel = your stated height ÷ pixel height. Height is the ruler.
3. **Front photo**: mask width at chest, waist and hip levels (placed between the shoulder and hip keypoints, clamped so arms and legs don't leak in). **Side photo**: the same scan gives depth.
4. **Circumference** = ellipse perimeter (Ramanujan) × a small calibration factor. With no side photo, depth comes from average male depth/width ratios, and the confidence is lowered accordingly.
5. Shoulder width (keypoints ×1.12), inseam (hip to ankle), sleeve (shoulder to elbow to wrist).
6. **Quality gates**: feet and head in frame, arms away from the body, standing straight (a lunge or wide stance is rejected for sizing), shoulders level.
7. Every photo is stored. The profile is the **median over all good photos**, so it refines as more are added. A known jeans size can anchor the waist.
8. Sizes are mapped to Indian brand charts (S 36–38" chest … XXL 44–46"), and the fit (slim, regular, relaxed) comes from the chest-to-waist drop.

Each metric shows its **confidence and method** in the app (Me → "how?"), and the photo viewer draws the scan lines, so users can see why to trust it, or why not.

Expected accuracy: about ±3–5 cm on chest and waist with a good front + side pair in fitted clothes. It's a demo, not a tailor.

## Notes for production
- Move the Gemini calls into a Supabase Edge Function. The demo exposes the key in the browser.
- Add affiliate deep links (Cuelinks, EarnKaro) for Myntra and Ajio.
- Swap Gemini try-on for a self-hosted CatVTON or IDM-VTON on a GPU if volume grows.
