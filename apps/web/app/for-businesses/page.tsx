import type { Metadata } from 'next';
import BuyerInquiryForm from './buyer-inquiry-form';

export const metadata: Metadata = {
  title: 'Supplier Intelligence for Business Buyers | AI Data Marketplace',
  description:
    'Explore supplier research and business intelligence for procurement teams, sales organizations, manufacturers, distributors, and market researchers.',
  alternates: { canonical: '/for-businesses' },
};

const audiences = [
  {
    title: 'Procurement teams',
    description:
      'Research potential suppliers, compare business information, and build a stronger sourcing shortlist.',
  },
  {
    title: 'B2B sales teams',
    description:
      'Discover organizations to research and qualify before investing time in outreach.',
  },
  {
    title: 'Manufacturers and distributors',
    description:
      'Explore potential suppliers, channel partners, and organizations across target markets.',
  },
  {
    title: 'Government contractors',
    description:
      'Research supplier and contracting-related business information to support opportunity discovery.',
  },
  {
    title: 'Market research firms',
    description:
      'Find structured business information to support market mapping and commercial research.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Explore available data',
    description:
      'Browse the live catalog and supplier research area. Availability depends on what has actually been collected, reviewed, and published.',
  },
  {
    number: '02',
    title: 'Review before you rely on it',
    description:
      'Check each listing’s description, source information, freshness, quality details, and licensing terms where provided.',
  },
  {
    number: '03',
    title: 'Choose the right next step',
    description:
      'Create a buyer account to access marketplace features. Auction offers, where available, are non-binding until a supported purchase flow is introduced.',
  },
];

export default function ForBusinessesPage() {
  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 20px 64px' }}>
      <nav aria-label="Main navigation" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 52 }}>
        <a href="/" style={{ color: '#f8fafc', fontWeight: 900, letterSpacing: '.12em', textDecoration: 'none' }}>AIDATA MARKETPLACE</a>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href="/#catalog" style={{ color: '#cbd5e1', textDecoration: 'none' }}>Browse data</a>
          <a href="/suppliers" style={{ color: '#cbd5e1', textDecoration: 'none' }}>Supplier research</a>
          <a href="/auctions" style={{ color: '#cbd5e1', textDecoration: 'none' }}>Auctions</a>
          <a href="/login" style={{ color: '#cbd5e1', textDecoration: 'none' }}>Sign in</a>
        </div>
      </nav>

      <section style={{ padding: 'clamp(28px, 6vw, 68px)', borderRadius: 22, border: '1px solid rgba(56,189,248,.24)', background: 'radial-gradient(circle at 90% 10%, rgba(20,184,166,.18), transparent 35%), linear-gradient(135deg, #0f172a, #101d2a)' }}>
        <p style={{ color: '#67e8f9', fontSize: 12, fontWeight: 800, letterSpacing: '.18em', margin: '0 0 14px' }}>BUILT FOR BUSINESS BUYERS</p>
        <h1 style={{ maxWidth: 820, color: '#fff', fontSize: 'clamp(2.25rem, 6vw, 4.4rem)', lineHeight: 1.06, letterSpacing: '-.045em', margin: '0 0 20px' }}>
          Supplier intelligence to help your team find its next opportunity.
        </h1>
        <p style={{ maxWidth: 760, color: '#cbd5e1', fontSize: 'clamp(1rem, 2vw, 1.2rem)', lineHeight: 1.75, margin: '0 0 28px' }}>
          Explore business and supplier research for sourcing, sales prospecting, partner discovery, and market analysis. Start with the data that is actually available in the marketplace.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/#catalog" style={{ display: 'inline-flex', padding: '13px 19px', borderRadius: 9, background: 'linear-gradient(135deg,#38bdf8,#14b8a6)', color: '#04111b', fontWeight: 800, textDecoration: 'none' }}>Browse available data</a>
          <a href="/register" style={{ display: 'inline-flex', padding: '13px 19px', borderRadius: 9, border: '1px solid rgba(148,163,184,.4)', color: '#f8fafc', fontWeight: 700, textDecoration: 'none' }}>Create buyer account</a>
        </div>
      </section>

      <section style={{ marginTop: 58 }}>
        <p style={{ color: '#67e8f9', fontSize: 12, fontWeight: 800, letterSpacing: '.16em' }}>WHO IT SERVES</p>
        <h2 style={{ color: '#fff', fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', margin: '8px 0 24px' }}>Business intelligence for teams that make commercial decisions.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {audiences.map((audience) => (
            <article key={audience.title} style={{ padding: 22, border: '1px solid rgba(148,163,184,.18)', borderRadius: 14, background: 'rgba(15,23,42,.58)' }}>
              <h3 style={{ color: '#fff', fontSize: 18, margin: '0 0 10px' }}>{audience.title}</h3>
              <p style={{ color: '#aebdce', lineHeight: 1.65, margin: 0 }}>{audience.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 58 }}>
        <p style={{ color: '#67e8f9', fontSize: 12, fontWeight: 800, letterSpacing: '.16em' }}>HOW TO USE THE MARKETPLACE</p>
        <h2 style={{ color: '#fff', fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', margin: '8px 0 24px' }}>A practical path from research to a buying decision.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          {steps.map((step) => (
            <article key={step.number} style={{ padding: 22, borderRadius: 14, background: 'rgba(15,23,42,.7)', border: '1px solid rgba(148,163,184,.15)' }}>
              <span style={{ color: '#38bdf8', fontSize: 28, fontWeight: 900 }}>{step.number}</span>
              <h3 style={{ color: '#fff', margin: '12px 0 8px', fontSize: 19 }}>{step.title}</h3>
              <p style={{ color: '#aebdce', lineHeight: 1.65, margin: 0 }}>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <BuyerInquiryForm />

      <section style={{ marginTop: 58, padding: '28px clamp(20px, 4vw, 42px)', border: '1px solid rgba(20,184,166,.25)', borderRadius: 16, background: 'rgba(13,148,136,.08)' }}>
        <h2 style={{ color: '#fff', margin: '0 0 12px', fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>Check the catalog before making a decision.</h2>
        <p style={{ color: '#cbd5e1', lineHeight: 1.7, maxWidth: 820, margin: '0 0 20px' }}>
          Catalog coverage changes as research is collected and reviewed. Listing details and licensing terms should be checked individually. The platform does not represent an auction offer as a completed sale, and no payment is taken through an offer submission.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/#catalog" style={{ color: '#04111b', background: '#67e8f9', padding: '12px 17px', borderRadius: 8, fontWeight: 800, textDecoration: 'none' }}>View catalog</a>
          <a href="/suppliers" style={{ color: '#e2e8f0', border: '1px solid rgba(148,163,184,.4)', padding: '12px 17px', borderRadius: 8, fontWeight: 700, textDecoration: 'none' }}>Explore supplier research</a>
        </div>
      </section>

      <footer style={{ marginTop: 44, paddingTop: 20, borderTop: '1px solid rgba(148,163,184,.15)', color: '#8293a7', fontSize: 13 }}>
        AI Data Marketplace · Business supplier intelligence and research
      </footer>
    </main>
  );
}
