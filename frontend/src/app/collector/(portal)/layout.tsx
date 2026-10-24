import { Plus_Jakarta_Sans } from 'next/font/google';
import CollectorPortalLayout from '../CollectorPortalLayout';

// Same typeface as the admin and customer apps (DESIGN.md): large x-height and
// clearly distinct figures for rupiah amounts and invoice numbers. Type
// follows the panel's root size; control heights are set in px.
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap' });

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={jakarta.className}>
      <CollectorPortalLayout>{children}</CollectorPortalLayout>
    </div>
  );
}
