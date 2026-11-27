import { useState } from 'react';
import { useApp } from '../state';
import { fmt, Metric } from '../lib/body';
import { Bar, Swatch } from '../ui';
import { PhotoUploader } from './Photos';
import { getConfig, saveConfig } from '../lib/config';
import { isCloud, signOut, list, remove, Collection } from '../lib/store';

export function StyleDNA() {
  const { body, color, profile } = useApp();
  if (!body) return <p className="muted">Add a photo to see your profile.</p>;
  const rows: [string, Metric | undefined][] = [['Shoulder width', body.shoulder], ['Chest', body.chest], ['Waist', body.waist], ['Hip / seat', body.hip], ['Inseam', body.inseam], ['Arm (sleeve)', body.sleeve]];
  return (
    <>
      {body.photosUsed.front === 0 && <div className="card issues">⚠ None of your photos could be used for sizing yet, so the sizes below are defaults. Add a front photo standing straight, head to toe (tap a photo to see what went wrong).</div>}
      <div className="card hero">
        <small className="muted">Your sizes</small>
        <div className="sizes">
          <div><b>{body.sizes.top}</b><small>Tops</small></div>
          <div><b>{body.sizes.trouserWaist}</b><small>Jeans waist</small></div>
          <div><b>{body.sizes.topFit.split(' ')[0]}</b><small>Fit</small></div>
        </div>
        <p className="small">{body.sizes.trouserLength}</p>
        <Bar value={body.overallConfidence} label="Overall confidence" />
      </div>

      <div className="card">
        <h3>Body shape: {body.shape.name}</h3>
        <p>{body.shape.tip}</p>
      </div>

      {color && <div className="card">
        <h3>Your colours: {color.season}</h3>
        <div className="row gap"><Swatch hex={color.skinHex} name="Skin" size={40} />{color.hairHex && <Swatch hex={color.hairHex} name="Hair" size={40} />}
          <div className="small">{color.depth} skin · {color.undertone} undertone · {color.contrast} contrast</div></div>
        <h4>Wear more</h4><div className="swatches">{color.best.map((c) => <Swatch key={c.hex} {...c} />)}</div>
        <h4>Safe neutrals</h4><div className="swatches">{color.neutrals.map((c) => <Swatch key={c.hex} {...c} />)}</div>
        <h4>Keep away from your face</h4><div className="swatches">{color.avoid.map((c) => <Swatch key={c.hex} {...c} />)}</div>
        <Bar value={color.confidence} label="Colour confidence" />
      </div>}

      <div className="card">
        <h3>Measurements: how sure are we?</h3>
        <p className="muted small">Estimated from {body.photosUsed.front} front + {body.photosUsed.side} side photo(s), scaled from your height ({profile?.height_cm} cm). Expect about ±3–5 cm on chest and waist. Each extra photo refines the numbers.</p>
        <table className="metrics"><tbody>
          {rows.map(([k, m]) => m && (
            <tr key={k}><td>{k}<details><summary className="small muted">how?</summary><span className="small">{m.method}</span></details></td>
              <td className="num">{fmt(m.value)}</td><td style={{ width: 70 }}><Bar value={m.confidence} /></td></tr>
          ))}
        </tbody></table>
        <details><summary className="small">Why these sizes?</summary><ul className="small">{body.sizes.reasoning.map((r) => <li key={r}>{r}</li>)}</ul></details>
      </div>
      {color && <details className="card"><summary>How we read your colours</summary><ul className="small">{color.why.map((w) => <li key={w}>{w}</li>)}</ul></details>}
    </>
  );
}

export function Me() {
  const { refresh, toast, profile } = useApp();
  const [cfg, setCfg] = useState(getConfig());
  return (
    <div className="page">
      <h1>{profile?.name ? `${profile.name}'s Style DNA` : 'Style DNA'}</h1>
      <StyleDNA />
      <h3>Your photos</h3>
      <p className="muted small">Add a new photo any time, for example after a change in fitness. Your profile is recalculated from all of them.</p>
      <PhotoUploader />

      <details className="card">
        <summary>Settings</summary>
        <p className="small muted">Storage: {isCloud() ? '☁️ Supabase' : '📱 This device only (add Supabase keys to sync)'}</p>
        {(['supabaseUrl', 'supabaseAnonKey', 'geminiKey', 'textModel', 'imageModel'] as const).map((k) => (
          <label key={k}>{k}<input value={cfg[k]} type={k.toLowerCase().includes('key') ? 'password' : 'text'} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} /></label>
        ))}
        <button onClick={() => { saveConfig(cfg); toast('Saved. Reloading…'); setTimeout(() => location.reload(), 600); }}>Save settings</button>
      </details>
      <div className="row gap">
        <button onClick={() => signOut().then(() => location.reload())}>Sign out</button>
        <button className="danger" onClick={async () => {
          if (!confirm('Delete all your photos, try-ons, saved items and history?')) return;
          for (const c of ['photos', 'saved_items', 'tryons', 'interactions', 'chat_messages'] as Collection[]) for (const r of await list(c, 1000)) await remove(c, r);
          await refresh(); toast('All data deleted');
        }}>Delete my data</button>
      </div>
    </div>
  );
}
