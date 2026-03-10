/**
 * Root Layout
 * Entry point for the app
 */

import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/hooks';
import { NotificationService } from '@/services/notification';
import { ThemeProvider, useAppTheme } from '@/store/ThemeContext';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'login';

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login
      router.replace('/login' as any);
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to home
      router.replace('/(tabs)' as any);
    }
  }, [isAuthenticated, isLoading, segments]);

  // Setup push notifications
  useEffect(() => {
    if (isAuthenticated) {
      NotificationService.registerForPushNotifications();
      
      const cleanup = NotificationService.setupNotificationListeners(
        (notification) => {
          console.log('Received notification:', notification);
        },
        (response) => {
          // Handle notification tap - navigate to detail screen
          const data = response.notification.request.content.data;
          const content = response.notification.request.content;
          
          // Build query params for notification detail screen
          const queryParams: Record<string, string> = {
            title: content.title || 'Notifikasi',
            body: content.body || '',
            type: (data?.type as string) || 'default',
            timestamp: new Date().toISOString(),
          };

          // Pass structured data if available
          if (data?.link) queryParams.link = data.link as string;
          if (data?.invoiceNumber) queryParams.invoiceNumber = data.invoiceNumber as string;
          if (data?.amount) queryParams.amount = data.amount as string;
          if (data?.dueDate) queryParams.dueDate = data.dueDate as string;
          if (data?.customerName) queryParams.customerName = data.customerName as string;
          if (data?.profileName) queryParams.profileName = data.profileName as string;

          router.push({
            pathname: '/notification-detail',
            params: queryParams,
          } as any);
        }
      );

      return cleanup;
    }
  }, [isAuthenticated]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <PaperProvider>
            <RootLayoutStatusBar />
            <RootLayoutNav />
          </PaperProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function RootLayoutStatusBar() {
  const { isDark } = useAppTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}
