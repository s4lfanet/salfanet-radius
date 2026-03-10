import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  ActivityIndicator as RNActivityIndicator,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Text, RadioButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants';
import { AuthService } from '@/services/auth';
import { PackageService, Package } from '@/services/package';

export default function UpgradePackageScreen() {
  const [currentPackage, setCurrentPackage] = useState<any>(null);
  const [currentProfileId, setCurrentProfileId] = useState<string>('');
  const [availablePackages, setAvailablePackages] = useState<Package[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const profile = await AuthService.getProfile();
      setCurrentPackage(profile);
      setCurrentProfileId(profile.profileId || '');

      // Fetch all packages — show ALL, customer bebas pilih
      const allPackages = await PackageService.getPackages();
      setAvailablePackages(allPackages);
    } catch (error) {
      console.error('Load data error:', error);
      Alert.alert('Error', 'Gagal memuat data paket. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const getPackageLabel = (pkg: Package): 'current' | 'upgrade' | 'downgrade' => {
    if (pkg.id === currentProfileId) return 'current';
    if (pkg.price > (currentPackage?.price || 0)) return 'upgrade';
    return 'downgrade';
  };

  const handleSubmit = async () => {
    if (!selectedPackage) {
      Alert.alert('Error', 'Pilih paket terlebih dahulu');
      return;
    }

    const selectedPkg = availablePackages.find((p) => p.id === selectedPackage);
    if (!selectedPkg) return;

    const isUpgrade = selectedPkg.price > (currentPackage?.price || 0);
    const isDowngrade = selectedPkg.price < (currentPackage?.price || 0);
    const priceDiff = selectedPkg.price - (currentPackage?.price || 0);

    const actionLabel = isUpgrade ? 'Upgrade' : isDowngrade ? 'Downgrade' : 'Ganti';
    const diffText = isUpgrade
      ? `Biaya tambahan: Rp ${priceDiff.toLocaleString('id-ID')}`
      : isDowngrade
      ? `Penghematan: Rp ${Math.abs(priceDiff).toLocaleString('id-ID')}/bulan`
      : '';

    Alert.alert(
      `Konfirmasi ${actionLabel} Paket`,
      `${actionLabel} ke paket ${selectedPkg.name}?\n\nHarga: Rp ${selectedPkg.price.toLocaleString('id-ID')}/bulan\n${diffText}\n\nSistem akan membuat invoice. Paket akan aktif otomatis setelah pembayaran terverifikasi.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Buat Invoice',
          onPress: () => processChange(selectedPkg),
        },
      ]
    );
  };

  const processChange = async (pkg: Package) => {
    setSubmitting(true);
    try {
      const result = await PackageService.requestUpgrade(pkg.id);

      Alert.alert(
        'Invoice Dibuat',
        `Invoice untuk ganti ke paket ${pkg.name} telah dibuat.\n\nNomor Invoice: ${result.invoice?.invoiceNumber}\nTotal: Rp ${result.invoice?.amount.toLocaleString('id-ID')}\n\nPaket aktif otomatis setelah pembayaran terkonfirmasi.`,
        [
          {
            text: 'Lihat Invoice',
            onPress: () => router.replace('/(tabs)/invoices'),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Terjadi kesalahan saat membuat permintaan');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Ganti Paket' }} />
        <RNActivityIndicator size="large" color={COLORS.neonCyan} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: 'Ganti Paket' }} />

      {/* Current Package */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <MaterialCommunityIcons name="package" size={22} color={COLORS.neonCyan} />
          <Text variant="titleSmall" style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>Paket Saat Ini</Text>
        </View>
        <View style={styles.currentPackageBox}>
            <Text variant="titleLarge" style={styles.currentPackageName}>
              {currentPackage?.name || 'N/A'}
            </Text>
            <Text variant="bodyMedium" style={styles.currentPackageSpeed}>
              Paket Aktif
            </Text>
            <Text variant="headlineSmall" style={styles.currentPackagePrice}>
              Rp {(currentPackage?.price || 0).toLocaleString('id-ID')}/bulan
            </Text>
          </View>
      </View>

      {/* Available Packages */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <MaterialCommunityIcons name="swap-horizontal-bold" size={22} color={COLORS.neonViolet} />
          <Text variant="titleSmall" style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>Pilih Paket</Text>
        </View>
        <Text variant="bodySmall" style={{ color: COLORS.textSecondary, marginBottom: 12 }}>Bebas pilih paket yang diinginkan</Text>
          {availablePackages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="package-variant"
                size={48}
                color={COLORS.textSecondary}
              />
              <Text variant="bodyMedium" style={{ marginTop: 12, color: COLORS.textSecondary }}>
                Tidak ada paket tersedia
              </Text>
            </View>
          ) : (
            <RadioButton.Group onValueChange={(val) => {
              if (val !== currentProfileId) setSelectedPackage(val);
            }} value={selectedPackage}>
              {availablePackages.map((pkg) => {
                const label = getPackageLabel(pkg);
                const isCurrent = label === 'current';
                const isUpgrade = label === 'upgrade';
                const priceDiff = pkg.price - (currentPackage?.price || 0);

                return (
                  <TouchableOpacity
                    key={pkg.id}
                    style={[
                      styles.packageOption,
                      isCurrent && styles.packageOptionCurrent,
                      selectedPackage === pkg.id && styles.packageOptionSelected,
                    ]}
                    onPress={() => {
                      if (!isCurrent) setSelectedPackage(pkg.id);
                    }}
                    disabled={isCurrent}
                  >
                    <View style={styles.packageInfo}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text variant="titleMedium" style={{ fontWeight: '600' }}>
                            {pkg.name}
                          </Text>
                          {isCurrent && (
                            <View style={{ backgroundColor: COLORS.neonCyan, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                              <Text style={{ color: COLORS.bgDark, fontSize: 10, fontWeight: 'bold' }}>Paket Aktif</Text>
                            </View>
                          )}
                          {!isCurrent && isUpgrade && (
                            <View style={{ backgroundColor: COLORS.neonGreen, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                              <Text style={{ color: COLORS.bgDark, fontSize: 10, fontWeight: 'bold' }}>↑ Upgrade</Text>
                            </View>
                          )}
                          {!isCurrent && !isUpgrade && (
                            <View style={{ backgroundColor: COLORS.neonOrange, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                              <Text style={{ color: COLORS.bgDark, fontSize: 10, fontWeight: 'bold' }}>↓ Downgrade</Text>
                            </View>
                          )}
                        </View>
                        <Text variant="bodySmall" style={{ color: COLORS.textSecondary, marginTop: 4 }}>
                          ↓ {PackageService.formatSpeed(pkg.downloadSpeed)} / ↑ {PackageService.formatSpeed(pkg.uploadSpeed)}
                        </Text>
                        {pkg.description && (
                          <Text variant="bodySmall" style={{ marginTop: 4, color: COLORS.textSecondary }}>
                            {pkg.description}
                          </Text>
                        )}
                        <View style={styles.priceRow}>
                          <Text variant="titleMedium" style={{ fontWeight: 'bold', color: isCurrent ? COLORS.neonCyan : COLORS.textPrimary }}>
                            Rp {pkg.price.toLocaleString('id-ID')}/bln
                          </Text>
                          {!isCurrent && priceDiff !== 0 && (
                            <Text variant="bodySmall" style={{ color: priceDiff > 0 ? COLORS.neonOrange : COLORS.neonGreen }}>
                              {priceDiff > 0 ? `+Rp ${priceDiff.toLocaleString('id-ID')}` : `-Rp ${Math.abs(priceDiff).toLocaleString('id-ID')}`}
                            </Text>
                          )}
                        </View>
                      </View>
                      {!isCurrent && <RadioButton value={pkg.id} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </RadioButton.Group>
          )}
      </View>

      {/* Info Card */}
      <View style={styles.card}>
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information" size={20} color={COLORS.neonBlue} />
          <Text variant="bodySmall" style={{ flex: 1, color: COLORS.textSecondary }}>
            Pilih paket yang diinginkan (upgrade maupun downgrade). Sistem akan membuat invoice, dan paket akan otomatis aktif setelah pembayaran terkonfirmasi. Tidak perlu persetujuan admin.
          </Text>
        </View>
      </View>

      {/* Submit Button */}
      {availablePackages.length > 0 && (
        <View style={styles.submitContainer}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!selectedPackage || submitting}
            style={[styles.submitButton, (!selectedPackage || submitting) && { opacity: 0.5 }]}
          >
            <MaterialCommunityIcons name="swap-horizontal" size={20} color={COLORS.bgDark} />
            <Text style={{ color: COLORS.bgDark, fontWeight: 'bold', fontSize: 16, marginLeft: 8 }}>
              {submitting ? 'Memproses...' : selectedPackage
                ? (() => {
                    const pkg = availablePackages.find(p => p.id === selectedPackage);
                    if (!pkg) return 'Buat Invoice';
                    const diff = pkg.price - (currentPackage?.price || 0);
                    return diff > 0 ? 'Buat Invoice Upgrade' : diff < 0 ? 'Buat Invoice Downgrade' : 'Buat Invoice';
                  })()
                : 'Pilih Paket Dulu'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
  card: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  currentPackageBox: {
    padding: 16,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.neonCyan,
  },
  currentPackageName: {
    color: COLORS.neonCyan,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  currentPackageSpeed: {
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  currentPackagePrice: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  packageOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
    marginBottom: 12,
  },
  packageOptionSelected: {
    borderColor: COLORS.neonCyan,
    backgroundColor: `${COLORS.neonCyan}10`,
  },
  packageOptionCurrent: {
    borderColor: COLORS.neonCyan,
    backgroundColor: `${COLORS.neonCyan}08`,
    opacity: 0.7,
  },
  packageInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    backgroundColor: `${COLORS.neonBlue}10`,
    borderRadius: 8,
  },
  submitContainer: {
    padding: 16,
    marginBottom: 32,
  },
  submitButton: {
    backgroundColor: COLORS.neonCyan,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
