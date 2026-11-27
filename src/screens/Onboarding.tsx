import { useState } from 'react';
import { useApp } from '../state';
import { saveProfile } from '../lib/store';
import { PhotoUploader } from './Photos';

export function Onboarding() {
  const { profile, photos, refresh } = useApp();
  const [step, setStep] = useState(profile?.height_cm ? 1 : 0);
  const [name, setName] = useState(profile?.name ?? '');
  const [height, setHeight] = useState(String(profile?.height_cm ?? ''));
  const [weight, setWeight] = useState(String(profile?.anchors?.weightKg ?? ''));
  const [waist, setWaist] = useState(String(profile?.anchors?.usualWaistIn ?? ''));
  const [top, setTop] = useState(profile?.anchors?.usualTop ?? '');

  if (step === 0) return (
    <div className="page">
      <h1>Let's get your measurements</h1>
      <p className="muted">Your height is the ruler: we scale every other measurement from it, so enter it as accurately as you can.</p>
      <label>First name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Arjun" /></label>
      <label>Height (cm) *<input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="175" /></label>
      <details className="card">
        <summary>Optional: improves size accuracy</summary>
        <label>Weight (kg)<input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="72" /></label>
        <label>Usual jeans waist (in)<input inputMode="numeric" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="32" /></label>
        <label>Usual T-shirt size<select value={top} onChange={(e) => setTop(e.target.value)}><option value="">Not sure</option>{['S', 'M', 'L', 'XL', 'XXL', '3XL'].map((s) => <option key={s}>{s}</option>)}</select></label>
      </details>
      <button className="primary" disabled={!(Number(height) > 120 && Number(height) < 230)} onClick={async () => {
        await saveProfile({ name, height_cm: Number(height), anchors: { weightKg: Number(weight) || undefined, usualWaistIn: Number(waist) || undefined, usualTop: top || undefined } });
        await refresh(); setStep(1);
      }}>Continue</button>
    </div>
  );

  return (
    <div className="page">
      <h1>Add 2–3 full-body photos</h1>
      <div className="card tips">
        <b>For accurate sizes</b>
        <ul>
          <li>Head to toe in frame, phone at chest height, about 2–3 m away</li>
          <li>Fitted clothes (a T-shirt and jeans), not loose layers</li>
          <li>Arms slightly away from your body (A-pose)</li>
          <li><b>One front photo + one side photo</b> gives the best chest and waist estimate</li>
          <li>Daylight facing a window, so the skin-tone reading is accurate</li>
        </ul>
        <p className="muted small">🔒 Measuring runs on your phone. Photos are stored in your private account so we can keep refining your profile.</p>
      </div>
      <PhotoUploader />
      <button className="primary" disabled={photos.length < 1} onClick={() => saveProfile({ prefs: { ...(profile?.prefs ?? {}), onboarded: true } }).then(refresh)}>
        {photos.length < 2 ? `Continue with ${photos.length} photo (2–3 recommended)` : 'See my Style DNA →'}
      </button>
    </div>
  );
}
