# Stylo: AI stylist for men (demo PWA)

A mobile-first PWA. Upload 2–3 full-body photos and the app works out your **height-scaled body measurements, sizes, body shape and skin-tone colour palette on the device**. It then recommends outfits, judges Myntra and Ajio screenshots, shows **virtual try-ons on your own photo**, and explains everything in a chat with a stylist.

## How it works
1. **Overview → sign in → onboarding** (about you, 2 photos, your style guide). The style guide covers sizes, body shape, colour season and palette, with a confidence level on every number.
2. **Pick a situation**: Office, Everyday casual, Date & party, Wedding & festive, Beach & vacation, Winter & travel.
3. **Every combination rated.** The app shortlists the best real pieces per slot for *you* (tops, bottoms, shoes, optional blazer/jacket), enumerates every top × bottom × shoes (× layer) combination and scores each 0–10 on your palette, colour harmony, occasion formality, body fit, learned taste, size stock and budget, with plain-language reasons.
4. **Stylist ratings.** Gemini judges the top 12 as a senior menswear stylist and gives a score, a verdict and a tip. The final score blends both. All ratings are stored per user and situation (`outfit_ratings`).
5. **Build your own / mix & match.** Browse real products by category. "Wear" swaps a piece into the look, and "+ Mix" adds it to a set; every permutation of your picks is then rated and ranked.
6. **Preview on me.** A full-body try-on on your own photo, in a scene that matches the situation, with price tags pinned to each garment (pose detection on the generated image), a total price and buy links to each brand's store.

## Real catalog (no paid APIs)
The `catalog` Supabase Edge Function pulls live product feeds from Indian menswear brands on Shopify (Blackberrys, Andamen, The Bear House, Mr Button, Rare Rabbit, Powerlook, Offduty, Beyours, Urban Monkey, Jaywalking, Nicobar, Neeman's, Bacca Bucci, Monkstory and more). It classifies each item by category, slot, colour, fit, fabric and occasions, and upserts it into `products` (~6,000 items). It refreshes nightly with `pg_cron`, and also proxies product images so the try-on model can use them. For a demo, check each brand's terms before any commercial use.

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
| Catalog | Supabase Edge Function syncing live brand feeds nightly into `products` | Free tier |

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
