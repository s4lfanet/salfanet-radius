'use client';

import { useCallback, useEffect, useState } from 'react';

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

export function usePushNotification() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

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
      // Sync: if browser has subscription, re-register silently to ensure DB is up to date
      if (subscription) {
        const token = localStorage.getItem('customer_token');
        if (token) {
          fetch('/api/push/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ subscription: subscription.toJSON() }),
          }).catch(() => { /* silent sync */ });
        }
      }
    } catch (serviceWorkerError) {
      console.error('[Push Hook] Failed to refresh subscription:', serviceWorkerError);
      setError('Unable to initialize push notification service worker.');
    }
  }, []);

  useEffect(() => {
    void refresh();

    const handleFocus = () => {
      void refresh();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refresh]);

  const subscribe = useCallback(async () => {
    if (typeof window === 'undefined') {
      return false;
    }

    setError(null);
    setIsLoading(true);

    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notification is not supported on this browser.');
      }

      const token = localStorage.getItem('customer_token');

      if (!token) {
        throw new Error('Customer session not found. Please log in again.');
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

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save push subscription.');
      }

      setIsSubscribed(true);
      return true;
    } catch (subscribeError: any) {
      setError(subscribeError.message || 'Failed to enable push notifications.');
      setIsSubscribed(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (typeof window === 'undefined') {
      return false;
    }

    setError(null);
    setIsLoading(true);

    try {
      const token = localStorage.getItem('customer_token');

      if (!token) {
        throw new Error('Customer session not found. Please log in again.');
      }

      const registration = await registerServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;

      if (subscription) {
        await subscription.unsubscribe();
      }

      const response = await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to remove push subscription.');
      }

      setIsSubscribed(false);
      return true;
    } catch (unsubscribeError: any) {
      setError(unsubscribeError.message || 'Failed to disable push notifications.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

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