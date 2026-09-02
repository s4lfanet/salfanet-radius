'use client';

import { useCallback, useEffect, useState } from 'react';

export type PushRole = 'customer' | 'agent' | 'admin' | 'technician';

interface PushRoleConfig {
  /** localStorage key for Bearer token (customer/agent). null = use cookies (admin/technician) */
  tokenKey?: string | null;
  /** Subscribe endpoint */
  subscribeUrl: string;
  /** Unsubscribe endpoint */
  unsubscribeUrl: string;
  /** Extra body fields to send with subscribe (e.g. technicianId) */
  extraBody?: Record<string, string>;
  /** Credentials mode for fetch */
  credentials?: RequestCredentials;
  /** Session label for error messages */
  sessionLabel: string;
}

const ROLE_CONFIGS: Record<PushRole, PushRoleConfig> = {
  customer: {
    tokenKey: 'customer_token',
    subscribeUrl: '/api/push/subscribe',
    unsubscribeUrl: '/api/push/unsubscribe',
    sessionLabel: 'Customer session',
  },
  agent: {
    tokenKey: 'agentToken',
    subscribeUrl: '/api/push/agent-subscribe',
    unsubscribeUrl: '/api/push/agent-unsubscribe',
    sessionLabel: 'Agent session',
  },
  admin: {
    tokenKey: null,
    subscribeUrl: '/api/push/admin-subscribe',
    unsubscribeUrl: '/api/push/admin-unsubscribe',
    credentials: 'include',
    sessionLabel: 'Admin session',
  },
  technician: {
    tokenKey: null,
    subscribeUrl: '/api/push/technician-subscribe',
    unsubscribeUrl: '/api/push/technician-unsubscribe',
    credentials: 'same-origin',
    sessionLabel: 'Technician session',
  },
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function registerServiceWorker() {
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return registration;
}

export function usePushNotification(role: PushRole = 'customer', extraBody?: Record<string, string>) {
  const config = { ...ROLE_CONFIGS[role], extraBody: { ...ROLE_CONFIGS[role].extraBody, ...extraBody } };

  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.tokenKey) {
      const token = localStorage.getItem(config.tokenKey);
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, [config.tokenKey]);

  const getToken = useCallback(() => {
    return config.tokenKey ? localStorage.getItem(config.tokenKey) : 'cookie';
  }, [config.tokenKey]);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);

    if (!supported) {
      setPermission('default');
      setIsSubscribed(false);
      return;
    }

    setPermission(Notification.permission);

    try {
      const registration = await registerServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(Boolean(subscription));

      if (subscription) {
        const token = getToken();
        if (token) {
          fetch(config.subscribeUrl, {
            method: 'POST',
            headers: buildHeaders(),
            credentials: config.credentials,
            body: JSON.stringify({ ...config.extraBody, subscription: subscription.toJSON() }),
          }).catch(() => { /* silent sync */ });
        }
      }
    } catch (serviceWorkerError) {
      console.error('[Push Hook] Failed to refresh subscription:', serviceWorkerError);
      setError('Unable to initialize push notification service worker.');
    }
  }, [config, buildHeaders, getToken]);

  useEffect(() => {
    void refresh();

    const handleFocus = () => { void refresh(); };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refresh]);

  const subscribe = useCallback(async () => {
    if (typeof window === 'undefined') return false;

    setError(null);
    setIsLoading(true);

    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notification is not supported on this browser.');
      }

      const token = getToken();
      if (!token) {
        throw new Error(`${config.sessionLabel} not found. Please log in again.`);
      }

      let currentPermission = Notification.permission;
      if (currentPermission !== 'granted') {
        currentPermission = await Notification.requestPermission();
      }
      setPermission(currentPermission);

      if (currentPermission !== 'granted') {
        throw new Error('Notification permission was not granted.');
      }

      const vapidResponse = await fetch('/api/push/vapid-public-key');
      const vapidData = await vapidResponse.json();

      if (!vapidResponse.ok || !vapidData.publicKey) {
        throw new Error(vapidData.error || 'VAPID public key is not available.');
      }

      const registration = await registerServiceWorker();
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
        });
      }

      const response = await fetch(config.subscribeUrl, {
        method: 'POST',
        headers: buildHeaders(),
        credentials: config.credentials,
        body: JSON.stringify({ ...config.extraBody, subscription: subscription.toJSON() }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save push subscription.');
      }

      setIsSubscribed(true);
      return true;
    } catch (subscribeError: unknown) {
      setError((subscribeError instanceof Error ? subscribeError.message : String(subscribeError)) || 'Failed to enable push notifications.');
      setIsSubscribed(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [config, buildHeaders, getToken]);

  const unsubscribe = useCallback(async () => {
    if (typeof window === 'undefined') return false;

    setError(null);
    setIsLoading(true);

    try {
      const token = getToken();
      if (!token) {
        throw new Error(`${config.sessionLabel} not found. Please log in again.`);
      }

      const registration = await registerServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;

      if (subscription) {
        await subscription.unsubscribe();
      }

      const response = await fetch(config.unsubscribeUrl, {
        method: 'POST',
        headers: buildHeaders(),
        credentials: config.credentials,
        body: JSON.stringify({ ...config.extraBody, endpoint }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to remove push subscription.');
      }

      setIsSubscribed(false);
      return true;
    } catch (unsubscribeError: unknown) {
      setError((unsubscribeError instanceof Error ? unsubscribeError.message : String(unsubscribeError)) || 'Failed to disable push notifications.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [config, buildHeaders, getToken]);

  return {
    isSupported,
    isSubscribed,
    permission,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    refresh,
  };
}