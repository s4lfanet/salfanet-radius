import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput as RNTextInput,
  ActivityIndicator as RNActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Text, Card, Button, Divider, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants';
import { WifiService, WLANConfig, WiFiDeviceInfo } from '@/services/wifi';

interface EditState {
  wlanIndex: number;
  ssid: string;
  password: string;
  showPassword: boolean;
}

export default function WifiScreen() {
  const [deviceInfo, setDeviceInfo] = useState<WiFiDeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noDevice, setNoDevice] = useState(false);
  const [noGenieACS, setNoGenieACS] = useState(false);

  // Edit state per WLAN
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const loadDevice = useCallback(async () => {
    try {
      const result = await WifiService.getDeviceInfoRaw();
      if (result.notConfigured) {
        setNoGenieACS(true);
        setNoDevice(false);
      } else if (!result.device) {
        setNoDevice(true);
        setNoGenieACS(false);
      } else {
        setDeviceInfo(result.device);
        setNoDevice(false);
        setNoGenieACS(false);
      }
    } catch {
      setNoDevice(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDevice();
  }, [loadDevice]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDevice();
  };

  const startEdit = (wlan: WLANConfig) => {
    setEditing({
      wlanIndex: wlan.index,
      ssid: wlan.ssid,
      password: '',
      showPassword: false,
    });
  };

  const cancelEdit = () => setEditing(null);

  const handleSave = async () => {
    if (!editing) return;

    const ssid = editing.ssid.trim();
    const password = editing.password.trim();

    if (!ssid || ssid.length < 1 || ssid.length > 32) {
      Alert.alert('Validasi', 'Nama WiFi (SSID) harus 1–32 karakter.');
      return;
    }
    if (password.length > 0 && (password.length < 8 || password.length > 63)) {
      Alert.alert('Validasi', 'Password WiFi harus 8–63 karakter.\nKosongkan jika tidak ingin mengubah password.');
      return;
    }

    Alert.alert(
      'Konfirmasi Perubahan WiFi',
      `SSID: ${ssid}\nPassword: ${password ? '*'.repeat(password.length) : '(tidak diubah)'}\n\nPerangkat akan restart sebentar setelah perubahan diterapkan.`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Simpan', onPress: () => doSave(ssid, password) },
      ]
    );
  };

  const doSave = async (ssid: string, password: string) => {
    if (!editing) return;
    setSaving(true);
    try {
      const result = await WifiService.updateWifi({
        wlanIndex: editing.wlanIndex,
        ssid,
        password: password || undefined,
      });

      if (result.success) {
        Alert.alert(
          '✅ Berhasil',
          'Konfigurasi WiFi telah dikirim ke perangkat.\nTunggu 30–60 detik lalu sambungkan ulang dengan SSID baru.',
          [{ text: 'OK', onPress: () => { setEditing(null); loadDevice(); } }]
        );
      } else {
        Alert.alert('Gagal', result.error || result.message || 'Gagal mengubah konfigurasi WiFi.');
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <RNActivityIndicator size="large" color={COLORS.neonCyan} />
        <Text style={{ marginTop: 12, color: COLORS.textSecondary }}>Memuat info perangkat…</Text>
      </View>
    );
  }

  if (noGenieACS) {
    return (
      <View style={styles.centered}>
        <MaterialCommunityIcons name="server-network-off" size={64} color={COLORS.textSecondary} />
        <Text variant="titleMedium" style={{ marginTop: 16, color: COLORS.textSecondary }}>
          GenieACS belum dikonfigurasi
        </Text>
        <Text variant="bodySmall" style={{ marginTop: 8, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: 32 }}>
          Fitur pengaturan WiFi memerlukan GenieACS TR-069. Hubungi admin untuk mengaktifkan fitur ini.
        </Text>
      </View>
    );
  }

  if (noDevice || !deviceInfo) {
    return (
      <View style={styles.centered}>
        <MaterialCommunityIcons name="router-network-wireless" size={64} color={COLORS.textSecondary} />
        <Text variant="titleMedium" style={{ marginTop: 16, color: COLORS.textSecondary }}>
          Perangkat tidak ditemukan
        </Text>
        <Text variant="bodySmall" style={{ marginTop: 8, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: 32 }}>
          Pastikan ONT/router sudah terdaftar dan terhubung ke GenieACS.
        </Text>
        <TouchableOpacity onPress={loadDevice} style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: COLORS.neonCyan, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
          <MaterialCommunityIcons name="refresh" size={18} color={COLORS.neonCyan} />
          <Text style={{ color: COLORS.neonCyan, fontWeight: 'bold' }}>Coba Lagi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.neonCyan} />}
    >

      {/* Device Info */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View style={styles.deviceIcon}>
            <MaterialCommunityIcons name="router-wireless" size={28} color={COLORS.neonCyan} />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text variant="titleMedium" style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>
              {deviceInfo.modelName || 'Perangkat ONT'}
            </Text>
            <Text variant="bodySmall" style={{ color: COLORS.textSecondary }}>
              {deviceInfo.manufacturer || 'Router'}
            </Text>
          </View>
        </View>
        <View style={styles.deviceDetails}>
          {deviceInfo.serialNumber && (
            <View style={styles.detailRow}>
              <Text variant="bodySmall" style={styles.detailLabel}>Serial</Text>
              <Text variant="bodySmall" style={styles.detailValue}>{deviceInfo.serialNumber}</Text>
            </View>
          )}
          {deviceInfo.softwareVersion && (
            <View style={styles.detailRow}>
              <Text variant="bodySmall" style={styles.detailLabel}>Firmware</Text>
              <Text variant="bodySmall" style={styles.detailValue}>{deviceInfo.softwareVersion}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text variant="bodySmall" style={styles.detailLabel}>Jaringan WiFi</Text>
            <Text variant="bodySmall" style={styles.detailValue}>{deviceInfo.wlanConfigs.length} WLAN</Text>
          </View>
        </View>
      </View>

      {/* WLAN Cards */}
      {deviceInfo.wlanConfigs.map((wlan) => {
        const isEditing = editing?.wlanIndex === wlan.index;
        return (
          <View key={wlan.index} style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={styles.wlanIcon}>
                <MaterialCommunityIcons
                  name={wlan.index === 2 ? 'wifi-strength-4' : 'wifi'}
                  size={24}
                  color={wlan.enabled ? COLORS.neonGreen : COLORS.textSecondary}
                />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text variant="titleSmall" style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>
                  WiFi {WifiService.getBandLabel(wlan.index)}
                </Text>
                <Text variant="bodySmall" style={{ color: COLORS.textSecondary }}>
                  {wlan.ssid || '(belum ada SSID)'}
                </Text>
              </View>
              <View style={{ backgroundColor: wlan.enabled ? `${COLORS.neonGreen}20` : `${COLORS.neonPink}20`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                <Text style={{ color: wlan.enabled ? COLORS.neonGreen : COLORS.neonPink, fontSize: 11, fontWeight: 'bold' }}>
                  {wlan.enabled ? 'Aktif' : 'Mati'}
                </Text>
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 }}>
              {!isEditing ? (
                // View mode
                <View>
                  <View style={styles.wifiInfoRow}>
                    <MaterialCommunityIcons name="wifi" size={16} color={COLORS.textSecondary} />
                    <Text variant="bodyMedium" style={{ marginLeft: 8 }}>
                      {wlan.ssid || '—'}
                    </Text>
                  </View>
                  <View style={styles.wifiInfoRow}>
                    <MaterialCommunityIcons name="lock" size={16} color={COLORS.textSecondary} />
                    <Text variant="bodySmall" style={{ marginLeft: 8, color: COLORS.textSecondary }}>
                      {wlan.securityMode || 'Unknown'}
                    </Text>
                  </View>
                  {wlan.totalAssociations !== undefined && (
                    <View style={styles.wifiInfoRow}>
                      <MaterialCommunityIcons name="devices" size={16} color={COLORS.textSecondary} />
                      <Text variant="bodySmall" style={{ marginLeft: 8, color: COLORS.textSecondary }}>
                        {wlan.totalAssociations} perangkat terhubung
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => startEdit(wlan)}
                    disabled={!!editing && !isEditing}
                    style={{ marginTop: 12, borderWidth: 1, borderColor: COLORS.neonCyan, borderRadius: 8, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (!!editing && !isEditing) ? 0.4 : 1 }}
                  >
                    <MaterialCommunityIcons name="pencil" size={16} color={COLORS.neonCyan} />
                    <Text style={{ color: COLORS.neonCyan, fontWeight: 'bold', fontSize: 14 }}>Edit WiFi Ini</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                // Edit mode
                <View>
                  <Text variant="labelMedium" style={styles.inputLabel}>Nama WiFi (SSID)</Text>
                  <View style={styles.inputWrapper}>
                    <RNTextInput
                      style={styles.input}
                      value={editing.ssid}
                      onChangeText={(v) => setEditing({ ...editing, ssid: v })}
                      placeholder="Nama WiFi baru"
                      maxLength={32}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <Text variant="bodySmall" style={styles.inputHint}>
                    {editing.ssid.length}/32 karakter
                  </Text>

                  <Text variant="labelMedium" style={[styles.inputLabel, { marginTop: 12 }]}>Password WiFi</Text>
                  <View style={styles.inputWrapper}>
                    <RNTextInput
                      style={[styles.input, { flex: 1 }]}
                      value={editing.password}
                      onChangeText={(v) => setEditing({ ...editing, password: v })}
                      placeholder="Kosongkan jika tidak ingin ubah password"
                      secureTextEntry={!editing.showPassword}
                      maxLength={63}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      onPress={() => setEditing({ ...editing, showPassword: !editing.showPassword })}
                      style={styles.eyeIcon}
                    >
                      <MaterialCommunityIcons
                        name={editing.showPassword ? 'eye-off' : 'eye'}
                        size={20}
                        color={COLORS.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                  <Text variant="bodySmall" style={styles.inputHint}>
                    8–63 karakter. Kosongkan jika tidak ingin mengubah password.
                  </Text>

                  <View style={styles.editActions}>
                    <TouchableOpacity
                      onPress={cancelEdit}
                      disabled={saving}
                      style={{ flex: 1, borderWidth: 1, borderColor: COLORS.textSecondary, borderRadius: 8, paddingVertical: 10, alignItems: 'center', opacity: saving ? 0.4 : 1 }}
                    >
                      <Text style={{ color: COLORS.textSecondary, fontWeight: 'bold' }}>Batal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSave}
                      disabled={saving}
                      style={{ flex: 1, backgroundColor: COLORS.neonCyan, borderRadius: 8, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.6 : 1 }}
                    >
                      <MaterialCommunityIcons name="content-save" size={16} color={COLORS.bgDark} />
                      <Text style={{ color: COLORS.bgDark, fontWeight: 'bold' }}>{saving ? 'Menyimpan...' : 'Simpan'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        );
      })}

      {/* Info */}
      <View style={[styles.card, { marginBottom: 32 }]}>
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information-outline" size={20} color={COLORS.neonBlue} />
          <Text variant="bodySmall" style={{ flex: 1, color: COLORS.textSecondary, marginLeft: 8 }}>
            Perubahan dikirim langsung ke perangkat via TR-069. Setelah disimpan, tunggu 30–60 detik dan sambungkan kembali ke WiFi dengan nama/password baru.
          </Text>
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
  centered: {
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
  deviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${COLORS.neonCyan}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wlanIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    color: COLORS.textSecondary,
  },
  detailValue: {
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  wifiInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  eyeIcon: {
    padding: 4,
  },
  inputHint: {
    color: COLORS.textSecondary,
    marginTop: 4,
    marginLeft: 2,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: `${COLORS.neonBlue}10`,
    borderRadius: 8,
  },
});
