import { redirect } from 'next/navigation';

// PWA start_url lands here — redirect to login
export default function TechnicianRootPage() {
  redirect('/technician/login');
}
