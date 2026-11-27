// Looks: your try-on previews + every outfit you've had rated, by situation.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state';
import { list, remove, Row } from '../lib/store';
import { SITUATIONS } from '../lib/recommend';
import { Collage, ScoreChip, Sheet, Tile, inr, Icon } from '../ui';

export function TryOns() {
  const { refresh, catalog, openSituation } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [ratings, setRatings] = useState<Row[]>([]);
  const [view, setView] = useState<Row | null>(null);
  const [mode, setMode] = useState<'previews' | 'rated'>('previews');
  const load = () => { list('tryons').then(setRows); list('outfit_ratings', 500).then(setRatings); };
  useEffect(() => { load(); }, []);
  const byId = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog]);
  const rated = useMemo(() => SITUATIONS.map((s) => ({ s, rows: ratings.filter((r) => r.situation === s.id).sort((a, b) => b.final_score - a.final_score).slice(0, 6) })).filter((g) => g.rows.length), [ratings]);

  return (
    <div className="page">
      <div className="col gap"><span className="eyebrow">Wardrobe</span><h1>My looks</h1></div>
      <div className="chips">
        <button className={mode === 'previews' ? 'chip on' : 'chip'} onClick={() => setMode('previews')}>On me ({rows.length})</button>
        <button className={mode === 'rated' ? 'chip on' : 'chip'} onClick={() => setMode('rated')}>Rated outfits ({ratings.length})</button>
      </div>

      {mode === 'previews' && (rows.length ? <div className="pgrid">
        {rows.map((r) => (
          <button key={r.id} className="pcard" onClick={() => setView(r)}>
            <div className="tile" style={{ aspectRatio: '3/4' }}><img src={r.url} alt="" />{r.item?.score && <span className="badge">{Number(r.item.score).toFixed(1)}</span>}</div>
            <span className="brandname">{r.item?.scene ?? 'Look'}</span>
            <span className="xs muted">{r.rating ? '★'.repeat(r.rating) : 'Not rated yet'} · {inr((r.item?.items ?? []).reduce((s: number, i: any) => s + (i.price ?? 0), 0))}</span>
          </button>
        ))}
      </div> : <div className="empty"><Icon name="looks" size={32} /><p>Your try-on previews show up here.</p><button className="white" onClick={() => openSituation('office')}>Try an office look</button></div>)}

      {mode === 'rated' && (rated.length ? rated.map(({ s, rows: rs }) => (
        <div key={s.id} className="section">
          <div className="section-head"><h2>{s.label}</h2><button className="link" onClick={() => openSituation(s.id)}>Open ›</button></div>
          {rs.map((r) => {
            const items = (r.items ?? []).map((i: any) => byId.get(i.id) ?? i);
            return (
              <button key={r.id} className="lookrow" onClick={() => openSituation(s.id, items.filter((i: any) => i.images))}>
                <Collage items={items} w={160} />
                <div className="col" style={{ gap: 5 }}>
                  <div className="row between"><span className="rank">{r.ai_score != null ? 'Stylist ✦' : 'On-device'}</span><ScoreChip v={Number(r.final_score)} /></div>
                  <span className="xs ink2">{r.ai_verdict ?? (r.reasons ?? []).slice(0, 2).join('. ')}</span>
                  <span className="xs muted">{inr(items.reduce((t: number, i: any) => t + (i.price ?? 0), 0))}</span>
                </div>
              </button>
            );
          })}
        </div>
      )) : <div className="empty"><p>Open a situation and your rated combinations are saved here.</p></div>)}

      <Sheet open={!!view} onClose={() => setView(null)} title={view?.item?.scene ?? 'Look'}>
        {view && <>
          <img src={view.url} alt="" style={{ width: '100%', borderRadius: 18 }} />
          {(view.item?.items ?? []).map((i: any) => (
            <a key={i.id ?? i.url} className="item-link" href={i.url} target="_blank" rel="noreferrer">
              <Tile src={i.image ?? ''} w={120} /><span className="grow col"><b className="small clip">{i.brand}</b><span className="xs ink2 clip">{i.title}</span></span><b>{inr(i.price ?? 0)} ↗</b>
            </a>))}
          <button className="danger" onClick={async () => { await remove('tryons', view); setView(null); load(); refresh(); }}><Icon name="trash" size={18} />Delete look</button>
        </>}
      </Sheet>
    </div>
  );
}
