import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | AI Data Marketplace',
  description: 'Terms for using AI Data Marketplace as a buyer or seller.',
};

export default function TermsOfServicePage() {
  return (
    <main style={{ minHeight: '70vh', background: '#0b1220', color: '#e2e8f0', padding: '44px 20px' }}>
      <article style={{ maxWidth: 900, margin: '0 auto', lineHeight: 1.75 }}>
        <a href="/" style={{ color: '#93c5fd' }}>← Back to marketplace</a>
        <h1 style={{ color: '#fff', fontSize: 36, marginTop: 24 }}>Terms of Service</h1>
        <p style={{ color: '#94a3b8' }}>Effective date: November 23, 2026</p>
        <p>These Terms govern your access to AI Data Marketplace (“the Service”). By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.</p>

        <h2>1. Eligibility and accounts</h2>
        <p>You must be at least 18 years old and provide accurate account information. You are responsible for safeguarding your sign-in credentials and for activity conducted through your account. We may restrict or suspend accounts where needed to protect the Service or comply with law.</p>

        <h2>2. Marketplace role</h2>
        <p>The Service provides tools for research, dataset preparation, listing, and order processing. We do not guarantee that any supplier, business, dataset, opportunity, forecast, or other record is complete, current, accurate, or suitable for a particular purpose. Research summaries and AI-generated content are aids only and are not independent verification, legal advice, financial advice, or an endorsement.</p>

        <h2>3. Seller responsibilities and data rights</h2>
        <p>Sellers are responsible for ensuring they have the legal right to collect, use, package, publish, license, and sell every item of content they submit. You must review the terms for each source, preserve required attribution, respect privacy and access restrictions, and provide truthful rights attestations. Public availability does not automatically mean that data may be repackaged or resold.</p>
        <p>Do not publish restricted government, personal, confidential, copyrighted, or otherwise protected information unless you have a valid legal basis and the necessary permissions. A source-specific approval in the Service applies only to the exact source, fields, and conditions described in that approval; it does not authorize other sources or broader uses.</p>

        <h2>4. Buyer licenses</h2>
        <p>When you purchase a dataset, you receive only the license stated on that listing. You may not redistribute, resell, publish, or use the dataset outside that license. You are responsible for reviewing the description, source attribution, permitted uses, and limitations before purchasing.</p>

        <h2>5. Payments and orders</h2>
        <p>Payments may be processed by Stripe or another payment provider identified at checkout. An order is treated as paid only after the Service receives and verifies the provider's payment confirmation. A checkout redirect, pending payment, test transaction, or displayed listing price is not proof of a completed purchase. Seller payouts are separate and are not promised unless the Service expressly enables them.</p>
        <p>If you believe a payment or download failed, contact us promptly with the order reference. Any refund or other remedy is subject to applicable law and any policy displayed for the specific product or transaction.</p>

        <h2>6. Acceptable use and automation</h2>
        <p>You may not use the Service to violate law, infringe rights, bypass access controls, collect data in breach of source terms, distribute malware, mislead buyers, or send unsolicited or unlawful messages. Automated agents must operate within applicable website terms and laws. They may not make purchases, submit bids or applications, publish listings, or send outreach without the required human review and authorization.</p>

        <h2>7. Government and third-party sources</h2>
        <p>Government and third-party names, records, and data sources are provided for identification and attribution only. AI Data Marketplace is independent and is not affiliated with, sponsored by, certified by, or endorsed by any government agency. Source providers do not endorse the Service or its products.</p>

        <h2>8. Availability and changes</h2>
        <p>We may modify, suspend, or discontinue features, remove listings that lack adequate rights evidence, or restrict access to protect users and comply with law. We do not guarantee uninterrupted availability or that every integration will remain available.</p>

        <h2>9. Disclaimers and limitation of liability</h2>
        <p>To the extent permitted by law, the Service is provided “as is” and “as available,” without warranties that the data, research, AI output, or marketplace will meet your requirements or produce any particular result. To the extent permitted by law, AI Data Marketplace is not liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, data, or business opportunities arising from use of the Service.</p>

        <h2>10. Contact</h2>
        <p>Questions about these Terms may be sent to <a href="mailto:coffeyjessie996@gmail.com" style={{ color: '#93c5fd' }}>coffeyjessie996@gmail.com</a>.</p>
      </article>
    </main>
  );
}
