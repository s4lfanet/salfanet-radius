import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator as RNActivityIndicator,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Text, RadioButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants';
import { TicketService, TicketCategory, TicketPriority } from '@/services/ticket';

const PRIORITY_OPTIONS: { value: TicketPriority; label: string; color: string }[] = [
  { value: 'LOW', label: 'Rendah', color: '#6B7280' },
  { value: 'MEDIUM', label: 'Sedang', color: COLORS.neonBlue },
  { value: 'HIGH', label: 'Tinggi', color: COLORS.neonOrange },
  { value: 'URGENT', label: 'Mendesak', color: COLORS.neonPink },
];

export default function CreateTicketScreen() {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedPriority, setSelectedPriority] = useState<TicketPriority>('MEDIUM');
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await TicketService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Load categories error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    // Validations
    if (!subject.trim()) {
      Alert.alert('Error', 'Subjek tiket harus diisi');
      return;
    }

    if (subject.trim().length < 10) {
      Alert.alert('Error', 'Subjek minimal 10 karakter');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Deskripsi masalah harus diisi');
      return;
    }

    if (description.trim().length < 20) {
      Alert.alert('Error', 'Deskripsi minimal 20 karakter');
      return;
    }

    setSubmitting(true);
    try {
      const result = await TicketService.createTicket({
        subject: subject.trim(),
        description: description.trim(),
        categoryId: selectedCategory || undefined,
        priority: selectedPriority,
      });

      if (result.success) {
        Alert.alert(
          'Tiket Berhasil Dibuat',
          `Nomor tiket Anda: #${result.ticket?.ticketNumber}\n\nTim support akan segera merespon tiket Anda.`,
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Gagal membuat tiket');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Terjadi kesalahan');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Buat Tiket Baru' }} />
        <RNActivityIndicator size="large" color={COLORS.neonCyan} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: 'Buat Tiket Baru' }} />

      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <MaterialCommunityIcons name="ticket-outline" size={22} color={COLORS.neonCyan} />
          <Text variant="titleSmall" style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>Informasi Tiket</Text>
        </View>
          <Text variant="bodyMedium" style={styles.label}>
            Subjek Tiket *
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Contoh: Internet mati sejak pagi"
            value={subject}
            onChangeText={setSubject}
            maxLength={100}
          />
          <Text variant="bodySmall" style={styles.helpText}>
            {subject.length}/100 karakter (minimal 10)
          </Text>

          <Text variant="bodyMedium" style={[styles.label, { marginTop: 16 }]}>
            Deskripsi Masalah *
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Jelaskan masalah Anda secara detail..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={6}
            maxLength={500}
            textAlignVertical="top"
          />
          <Text variant="bodySmall" style={styles.helpText}>
            {description.length}/500 karakter (minimal 20)
          </Text>
      </View>

      {/* Category Selection */}
      {categories.length > 0 && (
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <MaterialCommunityIcons name="format-list-bulleted" size={22} color={COLORS.neonViolet} />
            <Text variant="titleSmall" style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>Kategori</Text>
          </View>
            <RadioButton.Group onValueChange={setSelectedCategory} value={selectedCategory}>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryOption,
                    selectedCategory === category.id && styles.categoryOptionSelected,
                  ]}
                  onPress={() => setSelectedCategory(category.id)}
                >
                  <View style={styles.categoryInfo}>
                    <View
                      style={[styles.categoryDot, { backgroundColor: category.color }]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyLarge" style={{ fontWeight: '500' }}>
                        {category.name}
                      </Text>
                      {category.description && (
                        <Text variant="bodySmall" style={{ color: COLORS.textSecondary }}>
                          {category.description}
                        </Text>
                      )}
                    </View>
                  </View>
                  <RadioButton value={category.id} />
                </TouchableOpacity>
              ))}
            </RadioButton.Group>
        </View>
      )}

      {/* Priority Selection */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <MaterialCommunityIcons name="flag" size={22} color={COLORS.neonOrange} />
          <Text variant="titleSmall" style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>Prioritas</Text>
        </View>
          <RadioButton.Group onValueChange={(value) => setSelectedPriority(value as TicketPriority)} value={selectedPriority}>
            {PRIORITY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.priorityOption,
                  selectedPriority === option.value && {
                    borderColor: option.color,
                    backgroundColor: `${option.color}10`,
                  },
                ]}
                onPress={() => setSelectedPriority(option.value)}
              >
                <View style={styles.priorityInfo}>
                  <MaterialCommunityIcons name="flag" size={20} color={option.color} />
                  <Text variant="bodyLarge" style={{ fontWeight: '500' }}>
                    {option.label}
                  </Text>
                </View>
                <RadioButton value={option.value} />
              </TouchableOpacity>
            ))}
          </RadioButton.Group>
      </View>

      {/* Submit Button */}
      <View style={styles.submitContainer}>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={[styles.submitButton, submitting && { opacity: 0.6 }]}
        >
          <MaterialCommunityIcons name="send" size={18} color={COLORS.bgDark} />
          <Text style={{ color: COLORS.bgDark, fontWeight: 'bold', fontSize: 16, marginLeft: 8 }}>
            {submitting ? 'Mengirim...' : 'Buat Tiket'}
          </Text>
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
  card: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  label: {
    marginBottom: 8,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: COLORS.bgElevated,
    color: COLORS.textPrimary,
  },
  textArea: {
    minHeight: 120,
  },
  helpText: {
    marginTop: 4,
    color: COLORS.textSecondary,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
    marginBottom: 8,
  },
  categoryOptionSelected: {
    borderColor: COLORS.neonCyan,
    backgroundColor: `${COLORS.neonCyan}10`,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  priorityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgElevated,
    marginBottom: 8,
  },
  priorityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
