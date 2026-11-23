import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | AI Data Marketplace',
  description: 'How AI Data Marketplace collects, uses, and protects information.',
};

export default function PrivacyPolicyPage() {
  return (
    <main style={{ minHeight: '70vh', background: '#0b1220', color: '#e2e8f0', padding: '44px 20px' }}>
      <article style={{ maxWidth: 900, margin: '0 auto', lineHeight: 1.75 }}>
        <a href="/" style={{ color: '#93c5fd' }}>← Back to marketplace</a>
        <h1 style={{ color: '#fff', fontSize: 36, marginTop: 24 }}>Privacy Policy</h1>
        <p style={{ color: '#94a3b8' }}>Effective date: November 23, 2026</p>
        <p>AI Data Marketplace (“we,” “us,” or “the Service”) provides tools for public-data research, dataset preparation, and marketplace transactions. This policy explains what information the Service handles and how it is used.</p>

        <h2>1. Information we collect</h2>
        <ul>
          <li><strong>Account information:</strong> name, email address, account role, authentication records, and password hashes.</li>
          <li><strong>Marketplace information:</strong> datasets, descriptions, source links, seller rights attestations, listing details, orders, and support requests.</li>
          <li><strong>Payment information:</strong> order totals, payment status, and payment-provider references. Card details are processed by Stripe; we do not store full payment-card numbers.</li>
          <li><strong>Connected account information:</strong> if you connect Gmail, we use Google OAuth authorization and store the connection tokens in encrypted form to provide the email features you enable.</li>
          <li><strong>Technical information:</strong> timestamps, security events, application logs, and error diagnostics needed to operate and protect the Service.</li>
        </ul>

        <h2>2. How we use information</h2>
        <ul>
          <li>To create and secure accounts and provide marketplace features.</li>
          <li>To prepare listings, preserve source attribution, process orders, and provide purchased downloads.</li>
          <li>To investigate abuse, troubleshoot errors, and protect the Service.</li>
          <li>To provide research summaries. When AI research features are enabled, selected public supplier-research records and related metadata may be sent to OpenAI for analysis. AI output may be incomplete and is not independent verification.</li>
          <li>To provide Gmail-related features only when you connect your account and enable the relevant functionality. Do not connect an account or submit information you are not authorized to use.</li>
        </ul>

        <h2>3. How information is shared</h2>
        <p>We use service providers to host and operate the Service, including Vercel for application hosting, Supabase for database services, Stripe for payment processing, Google for optional Gmail connections, and OpenAI when AI analysis is enabled. These providers process information as needed to provide their services and under their applicable terms.</p>
        <p>We do not sell personal account information. Dataset content that a seller chooses to publish may be displayed to buyers under the license and description shown with that listing. Public-source records remain subject to their own source terms and attribution requirements.</p>

        <h2>4. Data retention and choices</h2>
        <p>We retain account, transaction, security, and marketplace records for as long as reasonably necessary to operate the Service, resolve disputes, meet legal obligations, and enforce our terms. You may request access to, correction of, or deletion of account information by contacting us. Some transaction, fraud-prevention, or legal records may need to be retained.</p>

        <h2>5. Security</h2>
        <p>We use reasonable administrative and technical safeguards, including password hashing, access controls, and encryption for connected Gmail tokens. No internet service or storage system can be guaranteed completely secure.</p>

        <h2>6. Cookies and browser storage</h2>
        <p>The Service may use essential browser storage and similar technologies to maintain sign-in state, remember settings, and protect account sessions. Disabling essential browser storage may prevent parts of the Service from working.</p>

        <h2>7. Children</h2>
        <p>The Service is intended for adults and is not directed to children under 18. We do not knowingly collect personal information from children under 18.</p>

        <h2>8. Changes to this policy</h2>
        <p>We may update this policy as the Service changes. The effective date above identifies the latest version. Material changes will be reflected on this page.</p>

        <h2>9. Contact</h2>
        <p>For privacy questions or requests, contact <a href="mailto:coffeyjessie996@gmail.com" style={{ color: '#93c5fd' }}>coffeyjessie996@gmail.com</a>.</p>
      </article>
    </main>
  );
}
