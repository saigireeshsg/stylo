import { useState } from 'react';
import { useApp } from '../state';
import { fmt, Metric } from '../lib/body';
import { Icon, Meter } from '../ui';
import { PhotoUploader } from './Photos';
import { getConfig, saveConfig } from '../lib/config';
import { isCloud, signOut, list, remove, Collection } from '../lib/store';

/** Compact style guide for Home. */
export function StyleGuideCard({ onOpen }: { onOpen?: () => void }) {
  const { body, color } = useApp();
  if (!body && !color) return null;
  return (
    <button className="card guide" onClick={onOpen} style={{ textAlign: 'left', alignItems: 'stretch', fontWeight: 400 }}>
      <div className="row between"><span className="eyebrow">Your style guide</span><span className="link">View ›</span></div>
      <div className="row gap-lg">
        {color && <div className="col" style={{ gap: 8 }}>
          <b>{color.season}</b>
          <div className="sw-row">{color.best.slice(0, 5).map((c) => <span key={c.hex} className="sw" style={{ background: c.hex }} title={c.name} />)}</div>
        </div>}
        {body && <div className="row gap" style={{ marginLeft: 'auto' }}>
          <div className="col" style={{ alignItems: 'center' }}><b style={{ fontSize: 20 }}>{body.sizes.top}</b><span className="xs muted">Top</span></div>
          <div className="col" style={{ alignItems: 'center' }}><b style={{ fontSize: 20 }}>{body.sizes.trouserWaist}</b><span className="xs muted">Waist</span></div>
        </div>}
      </div>
      {body && <p className="small ink2">{body.shape.name} build · {body.sizes.topFit}</p>}
    </button>
  );
}

/** Full style guide with the "how sure are we" trust layer. */
export function StyleGuide() {
  const { body, color, profile } = useApp();
  if (!body) return <p className="muted">Add a photo to build your style guide.</p>;
  const rows: [string, Metric | undefined][] = [['Shoulders', body.shoulder], ['Chest', body.chest], ['Waist', body.waist], ['Hips', body.hip], ['Inseam', body.inseam], ['Sleeve', body.sleeve]];
  return (
    <div className="col gap-lg">
      {body.photosUsed.front === 0 && <div className="card issues">None of your photos could be used for sizing yet, so these sizes are defaults. Add a straight, head-to-toe front photo.</div>}
      <div className="card guide">
        <span className="eyebrow">Your sizes</span>
        <div className="kv">
          <div><b>{body.sizes.top}</b><small>Shirts & tees</small></div>
          <div><b>{body.sizes.trouserWaist}</b><small>Trouser waist</small></div>
          <div><b style={{ fontSize: 15, paddingTop: 4 }}>{body.sizes.topFit.split(' /')[0]}</b><small>Best fit</small></div>
        </div>
        <p className="small ink2">{body.sizes.trouserLength}</p>
        <div className="col" style={{ gap: 6 }}><div className="row between xs muted"><span>Measurement confidence</span><span>{Math.round(body.overallConfidence * 100)}%</span></div><Meter value={body.overallConfidence} /></div>
      </div>

      <div className="card col gap">
        <span className="eyebrow">Body shape</span>
        <h2>{body.shape.name}</h2>
        <p className="ink2 small">{body.shape.tip}</p>
      </div>

      {color && <div className="card col gap-lg">
        <div className="row gap-lg">
          <span className="sw lg" style={{ background: color.skinHex }} />
          <div className="col"><span className="eyebrow">Your colours</span><h2>{color.season}</h2><span className="small muted">{color.depth} skin · {color.undertone} undertone · {color.contrast} contrast</span></div>
        </div>
        {([['Wear more', color.best], ['Safe neutrals', color.neutrals], ['Keep away from your face', color.avoid]] as const).map(([t, list]) => (
          <div key={t} className="col gap"><span className="small ink2" style={{ fontWeight: 600 }}>{t}</span>
            <div className="sw-row">{list.map((c) => <div key={c.hex} className="sw-lab"><span className="sw lg" style={{ background: c.hex }} />{c.name}</div>)}</div></div>
        ))}
        <div className="col" style={{ gap: 6 }}><div className="row between xs muted"><span>Colour confidence (depends on lighting)</span><span>{Math.round(color.confidence * 100)}%</span></div><Meter value={color.confidence} /></div>
      </div>}

      <div className="card col gap">
        <span className="eyebrow">Measurements · how sure are we</span>
        <p className="small muted">From {body.photosUsed.front} front + {body.photosUsed.side} side photo(s), scaled from your height ({profile?.height_cm} cm). Expect ±3–5 cm on chest and waist.</p>
        <table className="metrics"><tbody>
          {rows.map(([k, m]) => m && (
            <tr key={k}><td><b style={{ fontWeight: 600 }}>{k}</b><details><summary className="xs muted">How?</summary><span className="xs muted">{m.method}</span></details></td>
              <td className="num">{fmt(m.value)}</td><td style={{ width: 64, paddingLeft: 10 }}><Meter value={m.confidence} /></td></tr>
          ))}
        </tbody></table>
        <details><summary className="small">Why these sizes</summary><ul className="small ink2" style={{ marginTop: 6 }}>{body.sizes.reasoning.map((r) => <li key={r}>{r}</li>)}</ul></details>
        {color && <details><summary className="small">How we read your colours</summary><ul className="small ink2" style={{ marginTop: 6 }}>{color.why.map((w) => <li key={w}>{w}</li>)}</ul></details>}
      </div>
    </div>
  );
}

export function Me() {
  const { refresh, toast, profile } = useApp();
  const [cfg, setCfg] = useState(getConfig());
  return (
    <div className="page">
      <div className="col gap"><span className="eyebrow">Profile</span><h1>{profile?.name ? `${profile.name}'s style guide` : 'Your style guide'}</h1></div>
      <StyleGuide />
      <div className="section">
        <div className="section-head"><h2>Your photos</h2></div>
        <p className="small muted">Add a new photo any time. Your guide is recalculated from all of them.</p>
        <PhotoUploader />
      </div>
      <details className="card">
        <summary>Settings</summary>
        <div className="col gap-lg" style={{ marginTop: 12 }}>
          <p className="small muted"><Icon name="shield" size={14} /> Storage: {isCloud() ? 'your private Supabase account' : 'this device only'}</p>
          <label className="field">Gemini API key (try-on, ratings, chat)<input type="password" value={cfg.geminiKey} onChange={(e) => setCfg({ ...cfg, geminiKey: e.target.value })} placeholder="AIza…" /></label>
          <details><summary className="small muted">Advanced</summary>
            <div className="col gap" style={{ marginTop: 10 }}>
              {(['supabaseUrl', 'supabaseAnonKey', 'textModel', 'imageModel'] as const).map((k) => (
                <label key={k} className="field">{k}<input value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} /></label>))}
            </div>
          </details>
          <button className="white" onClick={() => { saveConfig(cfg); toast('Saved. Reloading…'); setTimeout(() => location.reload(), 600); }}>Save settings</button>
        </div>
      </details>
      <div className="row gap">
        <button className="grow" onClick={() => signOut().then(() => location.reload())}>Sign out</button>
        <button className="grow danger" onClick={async () => {
          if (!confirm('Delete all your photos, looks, ratings and history?')) return;
          for (const c of ['photos', 'saved_items', 'tryons', 'interactions', 'chat_messages', 'outfit_ratings'] as Collection[]) for (const r of await list(c, 1000)) await remove(c, r);
          await refresh(); toast('All data deleted');
        }}>Delete my data</button>
      </div>
    </div>
  );
}
