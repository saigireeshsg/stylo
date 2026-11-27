import { useState } from 'react';
import { useApp } from '../state';
import { saveProfile } from '../lib/store';
import { PhotoUploader } from './Photos';
import { StyleGuide } from './Me';
import { SITUATIONS } from '../lib/recommend';
import { Logo } from '../ui';

export function Onboarding() {
  const { profile, photos, refresh, body, openSituation } = useApp();
  const [step, setStep] = useState(profile?.height_cm ? (photos.length ? 2 : 1) : 0);
  const [name, setName] = useState(profile?.name ?? '');
  const [height, setHeight] = useState(String(profile?.height_cm ?? ''));
  const [weight, setWeight] = useState(String(profile?.anchors?.weightKg ?? ''));
  const [waist, setWaist] = useState(String(profile?.anchors?.usualWaistIn ?? ''));
  const [top, setTop] = useState(profile?.anchors?.usualTop ?? '');
  const finish = async (sit?: string) => { await saveProfile({ prefs: { ...(profile?.prefs ?? {}), onboarded: true } }); await refresh(); if (sit) openSituation(sit); };

  return (
    <div className="page" style={{ paddingBottom: 40 }}>
      <div className="row between" style={{ paddingTop: 4 }}><Logo size={28} /><span className="xs muted">Step {step + 1} of 3</span></div>
      <div className="stepper">{[0, 1, 2].map((n) => <span key={n} className={n <= step ? 'on' : ''} />)}</div>

      {step === 0 && <>
        <div className="col gap"><h1>Tell us about you</h1><p className="ink2">Your height is our ruler: every measurement is scaled from it, so be precise.</p></div>
        <div className="col gap-lg">
          <label className="field">First name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Arjun" /></label>
          <label className="field">Height in cm<input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="175" /></label>
          <div className="row gap">
            <label className="field grow">Usual jeans waist<input inputMode="numeric" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="32 (optional)" /></label>
            <label className="field grow">Usual T-shirt size<select value={top} onChange={(e) => setTop(e.target.value)}><option value="">Not sure</option>{['S', 'M', 'L', 'XL', 'XXL', '3XL'].map((s) => <option key={s}>{s}</option>)}</select></label>
          </div>
          <label className="field">Weight in kg<input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Optional" /></label>
        </div>
        <button className="primary block pill" style={{ minHeight: 52 }} disabled={!(Number(height) > 120 && Number(height) < 230)} onClick={async () => {
          await saveProfile({ name, height_cm: Number(height), anchors: { weightKg: Number(weight) || undefined, usualWaistIn: Number(waist) || undefined, usualTop: top || undefined } });
          await refresh(); setStep(1);
        }}>Continue</button>
      </>}

      {step === 1 && <>
        <div className="col gap"><h1>Add 2 full-body photos</h1><p className="ink2">One from the front, one from the side. This builds your sizes, body shape and colour palette.</p></div>
        <ul className="tips card">
          <li><span>1</span><span>Head to toe in frame, phone at chest height, 2–3 m away</span></li>
          <li><span>2</span><span>Fitted clothes, arms slightly away from your body</span></li>
          <li><span>3</span><span>Stand straight, feet hip-width apart</span></li>
          <li><span>4</span><span>Daylight on your face for an accurate skin-tone reading</span></li>
        </ul>
        <PhotoUploader />
        <p className="xs muted">Measuring runs on your phone. Photos are stored privately in your account and can be deleted any time.</p>
        <button className="primary block pill" style={{ minHeight: 52 }} disabled={!photos.length} onClick={() => setStep(2)}>
          {photos.length ? 'Build my style guide' : 'Add a photo to continue'}
        </button>
      </>}

      {step === 2 && <>
        <div className="col gap"><span className="eyebrow">Ready</span><h1>{name ? `${name}, here's` : "Here's"} your style guide</h1><p className="ink2">We'll use this to rate every outfit for you.</p></div>
        <StyleGuide />
        <div className="section">
          <h2>Where are you dressing for first?</h2>
          <div className="chips" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
            {SITUATIONS.map((s) => <button key={s.id} className="chip" onClick={() => finish(s.id)}>{s.label}</button>)}
          </div>
        </div>
        <button className="block" onClick={() => finish()}>{body ? 'Go to home' : 'Skip for now'}</button>
      </>}
    </div>
  );
}
