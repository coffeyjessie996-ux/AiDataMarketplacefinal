import Link from 'next/link';

export const metadata = { title: 'Terms of Service | AI Data Marketplace', description: 'Terms governing use of AI Data Marketplace.' };

const section = { marginTop: 28 } as const;
const p = { lineHeight: 1.7, color: '#475569' } as const;

export default function TermsPage() {
  return <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 80px', color: '#0f172a' }}>
    <Link href="/" style={{ color: '#2563eb' }}>← AI Data Marketplace</Link>
    <h1 style={{ fontSize: 36, fontWeight: 750, marginTop: 24 }}>Terms of Service</h1>
    <p style={p}>Last updated: November 22, 2026</p>
    <p style={p}>These Terms govern access to and use of AI Data Marketplace (the “Service”), including its marketplace, data research, listings, account tools, and optional integrations. By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service. The Service is operated by the AI Data Marketplace project. Questions: <a href="mailto:coffeyjessie996@gmail.com">coffeyjessie996@gmail.com</a>.</p>

    <section style={section}><h2>1. Eligibility and accounts</h2>
      <p style={p}>You must be legally able to enter into a binding agreement and provide accurate account information. You are responsible for keeping your credentials secure, all activity under your account, and promptly notifying us of suspected unauthorized access. We may suspend or restrict accounts to protect the Service, users, or third parties.</p>
    </section>

    <section style={section}><h2>2. Marketplace listings and data licenses</h2>
      <p style={p}>Listings may describe datasets, business directories, supplier information, research, or other digital products. A listing’s stated license, permitted uses, limitations, and delivery terms govern the buyer’s rights. Unless a listing expressly grants broader rights, purchasing access does not transfer ownership of the underlying data or intellectual property and does not authorize unrestricted redistribution, resale, or publication.</p>
      <p style={p}>Sellers are responsible for having the rights, permissions, and lawful basis needed to submit, license, and sell their materials. Sellers must accurately describe sources, collection dates, coverage, limitations, and known quality issues. Sellers may not submit unlawfully obtained, confidential, deceptive, infringing, or improperly disclosed personal information.</p>
      <p style={p}>Buyers are responsible for reviewing a dataset’s source, license, accuracy, freshness, and suitability before use, and for complying with privacy, marketing, intellectual-property, consumer-protection, and other applicable laws.</p>
    </section>

    <section style={section}><h2>3. Acceptable use</h2>
      <p style={p}>You may not use the Service to violate law or another person’s rights; scrape or harvest data in violation of source terms or access controls; send unlawful, deceptive, unsolicited, or abusive communications; upload malware; interfere with the Service; evade security or usage limits; misrepresent identity or affiliation; or use datasets to discriminate unlawfully, stalk, harass, or make prohibited high-impact decisions.</p>
      <p style={p}>You must have an appropriate legal basis and all required permissions before contacting individuals or businesses. The Service’s email tools are designed for individually reviewed and approved messages. You remain responsible for the content, recipient, and legal compliance of every message you authorize.</p>
    </section>

    <section style={section}><h2>4. AI-generated content and data quality</h2>
      <p style={p}>Research, classifications, summaries, scores, recommendations, and drafts generated with automated or AI-assisted tools may be incomplete, inaccurate, outdated, or unsuitable for a particular purpose. They are provided as decision-support aids, not guarantees or professional, legal, financial, or compliance advice. You must independently verify material facts and obtain any expert advice you need before acting.</p>
    </section>

    <section style={section}><h2>5. Orders, payments, and refunds</h2>
      <p style={p}>Prices, taxes, fees, and applicable license terms are displayed during checkout or in the relevant listing. Payments may be processed by third-party payment providers and are subject to their terms. An order is not complete until the payment provider confirms payment and the Service records the order as paid. Refund eligibility, where applicable, will be described in the listing, checkout terms, or a separately published refund policy. Nothing in these Terms limits rights that cannot legally be waived.</p>
    </section>

    <section style={section}><h2>6. Third-party services and Gmail</h2>
      <p style={p}>The Service may connect to third-party services such as Google and payment providers. Your use of those services is also subject to their terms and privacy policies. If you connect Gmail, you authorize the Service to use the permissions shown on Google’s consent screen for the feature described there. The current Gmail integration requests send-only access and is designed to send a message only after an authorized user reviews and explicitly approves it. You may revoke Google access through your Google Account settings.</p>
    </section>

    <section style={section}><h2>7. Intellectual property and feedback</h2>
      <p style={p}>The Service, software, branding, and platform materials are owned by or licensed to the operator and protected by applicable intellectual-property laws. You retain rights you hold in content you submit, while granting the Service the limited rights necessary to host, process, display, and deliver that content to operate the features you request. If you provide suggestions, you permit us to use them to improve the Service without compensation or obligation, subject to applicable law.</p>
    </section>

    <section style={section}><h2>8. Availability, disclaimers, and liability</h2>
      <p style={p}>The Service is provided on an “as is” and “as available” basis to the extent permitted by law. We do not warrant uninterrupted operation, error-free results, dataset accuracy, merchantability, fitness for a particular purpose, or non-infringement. To the extent permitted by law, the operator will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenue, data, or business opportunities arising from use of the Service. Nothing in these Terms excludes liability that cannot legally be excluded.</p>
    </section>

    <section style={section}><h2>9. Suspension and termination</h2>
      <p style={p}>You may stop using the Service at any time. We may suspend or terminate access for violations of these Terms, legal requirements, security concerns, or risks to users or the Service. Sections that by their nature should survive termination—including payment obligations, license restrictions, intellectual-property provisions, disclaimers, and liability limits—will continue to apply.</p>
    </section>

    <section style={section}><h2>10. Changes, governing law, and contact</h2>
      <p style={p}>We may update these Terms as the Service evolves. Updated Terms will be posted here with a revised date. Continued use after the effective date means you accept the updated Terms, to the extent permitted by law. These Terms are governed by applicable laws, without limiting any mandatory consumer protections that apply to you. Questions: <a href="mailto:coffeyjessie996@gmail.com">coffeyjessie996@gmail.com</a>.</p>
    </section>
    <p style={{ ...p, marginTop: 40 }}><Link href="/privacy-policy" style={{ color: '#2563eb' }}>Read the Privacy Policy</Link></p>
  </main>;
}
