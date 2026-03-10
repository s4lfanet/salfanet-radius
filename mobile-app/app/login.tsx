/**
 * Login Screen
 */

import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, TextInput as RNTextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, HelperText } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/hooks';
import { COLORS, API_CONFIG } from '@/constants';

export default function LoginScreen() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    
    if (!identifier) {
      setError('Nomor HP atau Customer ID harus diisi');
      return;
    }

    try {
      setLoading(true);
      console.log('[Login Screen] Starting login with:', identifier);
      await login(identifier);
      console.log('[Login Screen] Login successful!');
      // Navigation handled by RootLayoutNav
    } catch (err: any) {
      console.error('[Login Screen] Login failed:', err);
      const errorMessage = err.message || 'Login gagal. Periksa nomor HP atau Customer ID Anda.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    setError('');
    setLoading(true);
    
    try {
      console.log('Testing connection to:', API_CONFIG.BASE_URL);
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/customer/profile`);
      
      console.log('Connection test response:', response.status);
      
      if (response.status === 401) {
        Alert.alert(
          'Koneksi Berhasil ✅',
          `Server dapat diakses!\n\nAPI URL: ${API_CONFIG.BASE_URL}\n\nSekarang coba login dengan nomor HP atau Customer ID Anda.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Server Merespons',
          `Status: ${response.status}\n\nServer dapat diakses, silakan coba login.`,
          [{ text: 'OK' }]
        );
      }
    } catch (err: any) {
      console.error('Connection test failed:', err);
      Alert.alert(
        'Koneksi Gagal ❌',
        `Tidak dapat terhubung ke server.\n\nAPI URL: ${API_CONFIG.BASE_URL}\n\nPastikan:\n• PC dan HP di WiFi yang sama\n• Backend server sudah running\n• Windows Firewall tidak memblokir port 3000\n\nError: ${err.message}`,
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="wifi" size={60} color={COLORS.bgDark} />
          </View>
          <Text variant="headlineMedium" style={styles.title}>
            SALFANET RADIUS
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Customer Portal
          </Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.inputWrapper}>
            <MaterialCommunityIcons name="phone" size={20} color={COLORS.textSecondary} style={{ marginRight: 10 }} />
            <RNTextInput
              placeholder="08123456789 atau 12345678"
              placeholderTextColor={COLORS.textSecondary}
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              keyboardType="phone-pad"
              style={styles.input}
              onSubmitEditing={handleLogin}
            />
          </View>

          {error ? (
            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>
          ) : (
            <HelperText type="info" visible>
              Masukkan nomor WhatsApp terdaftar atau Customer ID 8-digit
            </HelperText>
          )}

          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            style={[styles.button, loading && { opacity: 0.6 }]}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.bgDark} />
            ) : (
              <Text style={{ color: COLORS.bgDark, fontWeight: 'bold', fontSize: 16 }}>Login</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={testConnection}
            disabled={loading}
            style={[styles.testButton, loading && { opacity: 0.4 }]}
          >
            <Text style={{ color: COLORS.neonCyan, fontWeight: 'bold', fontSize: 14 }}>Test Koneksi Server</Text>
          </TouchableOpacity>

          <Text variant="bodySmall" style={styles.helpText}>
            Hubungi CS jika tidak dapat login
          </Text>
        </View>

        <View style={styles.footer}>
          <Text variant="bodySmall" style={styles.footerText}>
            © 2026 SALFANET RADIUS. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.neonCyan,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: COLORS.neonCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontWeight: 'bold',
    color: COLORS.neonCyan,
    marginBottom: 8,
  },
  subtitle: {
    color: COLORS.textSecondary,
  },
  formContainer: {
    marginBottom: 24,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  button: {
    marginTop: 8,
    backgroundColor: COLORS.neonCyan,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  testButton: {
    marginTop: 12,
    borderColor: COLORS.neonCyan,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  helpText: {
    marginTop: 16,
    textAlign: 'center',
    color: COLORS.textSecondary,
  },
  footer: {
    alignItems: 'center',
    marginTop: 'auto',
  },
  footerText: {
    color: COLORS.textSecondary,
  },
});
