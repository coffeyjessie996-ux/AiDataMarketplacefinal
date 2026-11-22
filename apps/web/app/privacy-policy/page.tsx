import Link from 'next/link';

export const metadata = { title: 'Privacy Policy | AI Data Marketplace', description: 'How AI Data Marketplace collects, uses, and protects personal information and Google user data.' };

const section = { marginTop: 28 } as const;
const p = { lineHeight: 1.7, color: '#475569' } as const;

export default function PrivacyPolicyPage() {
  return <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 80px', color: '#0f172a' }}>
    <Link href="/" style={{ color: '#2563eb' }}>← AI Data Marketplace</Link>
    <h1 style={{ fontSize: 36, fontWeight: 750, marginTop: 24 }}>Privacy Policy</h1>
    <p style={p}>Last updated: November 22, 2026</p>
    <p style={p}>This Privacy Policy explains how AI Data Marketplace (the “Service”) collects, uses, stores, and shares information when you visit or use the marketplace, its business-data research features, and optional Gmail integration. The Service is operated by the AI Data Marketplace project. For privacy questions or requests, contact <a href="mailto:coffeyjessie996@gmail.com">coffeyjessie996@gmail.com</a>.</p>

    <section style={section}><h2>1. Information we collect</h2>
      <p style={p}>Depending on how you use the Service, we may process account and profile details (such as name, email address, and login credentials or authentication tokens); marketplace activity (such as listings, purchases, saved items, and support requests); supplier and business research records; communications you choose to send through the Service; and technical information such as device, browser, IP address, logs, and security events.</p>
      <p style={p}>Payment details are handled by the payment provider used at checkout. We receive transaction identifiers, status, and limited payment-related details needed to operate orders and support customers; we do not intend to store full payment-card numbers or security codes.</p>
    </section>

    <section style={section}><h2>2. Google and Gmail data</h2>
      <p style={p}>If you choose to connect Gmail, Google asks you to authorize the specific Gmail permission displayed on its consent screen. The current integration requests the Gmail <strong>send</strong> scope and basic identity information (OpenID and email) to confirm the connected sender account. It does not request permission to read, search, or download your inbox, messages, attachments, or contacts.</p>
      <p style={p}>We use Google data only to verify the connected Google account and to send an individual business email after an authorized marketplace user has reviewed and explicitly approved the message. We do not use Google user data for advertising, profiling unrelated to the requested feature, or training generalized AI or machine-learning models. We do not sell Google user data or share it with third parties except as needed to provide the user-requested email delivery through Google, comply with law, or protect the Service.</p>
      <p style={p}>The Service stores the Gmail refresh token in encrypted form (AES-256-GCM) so the authorized send feature can operate without asking you to reconnect each time. Access is restricted to the backend functionality that needs it. We may retain limited connection and send-audit metadata, such as the connected sender address, granted scope, timestamps, recipient, and delivery status, for security, abuse prevention, and operational records. We do not store the contents of your Gmail inbox because the integration does not access it.</p>
      <p style={p}>You can revoke the Service’s Google access at any time through your Google Account’s third-party connections/security settings. You can also contact us at the email above to request disconnection and deletion of associated connection data. Revocation may stop the Gmail feature from working.</p>
      <p style={p}>Our use and transfer of information received from Google APIs complies with the Google API Services User Data Policy, including its Limited Use requirements.</p>
    </section>

    <section style={section}><h2>3. How we use information</h2>
      <p style={p}>We use information to provide and secure accounts; operate marketplace listings, orders, and licensing workflows; research and organize business and supplier information; generate user-requested summaries and email drafts; send messages only after required human approval; process payments and provide support; prevent fraud, spam, and abuse; maintain audit records; and comply with legal obligations.</p>
    </section>

    <section style={section}><h2>4. Business and dataset information</h2>
      <p style={p}>The Service may collect or receive business and supplier information from public sources, licensed providers, users, or partners. We aim to respect source terms, privacy rights, intellectual-property rights, and applicable laws. Public availability does not automatically mean information may lawfully be collected, republished, or resold. Users must review each listing’s description and license before relying on or redistributing a dataset.</p>
    </section>

    <section style={section}><h2>5. Sharing and service providers</h2>
      <p style={p}>We may share limited information with service providers that host the application or database, provide authentication, process payments, deliver user-approved email, monitor security, or provide technical support. Providers may process information only to perform services for us and subject to their own applicable terms and safeguards. We may also disclose information when required by law, to respond to valid legal process, or to protect users, the Service, and the public. We do not sell personal information.</p>
    </section>

    <section style={section}><h2>6. Retention and deletion</h2>
      <p style={p}>We keep information for as long as reasonably necessary to provide the Service, maintain account and transaction records, resolve disputes, enforce agreements, meet legal obligations, and protect against abuse. Retention periods depend on the type of information and its purpose. You may request access, correction, or deletion by emailing <a href="mailto:coffeyjessie996@gmail.com">coffeyjessie996@gmail.com</a>. We may need to retain certain records where the law requires it or where they are needed for legitimate security, accounting, or dispute-resolution purposes.</p>
    </section>

    <section style={section}><h2>7. Security</h2>
      <p style={p}>We use reasonable administrative, technical, and organizational safeguards designed to protect information, including access controls and encryption for stored Gmail refresh tokens. No system or transmission can be guaranteed completely secure. Please use a strong, unique password and notify us if you suspect unauthorized account access.</p>
    </section>

    <section style={section}><h2>8. Children and international use</h2>
      <p style={p}>The Service is intended for business users and is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided information, contact us so we can review and take appropriate action. Information may be processed in the United States and other locations where our service providers operate.</p>
    </section>

    <section style={section}><h2>9. Changes and contact</h2>
      <p style={p}>We may update this Policy as the Service changes. We will update the date above when we publish revisions. Material changes may also be communicated through the Service where appropriate. Questions and privacy requests: <a href="mailto:coffeyjessie996@gmail.com">coffeyjessie996@gmail.com</a>.</p>
    </section>
    <p style={{ ...p, marginTop: 40 }}><Link href="/terms" style={{ color: '#2563eb' }}>Read the Terms of Service</Link></p>
  </main>;
}
