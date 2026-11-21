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
      budgetRange: String(data.get('budgetRange') || 'not-sure'),
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
      <p style={{ color: '#67e8f9', fontSize: 12, fontWeight: 800, letterSpacing: '.16em', marginTop: 0 }}>BUSINESS SERVICES & INTELLIGENCE</p>
      <h2 style={{ color: '#fff', fontSize: 'clamp(1.7rem, 3vw, 2.3rem)', margin: '8px 0 12px' }}>Tell us what your business needs.</h2>
      <p style={{ color: '#cbd5e1', lineHeight: 1.65, maxWidth: 760 }}>Request a quote or tell us what would help your team. This is a demand-validation inquiry, not a purchase or a promise that every service is already available.</p>
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 22 }}>
        <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>Your name<input name="name" required minLength={2} maxLength={100} autoComplete="name" style={fieldStyle} /></label>
        <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>Work email<input name="email" type="email" required maxLength={254} autoComplete="email" style={fieldStyle} /></label>
        <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>Company<input name="company" required minLength={2} maxLength={160} autoComplete="organization" style={fieldStyle} /></label>
        <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>What are you interested in?
          <select name="interest" required defaultValue="supplier-intelligence" style={fieldStyle}>
            <option value="supplier-intelligence">Federal supplier intelligence</option>
            <option value="engineering-awards">Engineering services awards (NAICS 541330)</option>
            <option value="agency-trends">Agency and competitor award trends</option>
            <option value="custom-research">Custom business / market research</option>
            <option value="supplier-monitoring">Supplier and competitor monitoring</option>
            <option value="data-cleaning">Data cleaning and enrichment</option>
            <option value="rfp-intelligence">RFP and contract opportunity intelligence</option>
            <option value="business-reports">Industry and business reports</option>
            <option value="data-api">Business data API access</option>
            <option value="workflow-automation">Business workflow automation</option>
            <option value="white-label-intelligence">White-label research and reports</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13 }}>Potential budget
          <select name="budgetRange" defaultValue="not-sure" style={fieldStyle}>
            <option value="not-sure">Not sure yet</option>
            <option value="under-25">Under $25</option>
            <option value="25-49">$25–$49</option>
            <option value="50-99">$50–$99</option>
            <option value="100-249">$100–$249</option>
            <option value="250-plus">$250+</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6, color: '#dbeafe', fontSize: 13, gridColumn: '1 / -1' }}>What would help your team? <textarea name="message" rows={3} maxLength={1500} placeholder="Describe the data, research, suppliers, locations, reporting frequency, or workflow you need." style={{ ...fieldStyle, resize: 'vertical' }} /></label>
        <label aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#cbd5e1', fontSize: 13, lineHeight: 1.5, gridColumn: '1 / -1' }}><input name="consent" type="checkbox" required style={{ marginTop: 3 }} />I agree that AI Data Marketplace and, if needed to fulfill this request, its assigned service provider may use these details to respond. This is not a purchase or a commitment.</label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button type="submit" disabled={busy} style={{ padding: '13px 20px', borderRadius: 9, background: busy ? '#475569' : 'linear-gradient(135deg,#38bdf8,#14b8a6)', color: '#04111b', fontWeight: 800, border: 0, cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Sending…' : 'Request a quote / follow-up'}</button>
          <span role="status" style={{ color: '#86efac', fontSize: 13 }}>{message}</span>
          {error && <span role="alert" style={{ color: '#fca5a5', fontSize: 13 }}>{error}</span>}
        </div>
      </form>
    </section>
  );
}
