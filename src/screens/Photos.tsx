import { useState } from 'react';
import { useApp } from '../state';
import { compressImage, insert, remove, Row } from '../lib/store';
import { analyzePhoto, loadModels, PhotoKind, PhotoAnalysis } from '../lib/vision';
import { MeasureOverlay, Sheet } from '../ui';

export function PhotoUploader() {
  const { profile, photos, refresh, toast } = useApp();
  const [busy, setBusy] = useState('');
  const [view, setView] = useState<Row | null>(null);

  const add = async (file: File, kind: PhotoKind | undefined) => {
    try {
      setBusy('Preparing photo…');
      const { blob, canvas } = await compressImage(file);
      await loadModels(setBusy);
      setBusy('Measuring on device…');
      const a: PhotoAnalysis = await analyzePhoto(canvas, profile!.height_cm!, kind);
      setBusy('Saving to your account…');
      await insert('photos', { kind: a.kind, analysis: a }, blob, 'photos');
      await refresh();
      toast(a.ok ? `${a.kind === 'front' ? 'Front' : 'Side'} photo measured ✓` : 'Photo saved, but quality is low. See the tips.');
    } catch (e: any) { toast(e.message ?? String(e)); } finally { setBusy(''); }
  };
  const slot = (kind: PhotoKind | undefined, label: string) => (
    <label className="slot">
      <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) add(f, kind); e.target.value = ''; }} />
      <span className="slot-icon">＋</span><span>{label}</span>
    </label>
  );

  return (
    <>
      <div className="grid3">
        {photos.map((p) => (
          <button key={p.id} className="thumb" onClick={() => setView(p)}>
            <img src={p.url} alt="" />
            <span className={`tag ${p.analysis?.ok ? '' : 'warn'}`}>{p.kind}{p.analysis?.ok ? '' : ' ⚠'}</span>
          </button>
        ))}
        {slot('front', 'Front photo')}
        {slot('side', 'Side photo')}
        {photos.length >= 2 && slot(undefined, 'Another photo')}
      </div>
      {busy && <div className="busy"><span className="spinner" />{busy}</div>}
      <Sheet open={!!view} onClose={() => setView(null)} title={`${view?.kind} photo: how we measured`}>
        {view && <>
          <MeasureOverlay src={view.url!} analysis={view.analysis} />
          {view.analysis?.issues?.length ? <ul className="issues">{view.analysis.issues.map((i: string) => <li key={i}>⚠ {i}</li>)}</ul> : <p className="muted">✓ Good photo. Every keypoint is visible.</p>}
          <p className="muted small">Scale: {(view.analysis?.cmPerPx * 10).toFixed(2)} mm per pixel, from your height of {profile?.height_cm} cm. Photo quality: {Math.round((view.analysis?.quality ?? 0) * 100)}%.</p>
          <button className="danger" onClick={async () => { await remove('photos', view); setView(null); await refresh(); }}>Delete photo</button>
        </>}
      </Sheet>
    </>
  );
}
