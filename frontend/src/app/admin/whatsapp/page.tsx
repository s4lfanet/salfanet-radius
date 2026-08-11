'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function WhatsAppRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/admin/settings/whatsapp');
  }, [router]);
  
  return null;
}
