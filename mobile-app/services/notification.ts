/**
 * Push Notification Service
 * Now supports both Expo Go (limited) and Development Build (full)
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { apiClient } from './api';
import { API_CONFIG } from '@/constants';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationData {
  id: string;
  title: string;
  body: string;
  type: string;
  link?: string;
  createdAt: string;
}

export class NotificationService {
  static getNotifications(page: number, arg1: number): any {
    throw new Error('Method not implemented.');
  }
  
  /**
   * Register for push notifications and get Expo Push Token
   */
  static async registerForPushNotifications(): Promise<string | null> {
    try {
      // Check if running on physical device
      if (!Device.isDevice) {
        console.log('⚠️ Push notifications only work on physical devices');
        return null;
      }

      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permission if not granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('❌ Failed to get push notification permissions');
        return null;
      }

      // Get native FCM device token (works on release build with google-services.json)
      let token: string | null = null;
      try {
        const deviceTokenData = await Notifications.getDevicePushTokenAsync();
        token = deviceTokenData.data;
        console.log('✅ Native FCM Token:', token?.substring(0, 30) + '...');
      } catch (fcmError) {
        // Fallback ke Expo push token jika native gagal
        console.warn('⚠️ Native token failed, trying Expo push token:', fcmError);
        try {
          const projectId = Constants.expoConfig?.extra?.eas?.projectId;
          if (projectId) {
            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            token = tokenData.data;
            console.log('✅ Expo Push Token (fallback):', token);
          }
        } catch (expoError) {
          console.error('❌ Both token methods failed:', expoError);
          return null;
        }
      }

      if (!token) return null;

      // Register token with backend
      await NotificationService.registerTokenWithBackend(token);

      return token;
    } catch (error: any) {
      // Handle Firebase not initialized error gracefully
      if (error?.message?.includes('FirebaseApp is not initialized')) {
        console.warn('⚠️ Firebase not configured - push notifications disabled');
        return null;
      }
      console.error('Error registering for push notifications:', error);
      return null;
    }
  }

  /**
   * Register token with backend server
   */
  static async registerTokenWithBackend(token: string): Promise<void> {
    try {
      await apiClient.post(API_CONFIG.ENDPOINTS.REGISTER_FCM, {
        token,
        platform: Platform.OS,
        deviceInfo: {
          brand: Device.brand,
          modelName: Device.modelName,
          osVersion: Device.osVersion,
        },
      });
      console.log('✅ Token registered with backend');
    } catch (error) {
      console.error('Failed to register token with backend:', error);
    }
  }

  /**
   * Setup notification listeners
   */
  static setupNotificationListeners(
    onNotificationReceived?: (notification: Notifications.Notification) => void,
    onNotificationTapped?: (response: Notifications.NotificationResponse) => void
  ): () => void {
    // Listener for notifications received while app is in foreground
    const receivedListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('📬 Notification received:', notification);
        onNotificationReceived?.(notification);
      }
    );

    // Listener for notification tap/interaction
    const responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('👆 Notification tapped:', response);
        onNotificationTapped?.(response);
      }
    );

    // Return cleanup function
    return () => {
      receivedListener.remove();
      responseListener.remove();
    };
  }

  /**
   * Schedule a local notification (for testing)
   */
  static async scheduleLocalNotification(data: NotificationData): Promise<string> {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: data.title,
          body: data.body,
          data: { type: data.type, link: data.link },
          sound: true,
        },
        trigger: null, // Show immediately
      });

      return id;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      throw error;
    }
  }

  /**
   * Get notification history
   * Returns empty array in Expo Go
   */
  static async getNotificationHistory(): Promise<NotificationData[]> {
    return [];
  }

  /**
   * Clear all notifications
   */
  static async clearAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  /**
   * Get badge count
   */
  static async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  }

  /**
   * Set badge count
   */
  static async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  /**
   * Clear badge
   */
  static async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }
}

