/**
 * Index / Home Screen
 * Default entry point - redirects based on auth state
 */

import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store';

export default function Index() {
  const { isAuthenticated } = useAuthStore();

  // Redirect based on authentication state
  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/login" />;
}
