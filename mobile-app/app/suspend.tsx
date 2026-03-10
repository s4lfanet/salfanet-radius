import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  TextInput,
  ActivityIndicator as RNActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants';
import { SuspendService, SuspendRequest } from '@/services/suspend';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  PENDING:   { label: 'Menunggu Persetujuan', color: '#f59e0b', icon: 'clock-outline' },
  APPROVED:  { label: 'Disetujui',           color: '#10b981', icon: 'check-circle-outline' },
  REJECTED:  { label: 'Ditolak',             color: '#ef4444', icon: 'close-circle-outline' },
  CANCELLED: { label: 'Dibatalkan',          color: '#6b7280', icon: 'cancel' },
  COMPLETED: { label: 'Selesai',             color: '#60a5fa', icon: 'check-all' },
};

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

const todayStr = () => new Date().toISOString().split('T')[0];

export default function SuspendScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [current, setCurrent] = useState<SuspendRequest | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const data = await SuspendService.getCurrent();
      setCurrent(data);
    } catch (err) {
      console.error('Load suspend error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!startDate) { e.startDate = 'Tanggal mulai wajib diisi'; }
    if (!endDate) { e.endDate = 'Tanggal selesai wajib diisi'; }
    if (startDate && endDate) {
      const s = new Date(startDate), en = new Date(endDate);
      const now = new Date(); now.setHours(0,0,0,0);
      if (s < now) e.startDate = 'Tanggal mulai tidak boleh di masa lalu';
      else if (en <= s) e.endDate = 'Tanggal selesai harus setelah tanggal mulai';
      else {
        const days = Math.ceil((en.getTime() - s.getTime()) / 86400000);
        if (days > 90) e.endDate = 'Maksimum suspend 90 hari';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    // Validate date format YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      Alert.alert('Format Salah', 'Gunakan format tanggal: YYYY-MM-DD\nContoh: 2025-09-01');
      return;
    }

    Alert.alert(
      'Konfirmasi Suspend',
      `Ajukan suspend dari ${fmt(startDate)} hingga ${fmt(endDate)}?\n\nPermintaan akan diproses oleh admin.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Kirim',
          onPress: async () => {
            setSubmitting(true);
            const result = await SuspendService.create({ startDate, endDate, reason: reason.trim() || undefined });
            setSubmitting(false);
            if (result.success) {
              Alert.alert('Berhasil', 'Permintaan suspend berhasil dikirim. Menunggu persetujuan admin.');
              setStartDate('');
              setEndDate('');
              setReason('');
              loadData();
            } else {
              Alert.alert('Gagal', result.message || 'Terjadi kesalahan');
            }
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    if (!current) return;
    Alert.alert(
      'Batalkan Suspend',
      'Yakin ingin membatalkan permintaan suspend ini?',
      [
        { text: 'Tidak', style: 'cancel' },
        {
          text: 'Ya, Batalkan',
          style: 'destructive',
          onPress: async () => {
            const result = await SuspendService.cancel(current.id);
            if (result.success) {
              Alert.alert('Berhasil', 'Permintaan suspend berhasil dibatalkan.');
              loadData();
            } else {
              Alert.alert('Gagal', result.message || 'Terjadi kesalahan');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Stack.Screen options={{ title: 'Suspend Sementara' }} />
        <RNActivityIndicator size="large" color={COLORS.neonCyan} />
      </View>
    );
  }

  const showForm = !current || ['REJECTED', 'CANCELLED', 'COMPLETED'].includes(current.status);
  const sc = current ? STATUS_CONFIG[current.status] : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Suspend Sementara', headerBackTitle: 'Kembali' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.neonCyan} />}
      >
        {/* Header Info */}
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information-outline" size={18} color={COLORS.neonViolet} />
          <Text style={styles.infoText}>
            Suspend sementara menghentikan layanan internet untuk periode tertentu (maks. 90 hari).
            Permintaan perlu disetujui admin. Layanan aktif otomatis setelah periode berakhir.
          </Text>
        </View>

        {/* Current Request Card */}
        {current && sc && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Permintaan Aktif</Text>
            <View style={styles.statusRow}>
              <MaterialCommunityIcons name={sc.icon as any} size={20} color={sc.color} />
              <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
            </View>

            <View style={styles.dateRow}>
              <View style={styles.dateCol}>
                <Text style={styles.dateLabel}>Mulai</Text>
                <Text style={styles.dateValue}>{fmt(current.startDate)}</Text>
              </View>
              <MaterialCommunityIcons name="arrow-right" size={16} color={COLORS.textSecondary} />
              <View style={styles.dateCol}>
                <Text style={styles.dateLabel}>Selesai</Text>
                <Text style={styles.dateValue}>{fmt(current.endDate)}</Text>
              </View>
            </View>

            {current.reason ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteLabel}>Alasan</Text>
                <Text style={styles.noteText}>{current.reason}</Text>
              </View>
            ) : null}

            {current.adminNotes ? (
              <View style={[styles.noteBox, { backgroundColor: 'rgba(0,247,255,0.05)' }]}>
                <Text style={styles.noteLabel}>Catatan Admin</Text>
                <Text style={styles.noteText}>{current.adminNotes}</Text>
              </View>
            ) : null}

            <Text style={styles.requestedAt}>Diajukan: {fmt(current.requestedAt)}</Text>

            {current.status === 'PENDING' && (
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                <MaterialCommunityIcons name="close-circle-outline" size={16} color={COLORS.error} />
                <Text style={styles.cancelText}>Batalkan Permintaan</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Form */}
        {showForm && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ajukan Suspend Baru</Text>

            <View style={styles.fieldRow}>
              <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Tanggal Mulai *</Text>
                <TextInput
                  style={[styles.input, errors.startDate ? styles.inputError : null]}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder={`cth: ${todayStr()}`}
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="numbers-and-punctuation"
                />
                {errors.startDate ? <Text style={styles.errorText}>{errors.startDate}</Text> : null}
              </View>

              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Tanggal Selesai *</Text>
                <TextInput
                  style={[styles.input, errors.endDate ? styles.inputError : null]}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder={`cth: ${todayStr()}`}
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="numbers-and-punctuation"
                />
                {errors.endDate ? <Text style={styles.errorText}>{errors.endDate}</Text> : null}
              </View>
            </View>

            <Text style={styles.formatHint}>Format: YYYY-MM-DD (contoh: 2025-08-25)</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Alasan (opsional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={reason}
                onChangeText={setReason}
                placeholder="Contoh: Mudik Lebaran, renovasi, perjalanan dinas..."
                placeholderTextColor={COLORS.textSecondary}
                multiline
                numberOfLines={3}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <RNActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialCommunityIcons name="pause-circle-outline" size={18} color="#fff" />
              )}
              <Text style={styles.submitText}>
                {submitting ? 'Mengirim...' : 'Kirim Permintaan Suspend'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  content: { padding: 16, paddingBottom: 32, gap: 12 },

  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(188,19,254,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(188,19,254,0.2)',
    borderRadius: 12,
    padding: 12,
  },
  infoText: { flex: 1, color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },

  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 10,
  },
  cardLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardTitle: { color: COLORS.neonCyan, fontSize: 15, fontWeight: '700' },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 15, fontWeight: '700' },

  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 4 },
  dateCol: { alignItems: 'center', gap: 2 },
  dateLabel: { color: COLORS.textSecondary, fontSize: 11 },
  dateValue: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },

  noteBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  noteLabel: { color: COLORS.textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  noteText: { color: COLORS.textPrimary, fontSize: 13 },
  requestedAt: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },

  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  cancelText: { color: COLORS.error, fontSize: 13, fontWeight: '600' },

  fieldRow: { flexDirection: 'row' },
  field: { gap: 4 },
  label: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 2 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  inputError: { borderColor: COLORS.error },
  textArea: { minHeight: 70, textAlignVertical: 'top', paddingTop: 8 },
  errorText: { color: COLORS.error, fontSize: 11 },
  formatHint: { color: COLORS.textSecondary, fontSize: 10, marginTop: -4 },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.neonViolet,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
