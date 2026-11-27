import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state';
import { SITUATIONS, fitsSlot, itemScore } from '../lib/recommend';
import { list, Row } from '../lib/store';
import { StyleGuideCard } from './Me';
import { Tile, Logo, Icon } from '../ui';
import type { Product, Slot } from '../lib/catalog';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export function Home() {
  const { profile, catalog, catalogReady, color, body, taste, openSituation, go } = useApp();
  const [looks, setLooks] = useState<Row[]>([]);
  useEffect(() => { list('tryons', 8).then(setLooks); }, []);

  // Each situation card shows the best-scoring real pieces for this user
  const mosaics = useMemo(() => Object.fromEntries(SITUATIONS.map((s) => {
    const best = (slot: Slot, n = 1): Product[] => catalog.filter((p) => fitsSlot(p, s, slot)).map((p) => ({ p, v: itemScore(p, color, body, taste) })).sort((a, b) => b.v - a.v).slice(0, n).map((x) => x.p);
    const lead = s.slots.layer && (s.id === 'office' || s.id === 'winter' || s.id === 'wedding') ? best('layer') : best('top');
    return [s.id, [...lead, ...best(lead[0]?.slot === 'layer' ? 'top' : 'bottom'), ...best('shoes')]];
  })), [catalog, color, body]);
  const brands = useMemo(() => new Set(catalog.map((p) => p.brand)).size, [catalog]);

  return (
    <>
      <div className="topbar">
        <Logo size={28} />
        <div className="row gap">
          <button className="icon-btn" onClick={() => go('chat')} aria-label="Ask your stylist"><Icon name="chat" /></button>
        </div>
      </div>
      <div className="page" style={{ paddingTop: 0 }}>
        <div className="col gap"><span className="muted small">{greeting()}{profile?.name ? `, ${profile.name}` : ''}</span><h1>What are you dressing for?</h1></div>
        <StyleGuideCard onOpen={() => go('me')} />
        <div className="sit-grid">
          {SITUATIONS.map((s) => (
            <button key={s.id} className="sit-card" onClick={() => openSituation(s.id)}>
              <div className="mosaic">{(mosaics[s.id] ?? []).slice(0, 3).map((p) => <Tile key={p.id} src={p.image} w={420} />)}</div>
              <div className="label"><b>{s.label}</b><small>{s.sub}</small></div>
            </button>
          ))}
        </div>
        {!catalogReady && <div className="busy"><span className="spinner" />Loading the latest collections…</div>}
        {catalogReady && <p className="xs muted" style={{ textAlign: 'center' }}>{catalog.length.toLocaleString('en-IN')} pieces from {brands} Indian brands, updated daily</p>}

        {looks.length > 0 && <div className="section">
          <div className="section-head"><h2>Your recent looks</h2><button className="link" onClick={() => go('looks')}>See all</button></div>
          <div className="hscroll">{looks.map((r) => (
            <button key={r.id} className="tile" style={{ flex: '0 0 120px', aspectRatio: '3/4', padding: 0, border: 'none', minHeight: 0 }} onClick={() => go('looks')}><img src={r.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></button>
          ))}</div>
        </div>}
      </div>
    </>
  );
}
