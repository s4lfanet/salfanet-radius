/**
 * Dashboard Screen (Home) — Neon Cyberpunk Theme
 */

import { View, StyleSheet, ScrollView, RefreshControl, Linking, Alert } from 'react-native';
import { Card, Text, Button, ActivityIndicator, Chip, Switch } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useDashboard, useAuth } from '@/hooks';
import { useState } from 'react';
import { COLORS, USER_STATUS } from '@/constants';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { DashboardService } from '@/services/dashboard';

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching, error } = useDashboard();
  const [autoRenewalEnabled, setAutoRenewalEnabled] = useState(false);
  const [togglingRenewal, setTogglingRenewal] = useState(false);

  // Initialize auto-renewal state
  useState(() => {
    if (data?.user) {
      setAutoRenewalEnabled(data.user.autoRenewal);
    }
  });

  const handleToggleAutoRenewal = async (value: boolean) => {
    setTogglingRenewal(true);
    try {
      const result = await DashboardService.toggleAutoRenewal(value);
      if (result.success) {
        setAutoRenewalEnabled(value);
        Alert.alert('Sukses', result.message);
        refetch();
      }
    } catch (error) {
      Alert.alert('Error', 'Gagal mengubah pengaturan auto-renewal');
      console.error('Toggle auto-renewal error:', error);
    } finally {
      setTogglingRenewal(false);
    }
  };

  const handleTopUp = () => {
    router.push('/topup');
  };

  const handleTopUpRequest = () => {
    router.push('/topup-request');
  };

  const handleWhatsApp = (message: string) => {
    const adminPhone = '6281234567890';
    const url = `https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url);
  };

  const handleUpgradePackage = () => {
    router.push('/upgrade');
  };

  const handleReferral = () => {
    router.push('/referral');
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.neonCyan} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.loadingContainer}>
        <MaterialCommunityIcons name="alert-circle" size={48} color={COLORS.error} />
        <Text variant="titleMedium" style={styles.errorText}>
          Gagal memuat data
        </Text>
        <Button mode="contained" onPress={() => refetch()} style={styles.retryButton} buttonColor={COLORS.neonCyan} textColor={COLORS.bgDark}>
          Coba Lagi
        </Button>
      </View>
    );
  }

  const statusConfig = USER_STATUS[data?.user?.status as keyof typeof USER_STATUS] || USER_STATUS.active;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.neonCyan} />
      }
    >
      {/* User Info Card */}
      <View style={styles.card}>
        <View style={styles.cardInner}>
          <View style={styles.userHeader}>
            <View style={styles.userInfo}>
              <Text variant="headlineSmall" style={styles.userName}>
                {data?.user.name}
              </Text>
              <Text variant="bodyMedium" style={styles.username}>
                @{data?.user.username}
              </Text>
            </View>
            <View style={[styles.statusBadge, { borderColor: statusConfig.color, backgroundColor: statusConfig.color + '20' }]}>
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="package-variant" size={20} color={COLORS.neonCyan} />
            <Text variant="bodyMedium" style={styles.infoText}>
              Paket: {data?.user.profileName}
            </Text>
          </View>

          {data?.user.expiredAt && (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="calendar" size={20} color={COLORS.neonViolet} />
              <Text variant="bodyMedium" style={styles.infoText}>
                Berlaku s/d: {format(new Date(data.user.expiredAt), 'dd MMMM yyyy', { locale: id })}
              </Text>
            </View>
          )}

          {(data?.user.balance ?? 0) > 0 && (
            <View style={styles.infoRow}>
              <MaterialCommunityIcons name="wallet" size={20} color={COLORS.neonGreen} />
              <Text variant="bodyMedium" style={[styles.infoText, { color: COLORS.neonGreen }]}>
                Saldo: Rp {data.user.balance.toLocaleString('id-ID')}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Balance & Auto-Renewal Card */}
      <View style={styles.card}>
        <View style={styles.cardInner}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="wallet" size={22} color={COLORS.neonCyan} />
            <Text style={styles.cardTitle}>Saldo & Perpanjangan</Text>
          </View>

          {/* Balance Display */}
          <View style={styles.balanceContainer}>
            <Text variant="bodySmall" style={styles.balanceLabel}>
              Saldo Deposit
            </Text>
            <Text variant="headlineMedium" style={styles.balanceAmount}>
              Rp {(data?.user.balance || 0).toLocaleString('id-ID')}
            </Text>
            
            {((data?.user.balance || 0) < (data?.user.packagePrice || 0)) && (
              <View style={styles.warningBox}>
                <MaterialCommunityIcons name="alert-circle" size={16} color={COLORS.neonOrange} />
                <Text variant="bodySmall" style={styles.warningText}>
                  Saldo tidak cukup untuk perpanjangan otomatis! Minimal Rp {(data?.user.packagePrice || 0).toLocaleString('id-ID')}
                </Text>
              </View>
            )}
          </View>

          {/* Auto-Renewal Toggle */}
          <View style={styles.renewalRow}>
            <View style={styles.renewalInfo}>
              <Text variant="bodyMedium" style={styles.renewalLabel}>
                Perpanjangan Otomatis
              </Text>
              <Text variant="bodySmall" style={styles.renewalDesc}>
                Paket akan otomatis diperpanjang saat expired
              </Text>
            </View>
            <Switch
              value={autoRenewalEnabled}
              onValueChange={handleToggleAutoRenewal}
              disabled={togglingRenewal}
              color={COLORS.neonCyan}
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <Button
              mode="contained"
              icon="cash-plus"
              onPress={handleTopUp}
              style={styles.topUpButton}
              contentStyle={styles.buttonContent}
              buttonColor={COLORS.neonCyan}
              textColor={COLORS.bgDark}
              labelStyle={{ fontWeight: 'bold' }}
            >
              Isi Saldo
            </Button>
            <Button
              mode="outlined"
              icon="swap-horizontal-bold"
              onPress={handleUpgradePackage}
              style={styles.upgradeButton}
              contentStyle={styles.buttonContent}
              textColor={COLORS.neonViolet}
            >
              Ganti Paket
            </Button>
            <Button
              mode="outlined"
              icon="bank-transfer"
              onPress={handleTopUpRequest}
              style={styles.upgradeButton}
              contentStyle={styles.buttonContent}
              textColor={COLORS.neonGreen}
            >
              Transfer Manual
            </Button>
            <Button
              mode="outlined"
              icon="gift"
              onPress={handleReferral}
              style={styles.upgradeButton}
              contentStyle={styles.buttonContent}
              textColor={COLORS.neonOrange}
            >
              Referral
            </Button>
          </View>
        </View>
      </View>

      {/* Session Status Card */}
      <View style={styles.card}>
        <View style={styles.cardInner}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="wifi" size={22} color={COLORS.neonCyan} />
            <Text style={styles.cardTitle}>Status Koneksi</Text>
          </View>
          <View style={styles.sessionRow}>
            <View style={[
              styles.sessionDot,
              { backgroundColor: data?.session.isOnline ? COLORS.neonGreen : COLORS.textSecondary,
                shadowColor: data?.session.isOnline ? COLORS.neonGreen : 'transparent',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 6,
                elevation: data?.session.isOnline ? 4 : 0 }
            ]} />
            <Text variant="bodyLarge" style={{ color: data?.session.isOnline ? COLORS.neonGreen : COLORS.textSecondary }}>
              {data?.session.isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
          
          {data?.session.isOnline && data?.session.ipAddress && (
            <Text variant="bodyMedium" style={styles.ipAddress}>
              IP: {data.session.ipAddress}
            </Text>
          )}
        </View>
      </View>

      {/* Usage Card */}
      <View style={styles.card}>
        <View style={styles.cardInner}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="chart-bar" size={22} color={COLORS.neonCyan} />
            <Text style={styles.cardTitle}>Penggunaan Data</Text>
          </View>
          <View style={styles.usageRow}>
            <View style={styles.usageItem}>
              <MaterialCommunityIcons name="upload" size={24} color={COLORS.neonBlue} />
              <Text variant="bodySmall" style={styles.usageLabel}>
                Upload
              </Text>
              <Text variant="titleMedium" style={styles.usageValue}>
                {formatBytes(data?.usage.upload || 0)}
              </Text>
            </View>

            <View style={styles.usageItem}>
              <MaterialCommunityIcons name="download" size={24} color={COLORS.neonGreen} />
              <Text variant="bodySmall" style={styles.usageLabel}>
                Download
              </Text>
              <Text variant="titleMedium" style={styles.usageValue}>
                {formatBytes(data?.usage.download || 0)}
              </Text>
            </View>

            <View style={styles.usageItem}>
              <MaterialCommunityIcons name="sigma" size={24} color={COLORS.neonViolet} />
              <Text variant="bodySmall" style={styles.usageLabel}>
                Total
              </Text>
              <Text variant="titleMedium" style={styles.usageValue}>
                {formatBytes(data?.usage.total || 0)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Invoice Summary Card */}
      <View style={[styles.card, { marginBottom: 24 }]}>
        <View style={styles.cardInner}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="file-document" size={22} color={COLORS.neonCyan} />
            <Text style={styles.cardTitle}>Ringkasan Tagihan</Text>
          </View>
          {data?.invoice && data.invoice.unpaidCount > 0 ? (
            <>
              <View style={styles.invoiceRow}>
                <Text variant="bodyMedium" style={{ color: COLORS.textSecondary }}>Tagihan Belum Bayar:</Text>
                <Text variant="bodyMedium" style={styles.invoiceCount}>
                  {data.invoice.unpaidCount} tagihan
                </Text>
              </View>
              <View style={styles.invoiceRow}>
                <Text variant="bodyMedium" style={{ color: COLORS.textSecondary }}>Total:</Text>
                <Text variant="titleMedium" style={styles.invoiceTotal}>
                  Rp {data.invoice.totalUnpaid?.toLocaleString('id-ID') || '0'}
                </Text>
              </View>
              {data.invoice.nextDueDate && (
                <Text variant="bodySmall" style={styles.dueDate}>
                  Jatuh tempo: {format(new Date(data.invoice.nextDueDate), 'dd MMM yyyy', { locale: id })}
                </Text>
              )}
            </>
          ) : (
            <View style={styles.noInvoice}>
              <MaterialCommunityIcons name="check-circle" size={48} color={COLORS.neonGreen} />
              <Text variant="bodyLarge" style={styles.noInvoiceText}>
                Tidak ada tagihan
              </Text>
            </View>
          )}
        </View>
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
  errorText: {
    marginTop: 16,
    marginBottom: 16,
    color: COLORS.error,
  },
  retryButton: {
    marginTop: 8,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardInner: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  username: {
    color: COLORS.neonCyan,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  infoText: {
    color: COLORS.textPrimary,
  },
  balanceContainer: {
    marginBottom: 16,
  },
  balanceLabel: {
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  balanceAmount: {
    fontWeight: 'bold',
    color: COLORS.neonCyan,
    marginBottom: 8,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.neonOrange + '15',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.neonOrange,
    gap: 8,
  },
  warningText: {
    flex: 1,
    color: COLORS.neonOrange,
  },
  renewalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginBottom: 16,
  },
  renewalInfo: {
    flex: 1,
    marginRight: 12,
  },
  renewalLabel: {
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  renewalDesc: {
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  topUpButton: {
    flex: 1,
    borderRadius: 10,
  },
  upgradeButton: {
    flex: 1,
    borderRadius: 10,
    borderColor: COLORS.neonViolet,
  },
  buttonContent: {
    paddingVertical: 4,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  ipAddress: {
    marginTop: 8,
    color: COLORS.textSecondary,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  usageItem: {
    alignItems: 'center',
  },
  usageLabel: {
    marginTop: 4,
    color: COLORS.textSecondary,
  },
  usageValue: {
    marginTop: 4,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  invoiceCount: {
    fontWeight: 'bold',
    color: COLORS.neonYellow,
  },
  invoiceTotal: {
    fontWeight: 'bold',
    color: COLORS.neonPink,
  },
  dueDate: {
    marginTop: 8,
    color: COLORS.textSecondary,
  },
  noInvoice: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  noInvoiceText: {
    marginTop: 8,
    color: COLORS.neonGreen,
  },
});
