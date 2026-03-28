import type { Metadata } from 'next';
import AdminClientLayout from './AdminClientLayout';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Panel - SALFANET RADIUS',
  manifest: '/manifest-admin.json',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminClientLayout>{children}</AdminClientLayout>;
}
