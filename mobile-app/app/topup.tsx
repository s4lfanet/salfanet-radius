import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Linking,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants';
import { TopUpService, PaymentGateway, PaymentChannel } from '@/services/topup';
import { AuthService } from '@/services/auth';

const PRESET_AMOUNTS = [50000, 100000, 250000, 500000, 1000000];
const MIN_AMOUNT = 10000;

export default function TopUpScreen() {
  const [currentBalance, setCurrentBalance] = useState(0);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [selectedGateway, setSelectedGateway] = useState<string | null>(null);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingGateways, setLoadingGateways] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      // Load current balance
      const profile = await AuthService.getProfile();
      setCurrentBalance(profile.balance || 0);

      // Load payment gateways
      const gateways = await TopUpService.getPaymentGateways();
      setPaymentGateways(gateways);

      // Auto-select first gateway if available
      if (gateways.length > 0) {
        setSelectedGateway(gateways[0].provider);
      }
    } catch (error) {
      console.error('Load top-up data error:', error);
    } finally {
      setLoadingGateways(false);
    }
  };

  const loadChannels = async (gateway: string, amt: number) => {
    if (!gateway || amt < MIN_AMOUNT) return;
    setLoadingChannels(true);
    setPaymentChannels([]);
    setSelectedChannel(null);
    try {
      const channels = await TopUpService.getPaymentChannels(gateway, amt);
      if (channels.length > 0) {
        setPaymentChannels(channels);
        setSelectedChannel(channels[0].code);
      }
    } catch (error) {
      console.error('Load channels error:', error);
    } finally {
      setLoadingChannels(false);
    }
  };

  useEffect(() => {
    const amt = getTopUpAmount();
    if (selectedGateway && amt >= MIN_AMOUNT) {
      loadChannels(selectedGateway, amt);
    } else {
      setPaymentChannels([]);
      setSelectedChannel(null);
    }
  }, [selectedGateway, selectedAmount, customAmount]);

  const handlePresetAmountPress = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount('');
  };

  const handleCustomAmountChange = (text: string) => {
    // Remove non-numeric characters
    const numericText = text.replace(/[^0-9]/g, '');
    setCustomAmount(numericText);
    
    // Clear preset selection when custom input is used
    if (numericText) {
      setSelectedAmount(null);
    }
  };

  const getTopUpAmount = (): number => {
    if (customAmount) {
      return parseInt(customAmount);
    }
    return selectedAmount || 0;
  };

  const handleTopUp = async () => {
    const amount = getTopUpAmount();

    // Validations
    if (amount < MIN_AMOUNT) {
      Alert.alert('Error', `Minimal top-up adalah Rp ${MIN_AMOUNT.toLocaleString('id-ID')}`);
      return;
    }

    if (!selectedGateway) {
      Alert.alert('Error', 'Pilih metode pembayaran terlebih dahulu');
      return;
    }

    if (paymentChannels.length > 0 && !selectedChannel) {
      Alert.alert('Error', 'Pilih channel pembayaran terlebih dahulu');
      return;
    }

    // Confirmation
    Alert.alert(
      'Konfirmasi Isi Saldo',
      `Isi saldo sejumlah Rp ${amount.toLocaleString('id-ID')} melalui ${
        paymentGateways.find((g) => g.provider === selectedGateway)?.name || selectedGateway
      }?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Lanjutkan',
          onPress: () => processTopUp(amount),
        },
      ]
    );
  };

  const processTopUp = async (amount: number) => {
    setLoading(true);
    try {
      const result = await TopUpService.createTopUp({
        amount,
        gateway: selectedGateway!,
        paymentChannel: selectedChannel || undefined,
      });

      if (result.success && result.invoice?.paymentLink) {
        // Show success message
        Alert.alert(
          'Isi Saldo Dibuat',
          'Anda akan diarahkan ke halaman pembayaran',
          [
            {
              text: 'OK',
              onPress: () => {
                // Open payment link
                Linking.openURL(result.invoice!.paymentLink);
                // Navigate back to dashboard
                router.back();
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Gagal membuat top-up');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  const finalAmount = getTopUpAmount();
  const estimatedBalance = currentBalance + finalAmount;

  if (loadingGateways) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Isi Saldo' }} />
        <ActivityIndicator size="large" color={COLORS.neonCyan} />
        <Text style={{ marginTop: 16, color: COLORS.textSecondary }}>Memuat...</Text>
      </View>
    );
  }

  if (paymentGateways.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Isi Saldo' }} />
        <MaterialCommunityIcons name="credit-card-off" size={64} color={COLORS.textSecondary} />
        <Text variant="titleMedium" style={{ marginTop: 16, color: COLORS.textSecondary }}>
          Payment Gateway Tidak Tersedia
        </Text>
        <Text variant="bodyMedium" style={{ marginTop: 8, color: COLORS.textSecondary }}>
          Hubungi admin untuk informasi lebih lanjut
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: 'Isi Saldo' }} />

      {/* Current Balance Card */}
      <View style={styles.balanceCard}>
        <Text variant="bodyMedium" style={styles.balanceLabel}>
          Saldo Saat Ini
        </Text>
        <Text variant="headlineMedium" style={styles.balanceAmount}>
          Rp {currentBalance.toLocaleString('id-ID')}
        </Text>
      </View>

      {/* Preset Amounts */}
      <View style={styles.card}>
        <Text variant="titleSmall" style={{ color: COLORS.textPrimary, fontWeight: 'bold', marginBottom: 12 }}>Pilih Nominal</Text>
          <View style={styles.presetGrid}>
            {PRESET_AMOUNTS.map((amount) => (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.presetButton,
                  selectedAmount === amount && styles.presetButtonSelected,
                ]}
                onPress={() => handlePresetAmountPress(amount)}
              >
                <Text
                  variant="bodyMedium"
                  style={[
                    styles.presetText,
                    selectedAmount === amount && styles.presetTextSelected,
                  ]}
                >
                  Rp {amount.toLocaleString('id-ID')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom Amount Input */}
          <View style={styles.customAmountContainer}>
            <Text variant="bodyMedium" style={{ marginBottom: 8 }}>
              Atau Masukkan Nominal Lain:
            </Text>
            <View style={styles.customInputWrapper}>
              <Text variant="bodyLarge" style={styles.currencyPrefix}>
                Rp
              </Text>
              <TextInput
                style={styles.customInput}
                placeholder="0"
                keyboardType="numeric"
                value={customAmount}
                onChangeText={handleCustomAmountChange}
              />
            </View>
            <Text variant="bodySmall" style={styles.helpText}>
              Minimal Rp {MIN_AMOUNT.toLocaleString('id-ID')}
            </Text>
          </View>
      </View>

      {/* Payment Gateway */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <MaterialCommunityIcons name="credit-card-outline" size={22} color={COLORS.neonViolet} />
          <Text variant="titleSmall" style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>Metode Pembayaran</Text>
        </View>
          {paymentGateways.map((gateway) => (
            <TouchableOpacity
              key={gateway.id}
              style={[
                styles.gatewayOption,
                selectedGateway === gateway.provider && styles.gatewayOptionSelected,
              ]}
              onPress={() => setSelectedGateway(gateway.provider)}
            >
              <View style={styles.gatewayInfo}>
                <MaterialCommunityIcons
                  name="credit-card"
                  size={24}
                  color={
                    selectedGateway === gateway.provider ? COLORS.neonCyan : COLORS.textSecondary
                  }
                />
                <Text
                  variant="bodyLarge"
                  style={[
                    styles.gatewayName,
                    selectedGateway === gateway.provider && { color: COLORS.neonCyan },
                  ]}
                >
                  {gateway.name}
                </Text>
              </View>
              {selectedGateway === gateway.provider && (
                <MaterialCommunityIcons name="check-circle" size={24} color={COLORS.neonCyan} />
              )}
            </TouchableOpacity>
          ))}

          {/* Payment Channel Selection */}
          {loadingChannels ? (
            <View style={{ alignItems: 'center', paddingVertical: 12, gap: 8 }}>
              <ActivityIndicator size="small" color={COLORS.neonCyan} />
              <Text variant="bodySmall" style={{ color: COLORS.textSecondary }}>Memuat metode pembayaran...</Text>
            </View>
          ) : paymentChannels.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Text variant="titleSmall" style={{ color: COLORS.textPrimary, fontWeight: 'bold', marginBottom: 8 }}>Pilih Channel Pembayaran</Text>
              {paymentChannels.map((ch) => (
                <TouchableOpacity
                  key={ch.code}
                  style={[
                    styles.gatewayOption,
                    selectedChannel === ch.code && styles.gatewayOptionSelected,
                  ]}
                  onPress={() => setSelectedChannel(ch.code)}
                >
                  <View style={styles.gatewayInfo}>
                    <MaterialCommunityIcons
                      name="bank-outline"
                      size={24}
                      color={selectedChannel === ch.code ? COLORS.neonCyan : COLORS.textSecondary}
                    />
                    <View>
                      <Text
                        variant="bodyMedium"
                        style={[
                          styles.gatewayName,
                          selectedChannel === ch.code && { color: COLORS.neonCyan },
                        ]}
                      >
                        {ch.name}
                      </Text>
                      {ch.totalFee !== undefined && (
                        <Text variant="bodySmall" style={{ color: COLORS.textSecondary }}>
                          {ch.totalFee === 0 ? 'Gratis biaya' : `Biaya: Rp ${ch.totalFee.toLocaleString('id-ID')}`}
                        </Text>
                      )}
                    </View>
                  </View>
                  {selectedChannel === ch.code && (
                    <MaterialCommunityIcons name="check-circle" size={24} color={COLORS.neonCyan} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
      </View>

      {/* Summary Card */}
      {finalAmount >= MIN_AMOUNT && (
        <View style={styles.card}>
          <Text variant="titleSmall" style={{ color: COLORS.textPrimary, fontWeight: 'bold', marginBottom: 12 }}>Ringkasan</Text>
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={{ color: COLORS.textSecondary }}>Nominal Isi Saldo:</Text>
              <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: COLORS.textPrimary }}>
                Rp {finalAmount.toLocaleString('id-ID')}
              </Text>
            </View>
            <View style={[styles.summaryRow, { marginTop: 8 }]}>
              <Text variant="bodyMedium" style={{ color: COLORS.textSecondary }}>Saldo Setelah Isi Saldo:</Text>
              <Text variant="bodyMedium" style={{ fontWeight: 'bold', color: COLORS.neonGreen }}>
                Rp {estimatedBalance.toLocaleString('id-ID')}
              </Text>
            </View>
        </View>
      )}

      {/* Submit Button */}
      <View style={styles.submitContainer}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (loading || finalAmount < MIN_AMOUNT || !selectedGateway || loadingChannels || (paymentChannels.length > 0 && !selectedChannel)) && styles.submitButtonDisabled,
          ]}
          onPress={handleTopUp}
          disabled={loading || finalAmount < MIN_AMOUNT || !selectedGateway || loadingChannels || (paymentChannels.length > 0 && !selectedChannel)}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.bgDark} />
          ) : (
            <>
              <MaterialCommunityIcons name="cash-plus" size={24} color={COLORS.bgDark} />
              <Text variant="bodyLarge" style={styles.submitButtonText}>
                Isi Saldo Sekarang
              </Text>
            </>
          )}
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
  balanceCard: {
    margin: 16,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.neonCyan,
    padding: 20,
    alignItems: 'center',
  },
  balanceLabel: {
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  balanceAmount: {
    color: COLORS.neonCyan,
    fontWeight: 'bold',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  presetButton: {
    flex: 1,
    minWidth: '30%',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
  },
  presetButtonSelected: {
    borderColor: COLORS.neonCyan,
    backgroundColor: `${COLORS.neonCyan}15`,
  },
  presetText: {
    color: COLORS.textPrimary,
  },
  presetTextSelected: {
    color: COLORS.neonCyan,
    fontWeight: 'bold',
  },
  customAmountContainer: {
    marginTop: 24,
  },
  customInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.bgElevated,
  },
  currencyPrefix: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
    marginRight: 8,
  },
  customInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  helpText: {
    marginTop: 8,
    color: COLORS.textSecondary,
  },
  gatewayOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
    marginBottom: 12,
  },
  gatewayOptionSelected: {
    borderColor: COLORS.neonCyan,
    backgroundColor: `${COLORS.neonCyan}10`,
  },
  gatewayInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gatewayName: {
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  submitContainer: {
    padding: 16,
    marginBottom: 32,
  },
  submitButton: {
    backgroundColor: COLORS.neonCyan,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.textSecondary,
    opacity: 0.5,
  },
  submitButtonText: {
    color: COLORS.bgDark,
    fontWeight: 'bold',
  },
});
