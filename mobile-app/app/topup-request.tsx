/**
 * Top-Up Request Screen (Manual Transfer)
 * Customer mengirim request top-up saldo via transfer bank / e-wallet / cash
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput as RNTextInput,
  Image,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, API_CONFIG } from '@/constants';
import { AuthService } from '@/services/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

type PaymentMethod = 'TRANSFER' | 'EWALLET' | 'CASH';

const PRESET_AMOUNTS = [50000, 100000, 250000, 500000, 1000000];
const MIN_AMOUNT = 10000;

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string }[] = [
  { key: 'TRANSFER', label: 'Transfer Bank', icon: 'bank' },
  { key: 'EWALLET', label: 'E-Wallet', icon: 'cellphone' },
  { key: 'CASH', label: 'Cash', icon: 'cash' },
];

export default function TopUpRequestScreen() {
  const [currentBalance, setCurrentBalance] = useState(0);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('TRANSFER');
  const [note, setNote] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [proofName, setProofName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    loadBalance();
  }, []);

  const loadBalance = async () => {
    try {
      const profile = await AuthService.getProfile();
      setCurrentBalance(profile.balance || 0);
    } catch (e) {
      console.error('[TopUpRequest] Profile load error:', e);
    } finally {
      setLoadingProfile(false);
    }
  };

  const getFinalAmount = (): number => {
    if (selectedAmount !== null) return selectedAmount;
    const parsed = parseInt(customAmount.replace(/\D/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Izin Diperlukan', 'Izinkan akses ke galeri untuk mengunggah bukti transfer.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setProofUri(asset.uri);
      setProofName(asset.fileName || asset.uri.split('/').pop() || 'proof.jpg');
    }
  };

  const handleSubmit = async () => {
    const amount = getFinalAmount();

    if (amount < MIN_AMOUNT) {
      Alert.alert('Validasi', `Nominal minimal top-up adalah Rp ${MIN_AMOUNT.toLocaleString('id-ID')}.`);
      return;
    }

    if (paymentMethod !== 'CASH' && !proofUri) {
      Alert.alert('Bukti Transfer', 'Silakan unggah bukti transfer / pembayaran.');
      return;
    }

    Alert.alert(
      'Konfirmasi',
      `Kirim permintaan top-up:\nNominal: Rp ${amount.toLocaleString('id-ID')}\nMetode: ${PAYMENT_METHODS.find(m => m.key === paymentMethod)?.label}\n\nLanjutkan?`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Kirim', onPress: () => doSubmit(amount) },
      ]
    );
  };

  const doSubmit = async (amount: number) => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        Alert.alert('Error', 'Sesi habis. Silakan login ulang.');
        router.replace('/login');
        return;
      }

      const formData = new FormData();
      formData.append('amount', amount.toString());
      formData.append('paymentMethod', paymentMethod);
      formData.append('note', note);

      if (proofUri && proofName && paymentMethod !== 'CASH') {
        const ext = proofName.split('.').pop()?.toLowerCase() || 'jpg';
        const type = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        formData.append('proof', {
          uri: proofUri,
          name: proofName,
          type,
        } as any);
      }

      const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TOPUP_REQUEST}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.success) {
        Alert.alert(
          '✅ Permintaan Terkirim',
          `Permintaan top-up Rp ${amount.toLocaleString('id-ID')} telah dikirim ke admin.\nTunggu konfirmasi dalam 1×24 jam.\n\nNo. Referensi: ${data.transaction?.reference || '-'}`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Gagal', data.error || 'Gagal mengirim permintaan top-up.');
      }
    } catch (error: any) {
      console.error('[TopUpRequest] Submit error:', error);
      Alert.alert('Error', 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Top-Up Manual',
          headerStyle: { backgroundColor: COLORS.bgCard },
          headerTintColor: COLORS.neonCyan,
          headerTitleStyle: { color: COLORS.textPrimary, fontWeight: 'bold' },
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>

        {/* Balance info */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="wallet" size={22} color={COLORS.neonCyan} />
            </View>
            <View>
              <Text variant="bodySmall" style={{ color: COLORS.textSecondary }}>Saldo saat ini</Text>
              {loadingProfile ? (
                <ActivityIndicator size="small" color={COLORS.neonCyan} />
              ) : (
                <Text variant="titleMedium" style={{ color: COLORS.neonGreen, fontWeight: 'bold' }}>
                  Rp {currentBalance.toLocaleString('id-ID')}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Amount section */}
        <View style={styles.card}>
          <Text variant="labelLarge" style={styles.sectionTitle}>Nominal Top-Up</Text>

          {/* Preset amounts */}
          <View style={styles.presetGrid}>
            {PRESET_AMOUNTS.map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[styles.presetBtn, selectedAmount === amt && styles.presetBtnActive]}
                onPress={() => { setSelectedAmount(amt); setCustomAmount(''); }}
              >
                <Text style={[
                  styles.presetBtnText,
                  selectedAmount === amt && styles.presetBtnTextActive,
                ]}>
                  {amt >= 1_000_000 ? `${amt / 1_000_000}jt` : `${amt / 1000}rb`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom amount */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputPrefix}>Rp</Text>
            <RNTextInput
              style={styles.input}
              value={customAmount}
              onChangeText={(v) => { setCustomAmount(v); setSelectedAmount(null); }}
              keyboardType="number-pad"
              placeholder="Atau masukkan nominal lain"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>
          <Text variant="bodySmall" style={styles.hint}>Minimal Rp {MIN_AMOUNT.toLocaleString('id-ID')}</Text>
        </View>

        {/* Payment method */}
        <View style={styles.card}>
          <Text variant="labelLarge" style={styles.sectionTitle}>Metode Pembayaran</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PAYMENT_METHODS.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[styles.methodBtn, paymentMethod === m.key && styles.methodBtnActive]}
                onPress={() => setPaymentMethod(m.key)}
              >
                <MaterialCommunityIcons
                  name={m.icon as any}
                  size={20}
                  color={paymentMethod === m.key ? COLORS.neonCyan : COLORS.textSecondary}
                />
                <Text style={[
                  styles.methodBtnText,
                  paymentMethod === m.key && { color: COLORS.neonCyan },
                ]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Proof upload (not for cash) */}
        {paymentMethod !== 'CASH' && (
          <View style={styles.card}>
            <Text variant="labelLarge" style={styles.sectionTitle}>
              Bukti Transfer <Text style={{ color: COLORS.error }}>*</Text>
            </Text>
            <TouchableOpacity style={styles.uploadBox} onPress={handlePickImage}>
              {proofUri ? (
                <Image source={{ uri: proofUri }} style={styles.proofImage} resizeMode="cover" />
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <MaterialCommunityIcons name="image-plus" size={40} color={COLORS.textSecondary} />
                  <Text variant="bodySmall" style={{ color: COLORS.textSecondary, marginTop: 8 }}>
                    Tap untuk pilih gambar
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            {proofUri && (
              <TouchableOpacity
                onPress={() => { setProofUri(null); setProofName(null); }}
                style={{ marginTop: 8, alignItems: 'center' }}
              >
                <Text style={{ color: COLORS.error, fontSize: 12 }}>× Hapus gambar</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Note */}
        <View style={styles.card}>
          <Text variant="labelLarge" style={styles.sectionTitle}>Catatan (Opsional)</Text>
          <View style={styles.noteWrapper}>
            <RNTextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="Mis: Transfer dari BCA 1234..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Info box */}
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.neonBlue} style={{ marginTop: 2 }} />
          <Text variant="bodySmall" style={{ flex: 1, color: COLORS.textSecondary, marginLeft: 8 }}>
            Permintaan akan diproses admin dalam 1×24 jam. Saldo akan otomatis ditambahkan setelah dikonfirmasi.
          </Text>
        </View>

        {/* Submit button */}
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.bgDark} />
            ) : (
              <>
                <MaterialCommunityIcons name="send" size={18} color={COLORS.bgDark} />
                <Text style={styles.submitBtnText}>Kirim Permintaan</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  card: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${COLORS.neonCyan}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  presetBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.bgElevated,
  },
  presetBtnActive: { borderColor: COLORS.neonCyan, backgroundColor: `${COLORS.neonCyan}15` },
  presetBtnText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  presetBtnTextActive: { color: COLORS.neonCyan },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: 12,
  },
  inputPrefix: { color: COLORS.textSecondary, marginRight: 8, fontSize: 14 },
  input: { flex: 1, height: 44, fontSize: 15, color: COLORS.textPrimary },
  hint: { color: COLORS.textSecondary, marginTop: 6, fontSize: 11 },
  methodBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.bgElevated,
    gap: 4,
  },
  methodBtnActive: { borderColor: COLORS.neonCyan, backgroundColor: `${COLORS.neonCyan}10` },
  methodBtnText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  uploadBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgElevated,
    minHeight: 120,
  },
  proofImage: { width: '100%', height: 200, borderRadius: 8 },
  noteWrapper: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: 12,
  },
  noteInput: {
    minHeight: 80,
    fontSize: 14,
    color: COLORS.textPrimary,
    paddingVertical: 10,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    backgroundColor: `${COLORS.neonBlue}10`,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${COLORS.neonBlue}20`,
  },
  submitBtn: {
    backgroundColor: COLORS.neonCyan,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  submitBtnText: {
    color: COLORS.bgDark,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
