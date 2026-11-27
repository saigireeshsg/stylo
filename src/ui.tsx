import { useEffect, useRef, useState } from 'react';
import type { PhotoAnalysis } from './lib/vision';
import { sized, type Product } from './lib/catalog';

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

// ---------- Icons (1.8px line icons) ----------
const P: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  looks: 'M4 4h16v16H4zM4 15l4.5-4.5 4 4 3-3L20 16',
  saved: 'M6 3h12v18l-6-4-6 4z',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.2-4 4.2-6 8-6s6.8 2 8 6',
  chat: 'M4 5h16v11H8l-4 4z',
  back: 'M15 5l-7 7 7 7',
  share: 'M12 3v13M7 8l5-5 5 5M5 14v6h14v-6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  close: 'M6 6l12 12M18 6 6 18',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  ruler: 'M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  palette: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
};
export function Icon({ name, size = 20, stroke = 'currentColor' }: { name: keyof typeof P | string; size?: number; stroke?: string }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name] ?? ''} /></svg>;
}

/** Product image tile with graceful loading/fallback. */
export function Tile({ src, alt = '', w = 480, className = '', style }: { src: string; alt?: string; w?: number; className?: string; style?: React.CSSProperties }) {
  const [ok, setOk] = useState(true);
  return <div className={`tile ${className}`} style={style}>{ok && src ? <img src={sized(src, w)} alt={alt} loading="lazy" onError={() => setOk(false)} /> : null}</div>;
}

export function Collage({ items, w = 300 }: { items: Product[]; w?: number }) {
  const order = ['top', 'layer', 'bottom', 'shoes'];
  const sorted = [...items].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot)).slice(0, 4);
  return <div className={`collage ${sorted.length === 4 ? 'n4' : ''}`}>{sorted.map((p) => <Tile key={p.id} src={p.image} w={w} />)}</div>;
}

export function scoreTone(v: number) { return v >= 8 ? 'hi' : v >= 6.5 ? 'mid' : 'lo'; }
export function ScoreChip({ v }: { v: number }) { return <span className={`score-chip ${scoreTone(v)}`}>{v.toFixed(1)}</span>; }
export function ScoreRing({ v }: { v: number }) {
  const c = v >= 8 ? 'var(--good)' : v >= 6.5 ? 'var(--ok)' : 'var(--low)';
  return <div className="score-ring" style={{ ['--v' as any]: v * 10, ['--c' as any]: c }}><span>{v.toFixed(1)}</span></div>;
}
export function Meter({ value }: { value: number }) {
  const tone = value >= 0.75 ? 'good' : value >= 0.5 ? 'ok' : 'low';
  return <div className="meter"><div className={tone} style={{ width: `${Math.round(value * 100)}%` }} /></div>;
}

export function ProductCard({ p, badge, onOpen, actions, wearing }: { p: Product; badge?: string; onOpen: () => void; actions?: React.ReactNode; wearing?: boolean }) {
  return (
    <div className={`pcard ${wearing ? 'wearing' : ''}`}>
      <div className="tile" onClick={onOpen} style={{ cursor: 'pointer' }}>
        {badge && <span className={`badge ${badge.startsWith('Suits') ? 'good' : ''}`}>{badge}</span>}
        <img src={sized(p.image, 480)} alt={p.title} loading="lazy" />
        {actions && <div className="tile-actions" onClick={(e) => e.stopPropagation()}>{actions}</div>}
      </div>
      <div onClick={onOpen} className="col" style={{ gap: 3, cursor: 'pointer' }}>
        <span className="brandname clip">{p.brand}</span>
        <span className="pname">{p.title}</span>
        <span><span className="price">{inr(p.price)}</span>{p.compareAt ? <span className="mrp">{inr(p.compareAt)}</span> : null}</span>
      </div>
    </div>
  );
}

/** Draws the photo with the measurement scan-lines and keypoints, so the user can see HOW we measured. */
export function MeasureOverlay({ src, analysis }: { src: string; analysis?: PhotoAnalysis }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = ref.current; if (!c) return;
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      if (!analysis) return;
      const W = img.width, H = img.height, u = Math.max(2, W / 300);
      g.lineWidth = u; g.font = `600 ${Math.round(u * 7)}px Inter, system-ui`;
      for (const l of analysis.lines) {
        g.strokeStyle = l.label.startsWith('Top') || l.label === 'Floor' ? '#f2b33d' : '#34c98a';
        g.beginPath(); g.moveTo(l.x0 * W, l.y * H); g.lineTo(l.x1 * W, l.y * H); g.stroke();
        g.fillStyle = 'rgba(0,0,0,.65)'; const tw = g.measureText(l.label).width;
        g.fillRect(l.x1 * W + u * 2, l.y * H - u * 6, tw + u * 4, u * 9);
        g.fillStyle = '#fff'; g.fillText(l.label, l.x1 * W + u * 4, l.y * H + u * 1.5);
      }
      g.fillStyle = '#e5384f';
      for (const k of analysis.keypoints.slice(11)) if (k.v > 0.5) { g.beginPath(); g.arc(k.x * W, k.y * H, u * 1.6, 0, Math.PI * 2); g.fill(); }
    };
    img.src = src;
  }, [src, analysis]);
  return <canvas ref={ref} className="overlay" />;
}

export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: React.ReactNode; title?: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="sheet-head"><h2 className="grow">{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        {children}
      </div>
    </div>
  );
}

/** Brand mark: a hanger inside a rounded crimson tile. */
export function Logo({ size = 32, word = true }: { size?: number; word?: boolean }) {
  return (
    <div className="brand">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff5b62" /><stop offset="1" stopColor="#8a0f1f" /></linearGradient></defs>
        <rect width="64" height="64" rx="16" fill="url(#lg)" />
        <path d="M32 14a5 5 0 1 1 5 5c-3 0-5 2-5 4.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M32 23.5L12 40c-2 1.6-1 4 1.5 4h37c2.5 0 3.5-2.4 1.5-4z" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinejoin="round" />
      </svg>
      {word && <span className="wordmark">STYLO</span>}
    </div>
  );
}
