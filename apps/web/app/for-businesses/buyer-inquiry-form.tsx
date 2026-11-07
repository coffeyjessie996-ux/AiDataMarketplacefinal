'use client';

import { FormEvent, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

export default function BuyerInquiryForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') || ''),
      email: String(data.get('email') || ''),
      company: String(data.get('company') || ''),
      interest: String(data.get('interest') || ''),
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
      setMessage(result.message || 'Your request has been received.');
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send your request.');
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = { width: '100%', padding: 12, borderRadius: 8, background: '#0b1220', color: '#f8fafc', border: '1px solid #475569' };

  return (
    <section id="buyer-inquiry" style={{ marginTop: 58, padding: 'clamp(20px, 4vw, 42px)', border: '1px solid rgba(56,189,248,.28)', borderRadius: 18, background: 'linear-gradient(145deg, rgba(15,23,42,.96), rgba(13,36,49,.9))' }}>
      <p style={{ color: '#67e8f9', fontSize: 12, fontWeight: 800, letterSpacing: '.16em', marginTop: 0 }}>GOVCON BUYER DESK</p>
      <h2 style={{ color: '#fff', fontSize: 'clamp(1.7rem, 3vw, 2.3rem)', margin: '8px 0 12px' }}>Tell us what supplier intelligence your team needs.</h2>
      <p style={{ color: '#cbd5e1', lineHeight: 1.65, maxWidth: 760 }}>Request a preview or ask about a tailored federal-award research pack. This is an inquiry, not a purchase or promise that a dataset is already available.</p>
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 22 }}>
        <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>Your name<input name="name" required minLength={2} maxLength={100} autoComplete="name" style={fieldStyle} /></label>
        <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>Work email<input name="email" type="email" required maxLength={254} autoComplete="email" style={fieldStyle} /></label>
        <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>Company<input name="company" required minLength={2} maxLength={160} autoComplete="organization" style={fieldStyle} /></label>
        <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>What are you interested in?
          <select name="interest" required defaultValue="supplier-intelligence" style={fieldStyle}>
            <option value="supplier-intelligence">Federal supplier intelligence</option>
            <option value="engineering-awards">Engineering services awards (NAICS 541330)</option>
            <option value="agency-trends">Agency and competitor award trends</option>
            <option value="custom-research">Custom GovCon research</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13, gridColumn: '1 / -1' }}>What would help your team? <textarea name="message" rows={3} maxLength={1500} placeholder="Optional: agencies, NAICS codes, states, competitors, or date range." style={{ ...fieldStyle, resize: 'vertical' }} /></label>
        <label aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#cbd5e1', fontSize: 13, lineHeight: 1.5, gridColumn: '1 / -1' }}><input name="consent" type="checkbox" required style={{ marginTop: 3 }} />I agree that AI Data Marketplace may use these details to respond to this request.</label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button type="submit" disabled={busy} style={{ padding: '13px 20px', borderRadius: 9, background: busy ? '#475569' : 'linear-gradient(135deg,#38bdf8,#14b8a6)', color: '#04111b', fontWeight: 800, border: 0, cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Sending…' : 'Request buyer follow-up'}</button>
          <span role="status" style={{ color: '#86efac', fontSize: 13 }}>{message}</span>
          {error && <span role="alert" style={{ color: '#fca5a5', fontSize: 13 }}>{error}</span>}
        </div>
      </form>
    </section>
  );
}
