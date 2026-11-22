import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AI Data Marketplace',
  description: 'Automated data discovery, cleaning, and monetization platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer style={{ borderTop: '1px solid #e2e8f0', padding: '20px 24px', marginTop: 32, display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', fontSize: 14 }}>
          <Link href="/privacy-policy" style={{ color: 'inherit' }}>Privacy Policy</Link>
          <Link href="/terms" style={{ color: 'inherit' }}>Terms of Service</Link>
          <a href="mailto:coffeyjessie996@gmail.com" style={{ color: 'inherit' }}>Contact</a>
        </footer>
      </body>
    </html>
  );
}
