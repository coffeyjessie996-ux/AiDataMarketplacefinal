import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Data Marketplace',
  description: 'Automated data discovery, cleaning, and monetization platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer style={{ borderTop: '1px solid rgba(148,163,184,.22)', background: '#0b1220', color: '#cbd5e1', padding: '24px 20px', marginTop: 36 }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <strong style={{ display: 'block', color: '#f8fafc' }}>AI Data Marketplace</strong>
              <small>Source-aware data research and marketplace services.</small>
            </div>
            <nav aria-label="Legal and support" style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
              <a href="/privacy" style={{ color: '#cbd5e1' }}>Privacy Policy</a>
              <a href="/terms" style={{ color: '#cbd5e1' }}>Terms of Service</a>
              <a href="mailto:coffeyjessie996@gmail.com" style={{ color: '#cbd5e1' }}>Contact</a>
            </nav>
          </div>
          <p style={{ maxWidth: 1180, margin: '14px auto 0', color: '#94a3b8', fontSize: 12 }}>
            © 2026 AI Data Marketplace. Not affiliated with or endorsed by any government agency.
          </p>
        </footer>
      </body>
    </html>
  );
}
