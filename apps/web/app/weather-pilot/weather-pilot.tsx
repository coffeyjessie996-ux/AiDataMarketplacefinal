'use client';

import { FormEvent, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type ForecastPeriod = {
  name: string;
  startTime: string;
  temperature: number | null;
  temperatureUnit: string;
  shortForecast: string;
  windSpeed: string;
  windDirection: string;
  precipitationChance: number | null;
};

type Preview = {
  location: string;
  source: string;
  sourceUrl: string;
  sourceTermsUrl: string;
  forecastUpdatedAt: string | null;
  retrievedAt: string;
  periods: ForecastPeriod[];
  disclaimer: string;
};

const panel: React.CSSProperties = {
  background: 'rgba(15, 23, 42, .82)',
  border: '1px solid rgba(148, 163, 184, .18)',
  borderRadius: 16,
  padding: 22,
};

export default function WeatherPilot() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState('');
  const [error, setError] = useState('');

  async function loadPreview() {
    setLoadingPreview(true);
    setPreviewError('');
    try {
      const response = await fetch(`${API}/weather-pilot/preview`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The live forecast preview is unavailable.');
      setPreview(data as Preview);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'The live forecast preview is unavailable.');
    } finally {
      setLoadingPreview(false);
    }
  }

  useEffect(() => { void loadPreview(); }, []);

  async function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSubmitted('');
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') || ''),
      email: String(data.get('email') || ''),
      company: String(data.get('company') || ''),
      interest: 'weather-planning',
      budgetRange: String(data.get('budgetRange') || 'not-sure'),
      message: String(data.get('message') || ''),
      consent: data.get('consent') === 'on',
      website: String(data.get('website') || ''),
    };
    try {
      const response = await fetch(`${API}/buyer-inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to send your request.');
      setSubmitted(result.message || 'Your pilot interest has been recorded.');
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send your request.');
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: 12, borderRadius: 8, background: '#0b1220',
    color: '#f8fafc', border: '1px solid #475569',
  };

  return (
    <main style={{ maxWidth: 1160, margin: '0 auto', padding: '26px 18px 64px', color: '#e5edf8' }}>
      <nav aria-label="Main navigation" style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 42 }}>
        <a href="/" style={{ color: '#f8fafc', fontWeight: 900, letterSpacing: '.12em', textDecoration: 'none' }}>AIDATA MARKETPLACE</a>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <a href="/for-businesses" style={{ color: '#cbd5e1' }}>Business buyers</a>
          <a href="/#catalog" style={{ color: '#cbd5e1' }}>Marketplace</a>
          <a href="/login" style={{ color: '#cbd5e1' }}>Sign in</a>
        </div>
      </nav>

      <section style={{ ...panel, padding: 'clamp(26px, 6vw, 64px)', background: 'radial-gradient(circle at 88% 12%, rgba(20,184,166,.2), transparent 34%), linear-gradient(135deg,#0f172a,#102333)' }}>
        <p style={{ color: '#67e8f9', fontSize: 12, fontWeight: 800, letterSpacing: '.18em' }}>FIELD OPERATIONS · EARLY ACCESS PILOT</p>
        <h1 style={{ color: '#fff', fontSize: 'clamp(2.2rem, 6vw, 4.2rem)', lineHeight: 1.06, letterSpacing: '-.045em', maxWidth: 850, margin: '12px 0 18px' }}>
          Plan outdoor work with clearer weather signals.
        </h1>
        <p style={{ color: '#cbd5e1', fontSize: 'clamp(1rem, 2vw, 1.2rem)', lineHeight: 1.75, maxWidth: 780 }}>
          We are testing a practical weather-planning brief for contractors, landscapers, roofers, event crews, and field-service teams. See a real NWS forecast preview, then tell us what would make it useful on your jobs.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
          <a href="#live-preview" style={{ padding: '12px 17px', borderRadius: 8, background: '#67e8f9', color: '#04111b', fontWeight: 800, textDecoration: 'none' }}>View live forecast sample</a>
          <a href="#pilot-interest" style={{ padding: '12px 17px', borderRadius: 8, border: '1px solid #67e8f9', color: '#a5f3fc', fontWeight: 800, textDecoration: 'none' }}>Join the pilot list</a>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 22 }}>Pilot stage · No charge · No purchase required · No guaranteed savings or safety outcomes</p>
      </section>

      <section id="live-preview" style={{ marginTop: 28, ...panel }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ color: '#67e8f9', fontSize: 12, fontWeight: 800, letterSpacing: '.15em', margin: '0 0 8px' }}>LIVE SOURCE PREVIEW</p>
            <h2 style={{ color: '#fff', fontSize: 24, margin: 0 }}>Denver, North Carolina · NWS point forecast</h2>
            <p style={{ color: '#9fb0c5', fontSize: 13, lineHeight: 1.6 }}>A public demonstration using the National Weather Service API. This preview does not expose private marketplace datasets.</p>
          </div>
          <button type="button" onClick={() => void loadPreview()} disabled={loadingPreview} style={{ padding: '10px 14px', borderRadius: 8, background: '#172a40', color: '#e2e8f0', border: '1px solid #475569' }}>{loadingPreview ? 'Refreshing…' : 'Refresh forecast'}</button>
        </div>

        {loadingPreview && <p style={{ color: '#cbd5e1' }}>Loading the latest available NWS forecast…</p>}
        {previewError && <div role="alert" style={{ padding: 14, borderRadius: 8, background: '#451a1a', color: '#fecaca' }}>{previewError} The pilot inquiry form is still available below.</div>}
        {preview && <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12, marginTop: 16 }}>
            {preview.periods.slice(0, 4).map((period) => (
              <article key={period.startTime} style={{ padding: 16, borderRadius: 10, background: '#0b1726', border: '1px solid #334155' }}>
                <strong style={{ color: '#fff' }}>{period.name}</strong>
                <div style={{ color: '#67e8f9', fontSize: 28, fontWeight: 800, margin: '10px 0' }}>{period.temperature === null ? '—' : `${period.temperature}°${period.temperatureUnit}`}</div>
                <p style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 }}>{period.shortForecast}</p>
                <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 0 }}>Precipitation: {period.precipitationChance === null ? 'Not listed' : `${period.precipitationChance}%`}<br />Wind: {period.windSpeed || 'Not listed'} {period.windDirection}</p>
                <p style={{ color: '#64748b', fontSize: 11 }}>{new Date(period.startTime).toLocaleString()}</p>
              </article>
            ))}
          </div>
          <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 18 }}>Forecast updated: {preview.forecastUpdatedAt ? new Date(preview.forecastUpdatedAt).toLocaleString() : 'Not supplied'} · Preview retrieved: {new Date(preview.retrievedAt).toLocaleString()}</p>
          <p style={{ color: '#94a3b8', fontSize: 12 }}>Source: <a href={preview.sourceUrl} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc' }}>NWS forecast API response</a> · <a href={preview.sourceTermsUrl} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc' }}>NWS disclaimer</a></p>
          <p style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.6 }}>{preview.disclaimer}</p>
        </>}
      </section>

      <section style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 14 }}>
        {[
          ['Forecast windows', 'Day/night periods, issue times, and source timestamps so teams can see when information was retrieved.'],
          ['Work-planning prompts', 'Weather-sensitive timing prompts based on disclosed thresholds—not automated go/no-go decisions.'],
          ['Site-specific research', 'Pilot feedback will help determine whether teams need location lists, alerts, historical comparisons, or schedule exports.'],
        ].map(([title, description]) => (
          <article key={title} style={panel}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>{title}</h3>
            <p style={{ color: '#b7c7d8', lineHeight: 1.65, marginBottom: 0 }}>{description}</p>
          </article>
        ))}
      </section>

      <section id="pilot-interest" style={{ marginTop: 28, ...panel }}>
        <p style={{ color: '#67e8f9', fontSize: 12, fontWeight: 800, letterSpacing: '.16em' }}>CUSTOMER DISCOVERY</p>
        <h2 style={{ color: '#fff', fontSize: 28, margin: '8px 0 10px' }}>Help shape the contractor weather pilot.</h2>
        <p style={{ color: '#cbd5e1', lineHeight: 1.65, maxWidth: 780 }}>Tell us what kind of work you schedule, which locations matter, and what budget range could make a useful service worthwhile. This is research only—not an order, subscription, or commitment.</p>
        <form onSubmit={submitInquiry} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginTop: 20 }}>
          <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>Your name<input name="name" required minLength={2} maxLength={100} autoComplete="name" style={fieldStyle} /></label>
          <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>Work email<input name="email" type="email" required maxLength={254} autoComplete="email" style={fieldStyle} /></label>
          <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>Company or team<input name="company" required minLength={2} maxLength={160} autoComplete="organization" style={fieldStyle} /></label>
          <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>Possible monthly budget
            <select name="budgetRange" defaultValue="not-sure" style={fieldStyle}>
              <option value="not-sure">Not sure yet</option><option value="under-25">Under $25</option><option value="25-49">$25–$49</option><option value="50-99">$50–$99</option><option value="100-249">$100–$249</option><option value="250-plus">$250+</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13, gridColumn: '1 / -1' }}>What work and locations matter? <textarea name="message" rows={4} maxLength={1500} placeholder="For example: roofing crews in two counties; need rain and wind windows 24–72 hours ahead." style={{ ...fieldStyle, resize: 'vertical' }} /></label>
          <label aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#cbd5e1', fontSize: 13, lineHeight: 1.5, gridColumn: '1 / -1' }}>
            <input name="consent" type="checkbox" required style={{ width: 18, marginTop: 3 }} />
            I agree that AI Data Marketplace may use these details to respond to this weather-pilot request. This is not consent to unrelated marketing.
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button type="submit" disabled={busy} style={{ padding: '13px 20px', borderRadius: 9, background: busy ? '#475569' : 'linear-gradient(135deg,#38bdf8,#14b8a6)', color: '#04111b', fontWeight: 800, border: 0 }}>{busy ? 'Sending…' : 'Register pilot interest'}</button>
            {submitted && <span role="status" style={{ color: '#86efac', fontSize: 13 }}>{submitted}</span>}
            {error && <span role="alert" style={{ color: '#fca5a5', fontSize: 13 }}>{error}</span>}
          </div>
        </form>
      </section>

      <footer style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid rgba(148,163,184,.15)', color: '#94a3b8', fontSize: 12, lineHeight: 1.7 }}>
        <p><strong style={{ color: '#cbd5e1' }}>Source and use notice:</strong> NWS API information is public data subject to the source’s terms and exclusions. We identify the source and do not claim NOAA/NWS endorsement. The pilot adds planning context; it is not an official forecast, professional safety advice, or a guarantee of jobsite conditions.</p>
        <p>Forecasts can change. Consult current official alerts, detailed forecasts, employer procedures, and qualified safety professionals before making operational decisions. No customer data or private forecast draft is shown on this public page.</p>
        <a href="/" style={{ color: '#7dd3fc' }}>Return to AI Data Marketplace</a>
      </footer>
    </main>
  );
}
