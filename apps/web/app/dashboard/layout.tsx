import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard | AI Data Marketplace',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
