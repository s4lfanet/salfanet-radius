/**
 * Custom React Hooks
 */

import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store';
import { AuthService } from '@/services/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardService } from '@/services/dashboard';
import { InvoiceService } from '@/services/invoice';
import { PaymentService, CreatePaymentData } from '@/services/payment';
import { NotificationService } from '@/services/notification';

/**
 * Auth Hook
 */
export function useAuth() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, setUser, setAuthenticated, setLoading, logout: storeLogout } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const authenticated = await AuthService.isAuthenticated();
      if (authenticated) {
        const storedUser = await AuthService.getStoredUser();
        setUser(storedUser);
        setAuthenticated(true);
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (identifier: string) => {
    const response = await AuthService.login(identifier);
    setUser(response.user);
    setAuthenticated(true);
    return response;
  };

  const logout = async () => {
    await AuthService.logout();
    storeLogout();
    router.replace('/login' as any);
  };

  const refreshProfile = async () => {
    const profile = await AuthService.getProfile();
    setUser(profile);
    await AuthService.updateStoredUser(profile);
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    refreshProfile,
  };
}

/**
 * Dashboard Hook
 */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => DashboardService.getDashboard(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

/**
 * Invoices Hook
 */
export function useInvoices(page: number = 1, status?: string) {
  return useQuery({
    queryKey: ['invoices', page, status],
    queryFn: () => InvoiceService.getInvoices(page, 10, status),
  });
}

/**
 * Invoice Detail Hook
 */
export function useInvoiceDetail(id: string) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => InvoiceService.getInvoiceDetail(id),
    enabled: !!id,
  });
}

/**
 * Payments Hook
 */
export function usePayments(page: number = 1) {
  return useQuery({
    queryKey: ['payments', page],
    queryFn: () => PaymentService.getPayments(page, 10),
  });
}

/**
 * Create Payment Mutation
 */
export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePaymentData) => PaymentService.createPayment(data),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/**
 * Notifications Hook
 * Returns empty data in Expo Go (notifications disabled)
 */
export function useNotifications(page: number = 1) {
  return useQuery({
    queryKey: ['notifications', page],
    queryFn: () => NotificationService.getNotificationHistory(),
    refetchInterval: 60000, // Refresh every minute
  });
}

/**
 * Usage Statistics Hook
 */
export function useUsage(period: 'daily' | 'weekly' | 'monthly' = 'daily') {
  return useQuery({
    queryKey: ['usage', period],
    queryFn: () => DashboardService.getUsage(period),
  });
}
