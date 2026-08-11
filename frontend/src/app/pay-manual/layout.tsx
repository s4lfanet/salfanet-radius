'use client';

import { useEffect } from 'react';
import { CyberToastProvider, useToast } from '@/components/cyberpunk/CyberToast';
import { registerGlobalToast, registerGlobalConfirm } from '@/lib/sweetalert';

function PayManualToastBridge() {
  const { addToast, confirm } = useToast();
  useEffect(() => {
    registerGlobalToast(addToast);
    registerGlobalConfirm(confirm);
  }, [addToast, confirm]);
  return null;
}

export default function PayManualLayout({ children }: { children: React.ReactNode }) {
  return (
    <CyberToastProvider>
      <PayManualToastBridge />
      {children}
    </CyberToastProvider>
  );
}
