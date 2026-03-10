/**
 * Tabs Layout — Neon Cyberpunk Theme
 * Main navigation with bottom tabs
 */

import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants';
import { useAppTheme } from '@/store/ThemeContext';

export default function TabsLayout() {
  const { themeColors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.neonCyan,
        tabBarInactiveTintColor: themeColors.textSecondary,
        tabBarStyle: {
          backgroundColor: themeColors.bgCard,
          borderTopColor: themeColors.border,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: themeColors.bgCard,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: themeColors.border,
        },
        headerTintColor: COLORS.neonCyan,
        headerTitleStyle: {
          color: themeColors.textPrimary,
          fontWeight: 'bold',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: 'Tagihan',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="file-document" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: 'Pembayaran',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cash-multiple" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="wifi"
        options={{
          title: 'WiFi',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="wifi-settings" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
