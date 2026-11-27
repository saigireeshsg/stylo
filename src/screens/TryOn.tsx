import { useEffect, useState } from 'react';
import { useApp } from '../state';
import { list, remove, Row } from '../lib/store';
import { inr } from '../ui';

export function TryOns() {
  const { refresh } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const load = () => list('tryons').then(setRows);
  useEffect(() => { load(); }, []);
  return (
    <div className="page">
      <h1>My looks</h1>
      {!rows.length && <p className="muted">Your try-on previews show up here. Open the Studio and tap “See me in this”.</p>}
      <div className="grid2">
        {rows.map((r) => (
          <div key={r.id} className="look">
            <img src={r.url} alt="" />
            <small>{r.item?.scene ? `${r.item.scene} · ` : ''}{r.rating ? '★'.repeat(r.rating) : 'Not rated'}</small>
            <small className="muted">{(r.item?.items ?? [r.item]).map((i: any) => i?.title).filter(Boolean).join(' + ')}</small>
            {(r.item?.items ?? [r.item]).filter((i: any) => i?.url).map((i: any) => <a key={i.url} href={i.url} target="_blank" rel="noreferrer" className="small">Buy {i.title} {i.price ? inr(i.price) : ''} ↗</a>)}
            <button className="link danger" onClick={async () => { await remove('tryons', r); load(); refresh(); }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
