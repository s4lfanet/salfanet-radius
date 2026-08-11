import { redirect } from 'next/navigation';

// Root URL always goes to customer portal
// Customer page handles auth check internally (redirects to /login if no session)
// Admin panel is at /admin or /admin/login (not public-facing)
export default function Home() {
  redirect('/customer');
}
