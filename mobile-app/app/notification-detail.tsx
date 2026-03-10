/**
 * Notification Detail Screen
 * Shows full notification content when user taps a push notification
 */

import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Linking,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Text, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';

const NOTIF_TYPE_CONFIG: Record<string, { icon: string; label: string; gradient: string[] }> = {
  'invoice-reminder': {
    icon: 'file-document-alert',
    label: 'Pengingat Tagihan',
    gradient: [COLORS.neonYellow, COLORS.neonOrange],
  },
  'invoice-overdue': {
    icon: 'alert-circle',
    label: 'Tagihan Jatuh Tempo',
    gradient: [COLORS.neonPink, COLORS.error],
  },
  'payment-success': {
    icon: 'check-circle',
    label: 'Pembayaran Berhasil',
    gradient: [COLORS.neonCyan, COLORS.neonGreen],
  },
  'auto-renewal-success': {
    icon: 'autorenew',
    label: 'Perpanjangan Otomatis',
    gradient: [COLORS.neonCyan, COLORS.neonBlue],
  },
  'isolation-notice': {
    icon: 'wifi-off',
    label: 'Notifikasi Isolir',
    gradient: [COLORS.neonOrange, COLORS.neonPink],
  },
  broadcast: {
    icon: 'bullhorn',
    label: 'Pengumuman',
    gradient: [COLORS.neonBlue, COLORS.neonViolet],
  },
  info: {
    icon: 'information',
    label: 'Informasi',
    gradient: [COLORS.neonCyan, COLORS.neonBlue],
  },
  default: {
    icon: 'bell',
    label: 'Notifikasi',
    gradient: [COLORS.neonBlue, COLORS.neonViolet],
  },
};

export default function NotificationDetailScreen() {
  const params = useLocalSearchParams();
  const title = (params.title as string) || 'Notifikasi';
  const body = (params.body as string) || '';
  const type = (params.type as string) || 'default';
  const link = params.link as string | undefined;
  const timestamp = params.timestamp as string | undefined;
  const invoiceNumber = params.invoiceNumber as string | undefined;
  const amount = params.amount as string | undefined;
  const dueDate = params.dueDate as string | undefined;
  const customerName = params.customerName as string | undefined;
  const profileName = params.profileName as string | undefined;

  const config = NOTIF_TYPE_CONFIG[type] || NOTIF_TYPE_CONFIG.default;

  const handleAction = () => {
    if (link) {
      if (link.startsWith('http')) {
        Linking.openURL(link);
      } else {
        router.push(link as any);
      }
    }
  };

  const getActionLabel = () => {
    switch (type) {
      case 'invoice-reminder':
      case 'invoice-overdue':
        return 'Lihat Tagihan';
      case 'payment-success':
        return 'Lihat Pembayaran';
      case 'auto-renewal-success':
        return 'Lihat Dashboard';
      case 'isolation-notice':
        return 'Lihat Tagihan';
      default:
        return 'Buka';
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Detail Notifikasi',
          headerStyle: { backgroundColor: COLORS.bgDark },
          headerTintColor: COLORS.neonCyan,
          headerTitleStyle: { color: COLORS.textPrimary },
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header with gradient */}
        <LinearGradient
          colors={config.gradient as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name={config.icon as any} size={40} color="#fff" />
          </View>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{config.label}</Text>
          </View>
        </LinearGradient>

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.titleText}>{title}</Text>
          {timestamp && (
            <View style={styles.timeRow}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.timeText}>
                {(() => {
                  try {
                    return format(new Date(timestamp), "dd MMMM yyyy, HH:mm", { locale: id });
                  } catch {
                    return timestamp;
                  }
                })()}
              </Text>
            </View>
          )}
        </View>

        {/* Structured Data (for invoice/payment notifications) */}
        {(invoiceNumber || amount || dueDate || profileName) && (
          <View style={styles.dataCard}>
            {customerName && (
              <View style={styles.dataRow}>
                <MaterialCommunityIcons name="account" size={18} color={COLORS.neonCyan} />
                <Text style={styles.dataLabel}>Pelanggan</Text>
                <Text style={styles.dataValue}>{customerName}</Text>
              </View>
            )}
            {invoiceNumber && (
              <View style={styles.dataRow}>
                <MaterialCommunityIcons name="file-document" size={18} color={COLORS.neonCyan} />
                <Text style={styles.dataLabel}>No. Invoice</Text>
                <Text style={styles.dataValue}>{invoiceNumber}</Text>
              </View>
            )}
            {profileName && (
              <View style={styles.dataRow}>
                <MaterialCommunityIcons name="package-variant" size={18} color={COLORS.neonCyan} />
                <Text style={styles.dataLabel}>Paket</Text>
                <Text style={styles.dataValue}>{profileName}</Text>
              </View>
            )}
            {amount && (
              <View style={styles.dataRow}>
                <MaterialCommunityIcons name="cash" size={18} color={COLORS.neonGreen} />
                <Text style={styles.dataLabel}>Jumlah</Text>
                <Text style={[styles.dataValue, styles.amountText]}>
                  Rp {parseInt(amount).toLocaleString('id-ID')}
                </Text>
              </View>
            )}
            {dueDate && (
              <View style={styles.dataRow}>
                <MaterialCommunityIcons name="calendar-alert" size={18} color={COLORS.neonOrange} />
                <Text style={styles.dataLabel}>Jatuh Tempo</Text>
                <Text style={styles.dataValue}>
                  {(() => {
                    try {
                      return format(new Date(dueDate), 'dd MMMM yyyy', { locale: id });
                    } catch {
                      return dueDate;
                    }
                  })()}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Body / Message */}
        <View style={styles.bodyCard}>
          <Text style={styles.bodyText}>{body}</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          {link && (
            <Button
              mode="contained"
              onPress={handleAction}
              icon="arrow-right"
              contentStyle={styles.actionBtnContent}
              style={styles.actionBtn}
              labelStyle={styles.actionBtnLabel}
            >
              {getActionLabel()}
            </Button>
          )}
          <Button
            mode="outlined"
            onPress={() => router.back()}
            icon="arrow-left"
            contentStyle={styles.actionBtnContent}
            style={styles.backBtn}
            labelStyle={styles.backBtnLabel}
            textColor={COLORS.neonCyan}
          >
            Kembali
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
  },
  content: {
    paddingBottom: 40,
  },
  headerGradient: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  typeBadge: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  titleSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  titleText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  dataCard: {
    margin: 16,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  dataLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  dataValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  amountText: {
    color: COLORS.neonGreen,
  },
  bodyCard: {
    margin: 16,
    marginTop: 0,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
    color: COLORS.textPrimary,
  },
  actions: {
    padding: 16,
    gap: 12,
  },
  actionBtn: {
    backgroundColor: COLORS.neonCyan,
    borderRadius: 12,
  },
  actionBtnContent: {
    paddingVertical: 8,
    flexDirection: 'row-reverse',
  },
  actionBtnLabel: {
    color: COLORS.bgDark,
    fontWeight: 'bold',
  },
  backBtn: {
    borderColor: COLORS.neonCyan,
    borderRadius: 12,
  },
  backBtnLabel: {
    color: COLORS.neonCyan,
  },
});
