/**
 * Profile Screen
 */

import { View, StyleSheet, ScrollView, Alert, Linking, TouchableOpacity } from 'react-native';
import { Text, Switch, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/hooks';
import { COLORS, USER_STATUS } from '@/constants';
import { useAppTheme } from '@/store/ThemeContext';
import { useState, useEffect } from 'react';
import { AuthService } from '@/services/auth';
import { NotificationService } from '@/services/notification';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, differenceInDays } from 'date-fns';
import { id } from 'date-fns/locale';

interface ProfileData {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  expiredAt: string | null;
  balance: number;
  autoRenewal: boolean;
  profile: {
    name: string;
    downloadSpeed: number;
    uploadSpeed: number;
    price: number;
  } | null;
  createdAt: string;
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useAppTheme();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
    loadNotificationState();
  }, []);

  const loadNotificationState = async () => {
    try {
      const stored = await AsyncStorage.getItem('pushNotifEnabled');
      setPushEnabled(stored === 'true');
    } catch {
      setPushEnabled(false);
    }
  };

  const handleNotifToggle = async (value: boolean) => {
    setNotifLoading(true);
    try {
      if (value) {
        const token = await NotificationService.registerForPushNotifications();
        // On emulator token is null (expected), we still allow toggling the preference
        if (token || !token) {
          await AsyncStorage.setItem('pushNotifEnabled', 'true');
          setPushEnabled(true);
          if (!token) {
            console.log('ℹ️ Running on emulator — push token not available, preference saved');
          }
        }
      } else {
        await AsyncStorage.setItem('pushNotifEnabled', 'false');
        setPushEnabled(false);
      }
    } catch (error) {
      console.error('Notif toggle error:', error);
      Alert.alert('Gagal', 'Terjadi kesalahan saat mengubah pengaturan notifikasi.');
    } finally {
      setNotifLoading(false);
    }
  };

  const loadProfile = async () => {
    try {
      const data = await AuthService.getProfile();
      setProfileData(data as any);
    } catch (error) {
      console.error('Load profile error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysLeft = () => {
    if (!profileData?.expiredAt) return null;
    const daysLeft = differenceInDays(new Date(profileData.expiredAt), new Date());
    return daysLeft > 0 ? daysLeft : 0;
  };

  const handleContactSupport = () => {
    const adminPhone = '6281234567890'; // Update dengan nomor admin
    const message = `Halo, saya ${profileData?.name} (@${profileData?.username}) memerlukan bantuan`;
    const url = `https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url);
  };

  const handleLogout = () => {
    Alert.alert(
      'Keluar',
      'Apakah Anda yakin ingin keluar?',
      [
        { text: 'Batal', style: 'cancel' },
        { 
          text: 'Keluar', 
          style: 'destructive',
          onPress: () => logout()
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.neonCyan} />
      </View>
    );
  }

  const statusConfig = USER_STATUS[profileData?.status as keyof typeof USER_STATUS] || USER_STATUS.active;
  const daysLeft = getDaysLeft();

  return (
    <ScrollView style={styles.container}>
      {/* User Profile Header */}
      <View style={styles.headerCard}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <MaterialCommunityIcons 
              name="account-circle" 
              size={80} 
              color={COLORS.neonCyan} 
            />
          </View>
          <Text variant="headlineSmall" style={styles.nameText}>
            {profileData?.name}
          </Text>
          <Text variant="bodyMedium" style={styles.usernameText}>
            @{profileData?.username}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '20', borderColor: statusConfig.color }]}>
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>
      </View>

      {/* Package Info */}
      {profileData?.profile && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="package-variant" size={22} color={COLORS.neonViolet} />
            <Text variant="titleSmall" style={styles.sectionTitle}>Informasi Paket</Text>
          </View>
          <View style={styles.packageRow}>
            <Text variant="bodyMedium" style={styles.packageLabel}>Paket:</Text>
            <Text variant="bodyMedium" style={styles.packageValue}>{profileData.profile.name}</Text>
          </View>
          <View style={styles.packageRow}>
            <Text variant="bodyMedium" style={styles.packageLabel}>Kecepatan:</Text>
            <Text variant="bodyMedium" style={styles.packageValue}>
              {profileData.profile.downloadSpeed} Mbps / {profileData.profile.uploadSpeed} Mbps
            </Text>
          </View>
          {profileData.expiredAt && (
            <>
              <View style={styles.packageRow}>
                <Text variant="bodyMedium" style={styles.packageLabel}>Berlaku s/d:</Text>
                <Text variant="bodyMedium" style={styles.packageValue}>
                  {format(new Date(profileData.expiredAt), 'dd MMMM yyyy', { locale: id })}
                </Text>
              </View>
              {daysLeft !== null && (
                <View style={styles.packageRow}>
                  <Text variant="bodyMedium" style={styles.packageLabel}>Sisa waktu:</Text>
                  <Text 
                    variant="bodyMedium" 
                    style={[
                      styles.packageValue,
                      { color: daysLeft <= 7 ? COLORS.neonOrange : COLORS.neonGreen }
                    ]}
                  >
                    {daysLeft} hari
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Contact Info */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="card-account-details" size={22} color={COLORS.neonBlue} />
          <Text variant="titleSmall" style={styles.sectionTitle}>Informasi Kontak</Text>
        </View>
        <View style={styles.listItem}>
          <MaterialCommunityIcons name="email" size={20} color={COLORS.neonCyan} />
          <View style={styles.listItemText}>
            <Text style={styles.listItemTitle}>Email</Text>
            <Text style={styles.listItemDesc}>{profileData?.email || 'Belum diatur'}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.listItem}>
          <MaterialCommunityIcons name="phone" size={20} color={COLORS.neonCyan} />
          <View style={styles.listItemText}>
            <Text style={styles.listItemTitle}>No. Telepon</Text>
            <Text style={styles.listItemDesc}>{profileData?.phone || 'Belum diatur'}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.listItem}>
          <MaterialCommunityIcons name="calendar" size={20} color={COLORS.neonCyan} />
          <View style={styles.listItemText}>
            <Text style={styles.listItemTitle}>Bergabung sejak</Text>
            <Text style={styles.listItemDesc}>{profileData?.createdAt ? format(new Date(profileData.createdAt), 'dd MMMM yyyy', { locale: id }) : '-'}</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="lightning-bolt" size={22} color={COLORS.neonYellow} />
          <Text variant="titleSmall" style={styles.sectionTitle}>Aksi Cepat</Text>
        </View>
        <TouchableOpacity style={styles.listItem} onPress={() => router.push('/topup')}>
          <MaterialCommunityIcons name="cash-plus" size={20} color={COLORS.neonGreen} />
          <View style={styles.listItemText}>
            <Text style={styles.listItemTitle}>Isi Saldo</Text>
            <Text style={styles.listItemDesc}>Isi ulang saldo deposit</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.listItem} onPress={() => router.push('/upgrade')}>
          <MaterialCommunityIcons name="swap-horizontal-bold" size={20} color={COLORS.neonOrange} />
          <View style={styles.listItemText}>
            <Text style={styles.listItemTitle}>Ganti Paket</Text>
            <Text style={styles.listItemDesc}>Upgrade atau downgrade paket internet</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.listItem} onPress={() => router.push('/wifi')}>
          <MaterialCommunityIcons name="wifi-settings" size={20} color={COLORS.neonBlue} />
          <View style={styles.listItemText}>
            <Text style={styles.listItemTitle}>Pengaturan WiFi</Text>
            <Text style={styles.listItemDesc}>Ubah nama WiFi (SSID) & password</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.listItem} onPress={() => router.push('/tickets')}>
          <MaterialCommunityIcons name="ticket-outline" size={20} color={COLORS.neonViolet} />
          <View style={styles.listItemText}>
            <Text style={styles.listItemTitle}>Tiket Support</Text>
            <Text style={styles.listItemDesc}>Buat atau lihat tiket bantuan</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.listItem} onPress={() => router.push('/suspend')}>
          <MaterialCommunityIcons name="pause-circle-outline" size={20} color="#f59e0b" />
          <View style={styles.listItemText}>
            <Text style={styles.listItemTitle}>Suspend Sementara</Text>
            <Text style={styles.listItemDesc}>Ajukan jeda layanan internet sementara</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Settings */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="cog" size={22} color={COLORS.neonCyan} />
          <Text variant="titleSmall" style={styles.sectionTitle}>Pengaturan</Text>
        </View>
        <View style={styles.listItem}>
          <MaterialCommunityIcons name="bell" size={20} color={pushEnabled ? COLORS.neonCyan : COLORS.textSecondary} />
          <View style={styles.listItemText}>
            <Text style={styles.listItemTitle}>Notifikasi Push</Text>
            <Text style={styles.listItemDesc}>{pushEnabled ? 'Aktif — terima notifikasi tagihan & info' : 'Nonaktif'}</Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={handleNotifToggle}
            disabled={notifLoading}
            color={COLORS.neonCyan}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.listItem}>
          <MaterialCommunityIcons
            name={isDark ? 'weather-night' : 'white-balance-sunny'}
            size={20}
            color={isDark ? COLORS.neonViolet : COLORS.neonYellow}
          />
          <View style={styles.listItemText}>
            <Text style={styles.listItemTitle}>Tema Tampilan</Text>
            <Text style={styles.listItemDesc}>{isDark ? 'Mode Gelap Aktif' : 'Mode Terang Aktif'}</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            color={COLORS.neonViolet}
          />
        </View>
      </View>

      {/* Support */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="help-circle" size={22} color={COLORS.neonBlue} />
          <Text variant="titleSmall" style={styles.sectionTitle}>Bantuan</Text>
        </View>
        <TouchableOpacity style={styles.listItem} onPress={handleContactSupport}>
          <MaterialCommunityIcons name="whatsapp" size={20} color="#25D366" />
          <View style={styles.listItemText}>
            <Text style={styles.listItemTitle}>Hubungi Support</Text>
            <Text style={styles.listItemDesc}>WhatsApp Admin</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <View style={styles.listItem}>
          <MaterialCommunityIcons name="information-outline" size={20} color={COLORS.neonCyan} />
          <View style={styles.listItemText}>
            <Text style={styles.listItemTitle}>Tentang Aplikasi</Text>
            <Text style={styles.listItemDesc}>Versi 1.0.0</Text>
          </View>
        </View>
      </View>

      {/* Logout Button */}
      <View style={styles.logoutContainer}>
        <TouchableOpacity
          onPress={handleLogout}
          style={{ backgroundColor: COLORS.neonPink, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <MaterialCommunityIcons name="logout" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Keluar</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bgDark,
  },
  headerCard: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  avatarContainer: {
    marginBottom: 12,
  },
  nameText: {
    fontWeight: 'bold',
    marginBottom: 4,
    color: COLORS.textPrimary,
  },
  usernameText: {
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  listItemText: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  listItemDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  packageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  packageLabel: {
    color: COLORS.textSecondary,
  },
  packageValue: {
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  logoutContainer: {
    padding: 16,
    marginBottom: 32,
  },
});
