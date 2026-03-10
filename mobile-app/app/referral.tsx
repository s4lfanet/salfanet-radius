/**
 * Referral Screen
 * Customer dapat lihat kode referral, statistik, dan riwayat hadiah
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Share,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { Stack } from 'expo-router';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants';
import { apiClient } from '@/services/api';

interface ReferralData {
  code: string | null;
  shareUrl: string | null;
  referredBy: { id: string; name: string } | null;
  stats: {
    totalReferred: number;
    totalRewardsCredited: number;
    totalRewardsCount: number;
    pendingRewardsAmount: number;
    pendingRewardsCount: number;
  };
  recentReferrals: Array<{
    id: string;
    name: string;
    createdAt: string;
  }>;
}

interface ReferralConfig {
  enabled: boolean;
  rewardAmount: number;
  rewardType: string;
  rewardBoth: boolean;
  referredAmount: number;
}

interface RewardItem {
  id: string;
  amount: number;
  status: string;
  type: string;
  creditedAt: string | null;
  createdAt: string;
  referred: {
    id: string;
    name: string;
    createdAt: string;
  };
}

export default function ReferralScreen() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [config, setConfig] = useState<ReferralConfig | null>(null);
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'rewards'>('overview');

  const loadData = useCallback(async () => {
    try {
      const [referralRes, rewardRes] = await Promise.all([
        apiClient.get('/api/customer/referral'),
        apiClient.get('/api/customer/referral/rewards'),
      ]);
      if (referralRes.success) {
        setReferral(referralRes.referral);
        setConfig(referralRes.config);
      }
      if (rewardRes.success) {
        setRewards(rewardRes.rewards);
      }
    } catch (error) {
      console.error('[Referral] Load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleGenerateCode = async () => {
    setGenerating(true);
    try {
      const res = await apiClient.post('/api/customer/referral');
      if (res.success) {
        await loadData();
        Alert.alert('Berhasil', 'Kode referral berhasil dibuat!');
      } else {
        Alert.alert('Gagal', res.error || 'Gagal membuat kode referral');
      }
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.error || 'Terjadi kesalahan');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCode = () => {
    if (!referral?.code) return;
    Clipboard.setString(referral.code);
    Alert.alert('Tersalin!', `Kode referral ${referral.code} berhasil disalin`);
  };

  const handleShare = async () => {
    if (!referral?.shareUrl) return;
    try {
      await Share.share({
        message: `Daftar layanan internet dengan kode referral saya: ${referral.code}\n${referral.shareUrl}`,
        url: referral.shareUrl,
        title: 'Bagikan Kode Referral',
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number) =>
    `Rp ${amount.toLocaleString('id-ID')}`;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Referral', headerStyle: { backgroundColor: COLORS.bgCard }, headerTintColor: COLORS.neonCyan }} />
        <ActivityIndicator size="large" color={COLORS.neonCyan} />
        <Text style={styles.loadingText}>Memuat data referral...</Text>
      </View>
    );
  }

  if (!config?.enabled) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Referral', headerStyle: { backgroundColor: COLORS.bgCard }, headerTintColor: COLORS.neonCyan }} />
        <MaterialCommunityIcons name="gift-off" size={64} color={COLORS.textSecondary} />
        <Text style={[styles.loadingText, { marginTop: 12 }]}>Program referral belum aktif</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.neonCyan} />}
    >
      <Stack.Screen options={{ title: 'Referral', headerStyle: { backgroundColor: COLORS.bgCard }, headerTintColor: COLORS.neonCyan }} />

      {/* Header Banner */}
      <View style={styles.banner}>
        <MaterialCommunityIcons name="gift" size={36} color={COLORS.neonCyan} />
        <Text style={styles.bannerTitle}>Program Referral</Text>
        <Text style={styles.bannerSub}>
          Ajak teman daftar, dapatkan hadiah {formatCurrency(config.rewardAmount)}
          {config.rewardBoth ? ` + teman ${formatCurrency(config.referredAmount)}` : ''}
        </Text>
      </View>

      {/* Referral Code Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialCommunityIcons name="ticket-percent" size={20} color={COLORS.neonCyan} />
          <Text style={styles.cardTitle}>Kode Referral Anda</Text>
        </View>

        {referral?.code ? (
          <>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{referral.code}</Text>
            </View>
            <View style={styles.codeActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleCopyCode}>
                <MaterialCommunityIcons name="content-copy" size={18} color={COLORS.neonCyan} />
                <Text style={styles.actionBtnText}>Salin</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: COLORS.neonViolet }]} onPress={handleShare}>
                <MaterialCommunityIcons name="share-variant" size={18} color={COLORS.neonViolet} />
                <Text style={[styles.actionBtnText, { color: COLORS.neonViolet }]}>Bagikan</Text>
              </TouchableOpacity>
            </View>
            {referral.shareUrl && (
              <Text style={styles.shareUrl} numberOfLines={2}>{referral.shareUrl}</Text>
            )}
          </>
        ) : (
          <View style={styles.noCode}>
            <Text style={styles.noCodeText}>Belum memiliki kode referral</Text>
            <TouchableOpacity
              style={[styles.generateBtn, generating && styles.btnDisabled]}
              onPress={handleGenerateCode}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color={COLORS.bgDark} />
              ) : (
                <MaterialCommunityIcons name="plus-circle" size={18} color={COLORS.bgDark} />
              )}
              <Text style={styles.generateBtnText}>
                {generating ? 'Membuat...' : 'Buat Kode Referral'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {referral?.referredBy && (
          <View style={styles.referredByBox}>
            <MaterialCommunityIcons name="account-check" size={16} color={COLORS.neonGreen} />
            <Text style={styles.referredByText}>
              Anda didaftarkan oleh: {referral.referredBy.name}
            </Text>
          </View>
        )}
      </View>

      {/* Stats Card */}
      {referral?.stats && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="chart-bar" size={20} color={COLORS.neonCyan} />
            <Text style={styles.cardTitle}>Statistik</Text>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{referral.stats.totalReferred}</Text>
              <Text style={styles.statLabel}>Teman Diajak</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: COLORS.neonGreen }]}>
                {formatCurrency(referral.stats.totalRewardsCredited)}
              </Text>
              <Text style={styles.statLabel}>Total Hadiah</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: COLORS.neonOrange }]}>
                {formatCurrency(referral.stats.pendingRewardsAmount)}
              </Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
            Teman Diajak
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rewards' && styles.tabActive]}
          onPress={() => setActiveTab('rewards')}
        >
          <Text style={[styles.tabText, activeTab === 'rewards' && styles.tabTextActive]}>
            Riwayat Hadiah
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab === 'overview' ? (
        <View style={styles.card}>
          {referral?.recentReferrals && referral.recentReferrals.length > 0 ? (
            referral.recentReferrals.map((r) => (
              <View key={r.id} style={styles.listItem}>
                <MaterialCommunityIcons name="account" size={20} color={COLORS.neonCyan} />
                <View style={styles.listItemInfo}>
                  <Text style={styles.listItemName}>{r.name}</Text>
                  <Text style={styles.listItemDate}>Daftar: {formatDate(r.createdAt)}</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="account-group" size={40} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>Belum ada teman yang didaftarkan</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          {rewards.length > 0 ? (
            rewards.map((r) => (
              <View key={r.id} style={styles.listItem}>
                <MaterialCommunityIcons
                  name={r.status === 'CREDITED' ? 'check-circle' : 'clock-outline'}
                  size={20}
                  color={r.status === 'CREDITED' ? COLORS.neonGreen : COLORS.neonOrange}
                />
                <View style={styles.listItemInfo}>
                  <Text style={styles.listItemName}>{formatCurrency(r.amount)}</Text>
                  <Text style={styles.listItemDate}>
                    {r.referred?.name} • {formatDate(r.createdAt)}
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: r.status === 'CREDITED' ? COLORS.neonGreen + '20' : COLORS.neonOrange + '20' }
                ]}>
                  <Text style={[
                    styles.statusText,
                    { color: r.status === 'CREDITED' ? COLORS.neonGreen : COLORS.neonOrange }
                  ]}>
                    {r.status === 'CREDITED' ? 'Diterima' : 'Pending'}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="gift-outline" size={40} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>Belum ada riwayat hadiah</Text>
            </View>
          )}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  banner: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.neonCyan + '40',
  },
  bannerTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 8,
  },
  bannerSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  codeBox: {
    backgroundColor: COLORS.bgDark,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.neonCyan + '60',
    marginBottom: 12,
  },
  codeText: {
    color: COLORS.neonCyan,
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.neonCyan,
  },
  actionBtnText: {
    color: COLORS.neonCyan,
    fontWeight: 'bold',
    fontSize: 13,
  },
  shareUrl: {
    color: COLORS.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  noCode: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  noCodeText: {
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.neonCyan,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    color: COLORS.bgDark,
    fontWeight: 'bold',
    fontSize: 14,
  },
  referredByBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  referredByText: {
    color: COLORS.neonGreen,
    fontSize: 13,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: COLORS.neonCyan,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: COLORS.bgCard,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: COLORS.neonCyan + '20',
  },
  tabText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: COLORS.neonCyan,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  listItemInfo: {
    flex: 1,
  },
  listItemName: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  listItemDate: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    color: COLORS.textSecondary,
    marginTop: 8,
    fontSize: 13,
  },
});
