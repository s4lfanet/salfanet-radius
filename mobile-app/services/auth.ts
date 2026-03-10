/**
 * Authentication Service
 */

import { apiClient } from './api';
import * as SecureStore from 'expo-secure-store';
import { API_CONFIG, STORAGE_KEYS } from '@/constants';

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  profileName: string;
  profileId: string;
  price: number;
  downloadSpeed: number;
  uploadSpeed: number;
  expiredAt: string | null;
  balance: number;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: User;
  message?: string;
}

export class AuthService {
  /**
   * Login with phone number or customer ID
   */
  static async login(identifier: string): Promise<LoginResponse> {
    try {
      console.log('[AuthService] Attempting login with:', identifier);
      console.log('[AuthService] API URL:', API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.LOGIN);
      
      const response = await apiClient.post<LoginResponse>(
        API_CONFIG.ENDPOINTS.LOGIN,
        { identifier }
      );

      console.log('[AuthService] Login response:', response);

      if (response.success && response.token) {
        // Store token and user data
        await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, response.token);
        await SecureStore.setItemAsync(
          STORAGE_KEYS.USER_DATA,
          JSON.stringify(response.user)
        );
      }

      return response;
    } catch (error: any) {
      console.error('[AuthService] Login error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          timeout: error.config?.timeout,
        },
      });
      
      // Return more detailed error message
      const errorMessage = error.response?.data?.message 
        || error.message 
        || 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Logout user
   */
  static async logout(): Promise<void> {
    try {
      await apiClient.post(API_CONFIG.ENDPOINTS.LOGOUT);
    } catch (error) {
      console.error('Logout API error:', error);
    } finally {
      // Clear local storage
      await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.FCM_TOKEN);
    }
  }

  /**
   * Get current user profile
   */
  static async getProfile(): Promise<User> {
    const response = await apiClient.get<{ user: User }>(
      API_CONFIG.ENDPOINTS.PROFILE
    );
    return response.user;
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    return !!token;
  }

  /**
   * Get stored user data
   */
  static async getStoredUser(): Promise<User | null> {
    const userData = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
    return userData ? JSON.parse(userData) : null;
  }

  /**
   * Update stored user data
   */
  static async updateStoredUser(user: User): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
  }
}
