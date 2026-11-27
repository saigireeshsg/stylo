import { useEffect, useRef } from 'react';
import type { PhotoAnalysis } from './lib/vision';

export function Bar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.75 ? 'good' : value >= 0.5 ? 'ok' : 'low';
  return (
    <div className="bar" title={`${pct}%`}>
      <div className={`bar-fill ${tone}`} style={{ width: `${pct}%` }} />
      {label && <span className="bar-label">{label} {pct}%</span>}
    </div>
  );
}

export function Swatch({ hex, name, size = 34 }: { hex: string; name?: string; size?: number }) {
  return (
    <div className="swatch">
      <span style={{ background: hex, width: size, height: size }} />
      {name && <small>{name}</small>}
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
      g.lineWidth = u; g.font = `${Math.round(u * 7)}px system-ui`;
      for (const l of analysis.lines) {
        g.strokeStyle = l.label.startsWith('Top') || l.label === 'Floor' ? '#ffd166' : '#06d6a0';
        g.beginPath(); g.moveTo(l.x0 * W, l.y * H); g.lineTo(l.x1 * W, l.y * H); g.stroke();
        g.fillStyle = 'rgba(0,0,0,.6)'; const tw = g.measureText(l.label).width;
        g.fillRect(l.x1 * W + u * 2, l.y * H - u * 6, tw + u * 4, u * 9);
        g.fillStyle = '#fff'; g.fillText(l.label, l.x1 * W + u * 4, l.y * H + u * 1.5);
      }
      g.fillStyle = '#ef476f';
      for (const k of analysis.keypoints.slice(11)) if (k.v > 0.5) { g.beginPath(); g.arc(k.x * W, k.y * H, u * 1.6, 0, Math.PI * 2); g.fill(); }
    };
    img.src = src;
  }, [src, analysis]);
  return <canvas ref={ref} className="overlay" />;
}

export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: React.ReactNode; title?: string }) {
  if (!open) return null;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><b>{title}</b><button className="icon" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

/** Brand mark: a hanger forming an "S" curve inside a rounded tile. */
export function Logo({ size = 40, word = true }: { size?: number; word?: boolean }) {
  return (
    <div className="brand">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff4d5e" /><stop offset="1" stopColor="#8a0f1f" /></linearGradient></defs>
        <rect width="64" height="64" rx="16" fill="url(#lg)" />
        <path d="M32 14a5 5 0 1 1 5 5c-3 0-5 2-5 4.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M32 23.5L12 40c-2 1.6-1 4 1.5 4h37c2.5 0 3.5-2.4 1.5-4z" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinejoin="round" />
        <circle cx="32" cy="51" r="2.2" fill="#fff" />
      </svg>
      {word && <span className="wordmark">STYLO</span>}
    </div>
  );
}
