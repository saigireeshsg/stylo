// "Ask your stylist": an explain-only assistant. It can explain the user's profile, measurements,
// colours, recommendations, sizes and how much to trust each one. It cannot take actions.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state';
import { chat, ChatTurn } from '../lib/gemini';
import { insert, list } from '../lib/store';
import { rateAll, SITUATIONS } from '../lib/recommend';
import { Icon } from '../ui';

const SUGGESTIONS = (size?: string) => [`Why am I a size ${size ?? 'M'}?`, 'Which colours suit me and why?', 'How accurate are my measurements?', 'What should I wear to an office party?', 'Is my data private?'];

export function Chat() {
  const { body, color, catalog, taste, profile, photos, go } = useApp();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { list('chat_messages', 40).then((r) => setTurns(r.reverse().map((m) => ({ role: m.role, text: m.content })))); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);

  const system = () => {
    const recs = SITUATIONS.slice(0, 3).map((sit) => { const l = rateAll(catalog, sit, color, body, taste, 9000).looks[0]; return l ? `${sit.label}: ${l.items.map((i) => `${i.brand} ${i.title} (₹${i.price})`).join(' + ')} scored ${l.score}/10 because ${l.reasons.join('; ')}` : ''; }).filter(Boolean);
    const likes = Object.entries(taste.colors).sort((a, b) => b[1] - a[1]);
    return `You are Stylo, a friendly men's personal stylist for Indian men. You ONLY explain; you never take actions, place orders, change data or promise anything.
Talk like a helpful friend: simple words, short answers (2-5 sentences or a few bullets), no jargon unless you explain it. Use cm and inches, and ₹ for prices.
Stay on topic: the user's style profile, measurements, sizes, colours, outfits, fabrics, occasions, grooming basics, and how this app works and how far to trust it.
If asked something unrelated, politely say you can only help with style.
TRUST RULES: be honest about uncertainty. Measurements are estimated from photos scaled by the user's height, so they are approximate (about ±3–5 cm on chest and waist; better with a side photo and fitted clothes). Colour analysis depends on lighting. Try-on images are AI previews, not exact fit. Quote the confidence numbers below when relevant. Never invent measurements that aren't below.
PRIVACY: measuring runs on the phone; photos are stored in the user's private account and can be deleted from Me → Delete my data. Try-on and screenshot analysis send the image to Google Gemini.

USER PROFILE (JSON):
${JSON.stringify({
      name: profile?.name, height_cm: profile?.height_cm, photos: photos.length,
      body: body && { shape: body.shape, sizes: body.sizes, overallConfidence: +body.overallConfidence.toFixed(2),
        measurements_cm: Object.fromEntries((['shoulder', 'chest', 'waist', 'hip', 'inseam', 'sleeve'] as const).filter((k) => body[k]).map((k) => [k, { value: Math.round(body[k]!.value), confidence: +body[k]!.confidence.toFixed(2), method: body[k]!.method }])) },
      colour: color && { season: color.season, depth: color.depth, undertone: color.undertone, contrast: color.contrast, best: color.best.map((c) => c.name), neutrals: color.neutrals.map((c) => c.name), avoid: color.avoid.map((c) => c.name), confidence: +color.confidence.toFixed(2), why: color.why },
      learned_colour_preferences: likes.slice(0, 6),
      current_top_recommendations: recs,
    })}`;
  };

  const send = async (msg: string) => {
    if (!msg.trim() || busy) return;
    const next = [...turns, { role: 'user' as const, text: msg }];
    setTurns(next); setText(''); setBusy(true);
    try {
      const reply = await chat(system(), next.slice(-16));
      setTurns([...next, { role: 'model', text: reply }]);
      insert('chat_messages', { role: 'user', content: msg }).then(() => insert('chat_messages', { role: 'model', content: reply }));
    } catch (e: any) { setTurns([...next, { role: 'model', text: '⚠ ' + e.message }]); } finally { setBusy(false); }
  };

  return (
    <div className="page chat">
      <div className="row gap"><button className="icon-btn" onClick={() => go('home')} aria-label="Back"><Icon name="back" /></button><div className="col"><span className="eyebrow">Stylo</span><h2>Ask your stylist</h2></div></div>
      <div className="msgs">
        {!turns.length && <p className="muted">Ask anything about your sizes, your colours, or why an outfit was picked. I'll explain simply and tell you how sure I am.</p>}
        {turns.map((t, i) => <div key={i} className={`msg ${t.role}`}>{t.text}</div>)}
        {busy && <div className="msg model"><span className="dots">…</span></div>}
        <div ref={end} />
      </div>
      <div className="chips">{SUGGESTIONS(body?.sizes.top).map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about fit, colours, sizes…" />
        <button className="primary pill" disabled={busy}>Send</button>
      </form>
    </div>
  );
}
