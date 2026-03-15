import type { Metadata, Viewport } from 'next';
import TechnicianPortalLayout from '../TechnicianPortalLayout';

export const metadata: Metadata = {
  title: 'Portal Teknisi - SALFANET RADIUS',
  description: 'Portal Teknisi untuk manajemen tiket dan pelanggan',
  manifest: '/manifest-technician.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0520',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <TechnicianPortalLayout>{children}</TechnicianPortalLayout>;
}
