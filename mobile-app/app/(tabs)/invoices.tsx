/**
 * Invoices Screen - Tagihan
 */

import { useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, Alert, Linking, Image, TouchableOpacity, ScrollView } from 'react-native';
import { Card, Text, Chip, Button, ActivityIndicator, Searchbar, Dialog, Portal, RadioButton, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useInvoices } from '@/hooks';
import { COLORS, INVOICE_STATUS } from '@/constants';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Invoice, InvoiceService } from '@/services/invoice';
import { TopUpService, PaymentGateway } from '@/services/topup';
import { PaymentService } from '@/services/payment';

const BANK_OPTIONS = [
  'BCA', 'BNI', 'BRI', 'Mandiri', 'BSI',
  'CIMB Niaga', 'Dana', 'OVO', 'GoPay', 'ShopeePay',
];

export default function InvoicesScreen() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  // Online payment states
  const [gatewayDialogVisible, setGatewayDialogVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<string>('');
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [processingPayment, setProcessingPayment] = useState(false);

  // Payment method choice
  const [paymentChoiceVisible, setPaymentChoiceVisible] = useState(false);

  // Offline/manual payment states
  const [offlineDialogVisible, setOfflineDialogVisible] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [proofImage, setProofImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submittingOffline, setSubmittingOffline] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useInvoices(1, statusFilter);

  const invoices = data?.invoices ?? [];

  useEffect(() => {
    loadPaymentGateways();
  }, []);

  const loadPaymentGateways = async () => {
    const gateways = await TopUpService.getPaymentGateways();
    setPaymentGateways(gateways);
    if (gateways.length > 0) {
      setSelectedGateway(gateways[0].provider);
    }
  };

  const handlePayInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentChoiceVisible(true);
  };

  // Choose online payment
  const handleChooseOnline = () => {
    setPaymentChoiceVisible(false);
    if (paymentGateways.length === 0) {
      Alert.alert('Error', 'Payment gateway tidak tersedia. Hubungi admin.');
      return;
    }
    setGatewayDialogVisible(true);
  };

  // Choose offline/manual payment
  const handleChooseOffline = () => {
    setPaymentChoiceVisible(false);
    setBankName('');
    setAccountNumber('');
    setAccountName('');
    setPaymentNotes('');
    setProofImage(null);
    setOfflineDialogVisible(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedInvoice || !selectedGateway) return;

    setProcessingPayment(true);
    setGatewayDialogVisible(false);

    try {
      const result = await InvoiceService.regeneratePayment(selectedInvoice.id, selectedGateway);

      if (result.success && result.paymentUrl) {
        Alert.alert(
          'Pembayaran Siap',
          'Anda akan diarahkan ke halaman pembayaran',
          [
            {
              text: 'OK',
              onPress: () => {
                Linking.openURL(result.paymentUrl!);
                refetch();
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Gagal membuat link pembayaran');
      }
    } catch (error) {
      Alert.alert('Error', 'Terjadi kesalahan saat membuat pembayaran');
    } finally {
      setProcessingPayment(false);
      setSelectedInvoice(null);
    }
  };

  // Pick proof image from gallery
  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Izin Diperlukan', 'Izin akses galeri diperlukan untuk mengunggah bukti transfer.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      setProofImage(result.assets[0]);
    }
  };

  // Take photo for proof
  const handleTakePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Izin Diperlukan', 'Izin akses kamera diperlukan untuk mengambil foto bukti transfer.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      setProofImage(result.assets[0]);
    }
  };

  // Submit offline payment
  const handleSubmitOfflinePayment = async () => {
    if (!selectedInvoice) return;
    if (!bankName.trim()) {
      Alert.alert('Error', 'Pilih metode pembayaran/nama bank');
      return;
    }
    if (!accountName.trim()) {
      Alert.alert('Error', 'Masukkan nama lengkap pengirim');
      return;
    }
    if (!proofImage) {
      Alert.alert('Error', 'Upload bukti transfer diperlukan');
      return;
    }

    setSubmittingOffline(true);
    try {
      // Create manual payment
      const payment = await PaymentService.createPayment({
        invoiceId: selectedInvoice.id,
        amount: selectedInvoice.amount,
        paymentMethod: bankName.trim(),
        accountNumber: accountNumber.trim() || undefined,
        accountName: accountName.trim(),
        notes: paymentNotes.trim() || undefined,
      });

      // Upload proof image
      if (payment?.id && proofImage) {
        await PaymentService.uploadPaymentProof(payment.id, proofImage.uri);
      }

      setOfflineDialogVisible(false);
      setSelectedInvoice(null);
      setBankName('');
      setAccountNumber('');
      setAccountName('');
      setPaymentNotes('');
      setProofImage(null);

      Alert.alert(
        'Berhasil',
        'Pembayaran berhasil dikirim. Menunggu konfirmasi dari admin.',
        [{ text: 'OK', onPress: () => refetch() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Gagal mengirim pembayaran. Silakan coba lagi.');
    } finally {
      setSubmittingOffline(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return invoices;
    return invoices.filter((invoice) => {
      const number = invoice.invoiceNumber.toLowerCase();
      const profile = invoice.profileName?.toLowerCase() ?? '';
      return number.includes(query) || profile.includes(query);
    });
  }, [invoices, searchQuery]);

  const renderInvoiceItem = ({ item }: { item: Invoice }) => {
    const status = item.status?.toUpperCase() || 'PENDING';
    const statusConfig = INVOICE_STATUS[status] || { label: status, color: COLORS.textSecondary };
    const canPay = status === 'PENDING' || status === 'OVERDUE';

    return (
      <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.invoiceInfo}>
              <Text variant="titleMedium" style={styles.invoiceNumber}>
                {item.invoiceNumber}
              </Text>
              <Text variant="bodySmall" style={styles.profileName}>
                {item.profileName || 'Tanpa paket'}
              </Text>
            </View>
            <View style={{ backgroundColor: statusConfig.color, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ color: COLORS.bgDark, fontSize: 12, fontWeight: 'bold' }}>
                {statusConfig.label}
              </Text>
            </View>
          </View>

          <View style={styles.amountRow}>
            <Text variant="titleLarge" style={styles.amount}>
              Rp {item.amount.toLocaleString('id-ID')}
            </Text>
          </View>

          <View style={styles.dateRow}>
            <View style={styles.dateItem}>
              <MaterialCommunityIcons name="calendar-clock" size={16} color={COLORS.textSecondary} />
              <Text variant="bodySmall" style={styles.dateText}>
                Dibuat: {format(new Date(item.createdAt), 'dd MMM yyyy', { locale: id })}
              </Text>
            </View>
            <View style={styles.dateItem}>
              <MaterialCommunityIcons
                name="calendar-alert"
                size={16}
                color={status === 'OVERDUE' ? COLORS.neonPink : COLORS.textSecondary}
              />
              <Text
                variant="bodySmall"
                style={[styles.dateText, status === 'OVERDUE' && styles.overdueText]}
              >
                Jatuh tempo: {format(new Date(item.dueDate), 'dd MMM yyyy', { locale: id })}
              </Text>
            </View>
          </View>

          {item.paidAt && (
            <View style={styles.paidRow}>
              <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.neonGreen} />
              <Text variant="bodySmall" style={styles.paidText}>
                Dibayar: {format(new Date(item.paidAt), 'dd MMM yyyy HH:mm', { locale: id })}
              </Text>
            </View>
          )}

        {canPay && (
          <TouchableOpacity
            style={{ marginTop: 12, backgroundColor: COLORS.neonCyan, borderRadius: 8, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onPress={() => handlePayInvoice(item)}
            disabled={processingPayment || submittingOffline}
          >
            <MaterialCommunityIcons name="cash-multiple" size={18} color={COLORS.bgDark} />
            <Text style={{ color: COLORS.bgDark, fontWeight: 'bold', fontSize: 14 }}>Bayar Sekarang</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Fixed Header - Search & Filter */}
      <View style={styles.fixedHeader}>
        <View style={styles.searchWrapper}>
          <Searchbar
            placeholder="Cari nomor atau paket"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchbar}
            inputStyle={styles.searchInput}
            iconColor={COLORS.textSecondary}
          />
        </View>
        <View style={styles.filterGrid}>
          <Chip
            selected={!statusFilter}
            onPress={() => setStatusFilter(undefined)}
            style={[styles.filterChip, !statusFilter && styles.filterChipSelected]}
            textStyle={!statusFilter ? styles.filterLabelSelected : undefined}
          >
            Semua
          </Chip>
          <Chip
            selected={statusFilter === 'PENDING'}
            onPress={() => setStatusFilter('PENDING')}
            style={[styles.filterChip, statusFilter === 'PENDING' && styles.filterChipSelected]}
            textStyle={statusFilter === 'PENDING' ? styles.filterLabelSelected : undefined}
          >
            Belum Bayar
          </Chip>
          <Chip
            selected={statusFilter === 'PAID'}
            onPress={() => setStatusFilter('PAID')}
            style={[styles.filterChip, statusFilter === 'PAID' && styles.filterChipSelected]}
            textStyle={statusFilter === 'PAID' ? styles.filterLabelSelected : undefined}
          >
            Lunas
          </Chip>
          <Chip
            selected={statusFilter === 'OVERDUE'}
            onPress={() => setStatusFilter('OVERDUE')}
            style={[styles.filterChip, statusFilter === 'OVERDUE' && styles.filterChipSelected]}
            textStyle={statusFilter === 'OVERDUE' ? styles.filterLabelSelected : undefined}
          >
            Jatuh Tempo
          </Chip>
        </View>
      </View>

      {/* Invoice List */}
      <FlatList
        data={filteredInvoices}
        renderItem={renderInvoiceItem}
        keyExtractor={(item) => item.id}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="file-document-outline" size={64} color={COLORS.textSecondary} />
            <Text variant="bodyLarge" style={styles.emptyText}>
              Tidak ada tagihan
            </Text>
          </View>
        }
        contentContainerStyle={
          filteredInvoices.length === 0 
            ? styles.emptyList 
            : { paddingTop: 12, paddingBottom: 24 }
        }
      />

      {/* Payment Method Choice Dialog */}
      <Portal>
        <Dialog visible={paymentChoiceVisible} onDismiss={() => setPaymentChoiceVisible(false)} style={{ backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border }}>
          <Dialog.Title style={{ color: COLORS.textPrimary }}>Pilih Metode Pembayaran</Dialog.Title>
          <Dialog.Content>
            {selectedInvoice && (
              <View style={{ marginBottom: 16 }}>
                <Text variant="bodyMedium" style={{ marginBottom: 4, color: COLORS.textSecondary }}>
                  Invoice: {selectedInvoice.invoiceNumber}
                </Text>
                <Text variant="titleMedium" style={{ fontWeight: 'bold', color: COLORS.neonCyan }}>
                  Rp {selectedInvoice.amount.toLocaleString('id-ID')}
                </Text>
              </View>
            )}
            <View style={{ gap: 12 }}>
              <Button
                mode="contained"
                icon="credit-card-outline"
                onPress={handleChooseOnline}
                style={{ borderRadius: 8, backgroundColor: COLORS.neonCyan }}
                contentStyle={{ paddingVertical: 8 }}
                labelStyle={{ color: COLORS.bgDark, fontWeight: 'bold' }}
              >
                Bayar Online (Payment Gateway)
              </Button>
              <Button
                mode="outlined"
                icon="bank-transfer"
                onPress={handleChooseOffline}
                style={{ borderRadius: 8, borderColor: COLORS.neonViolet }}
                contentStyle={{ paddingVertical: 8 }}
                labelStyle={{ color: COLORS.neonViolet }}
              >
                Bayar Offline (Transfer Manual)
              </Button>
            </View>
            <Text variant="bodySmall" style={{ color: COLORS.textSecondary, marginTop: 12, textAlign: 'center' }}>
              Pembayaran offline memerlukan persetujuan admin
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPaymentChoiceVisible(false)} textColor={COLORS.textSecondary}>Batal</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Online Payment Gateway Selection Dialog */}
      <Portal>
        <Dialog visible={gatewayDialogVisible} onDismiss={() => setGatewayDialogVisible(false)} style={{ backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border }}>
          <Dialog.Title style={{ color: COLORS.textPrimary }}>Pilih Payment Gateway</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group onValueChange={setSelectedGateway} value={selectedGateway}>
              {paymentGateways.map((gateway) => (
                <RadioButton.Item
                  key={gateway.id}
                  label={gateway.name}
                  value={gateway.provider}
                  style={{ paddingVertical: 8 }}
                  labelStyle={{ color: COLORS.textPrimary }}
                  color={COLORS.neonCyan}
                  uncheckedColor={COLORS.textSecondary}
                />
              ))}
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setGatewayDialogVisible(false)} textColor={COLORS.textSecondary}>Batal</Button>
            <Button onPress={handleConfirmPayment} mode="contained" buttonColor={COLORS.neonCyan} textColor={COLORS.bgDark}>
              Lanjutkan
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Offline Payment Form Dialog */}
      <Portal>
        <Dialog
          visible={offlineDialogVisible}
          onDismiss={() => !submittingOffline && setOfflineDialogVisible(false)}
          style={{ maxHeight: '85%', backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border }}
        >
          <Dialog.Title style={{ color: COLORS.textPrimary }}>Pembayaran Offline</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}>
              {selectedInvoice && (
                <View style={styles.offlineInvoiceInfo}>
                  <Text variant="bodyMedium">Invoice: {selectedInvoice.invoiceNumber}</Text>
                  <Text variant="titleMedium" style={{ fontWeight: 'bold', color: COLORS.neonCyan }}>
                    Rp {selectedInvoice.amount.toLocaleString('id-ID')}
                  </Text>
                </View>
              )}

              {/* Bank/Method Selection */}
              <Text variant="labelLarge" style={styles.offlineLabel}>Metode Pembayaran *</Text>
              <View style={styles.bankGrid}>
                {BANK_OPTIONS.map((bank) => (
                  <Chip
                    key={bank}
                    selected={bankName === bank}
                    onPress={() => setBankName(bank)}
                    style={[
                      styles.bankChip,
                      bankName === bank && { backgroundColor: COLORS.neonCyan },
                    ]}
                    textStyle={bankName === bank ? { color: COLORS.bgDark } : { color: COLORS.textSecondary }}
                  >
                    {bank}
                  </Chip>
                ))}
              </View>
              <TextInput
                label="Atau ketik nama bank/metode lain"
                value={bankName}
                onChangeText={setBankName}
                mode="outlined"
                dense
                style={{ marginBottom: 12 }}
              />

              {/* Account Number */}
              <TextInput
                label="Nomor Rekening/E-Wallet (opsional)"
                value={accountNumber}
                onChangeText={setAccountNumber}
                mode="outlined"
                dense
                keyboardType="numeric"
                placeholder="Contoh: 1234567890"
                style={{ marginBottom: 12 }}
              />

              {/* Account Name */}
              <TextInput
                label="Nama Lengkap Pengirim *"
                value={accountName}
                onChangeText={setAccountName}
                mode="outlined"
                dense
                placeholder="Sesuai rekening/e-wallet"
                style={{ marginBottom: 12 }}
              />

              {/* Notes */}
              <TextInput
                label="Catatan (opsional)"
                value={paymentNotes}
                onChangeText={setPaymentNotes}
                mode="outlined"
                dense
                multiline
                numberOfLines={2}
                style={{ marginBottom: 16 }}
              />

              {/* Upload Proof */}
              <Text variant="labelLarge" style={styles.offlineLabel}>Bukti Transfer *</Text>
              <View style={styles.uploadRow}>
                <Button
                  mode="outlined"
                  icon="image"
                  onPress={handlePickImage}
                  style={{ flex: 1 }}
                  compact
                >
                  Galeri
                </Button>
                <Button
                  mode="outlined"
                  icon="camera"
                  onPress={handleTakePhoto}
                  style={{ flex: 1 }}
                  compact
                >
                  Kamera
                </Button>
              </View>

              {proofImage && (
                <View style={styles.proofPreviewContainer}>
                  <Image
                    source={{ uri: proofImage.uri }}
                    style={styles.proofPreview}
                    resizeMode="contain"
                  />
                  <TouchableOpacity
                    style={styles.removeProofBtn}
                    onPress={() => setProofImage(null)}
                  >
                    <MaterialCommunityIcons name="close-circle" size={24} color={COLORS.neonPink} />
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setOfflineDialogVisible(false)} disabled={submittingOffline} textColor={COLORS.textSecondary}>
              Batal
            </Button>
            <Button
              onPress={handleSubmitOfflinePayment}
              mode="contained"
              loading={submittingOffline}
              disabled={submittingOffline || !bankName.trim() || !accountName.trim() || !proofImage}
              buttonColor={COLORS.neonCyan}
              textColor={COLORS.bgDark}
            >
              Kirim Pembayaran
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
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
  fixedHeader: {
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    elevation: 0,
  },
  searchWrapper: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchbar: {
    borderRadius: 8,
    elevation: 0,
    backgroundColor: 'transparent',
  },
  searchInput: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
  },
  filterChip: {
    marginRight: 0,
    marginBottom: 0,
    backgroundColor: COLORS.bgElevated,
  },
  filterChipSelected: {
    backgroundColor: COLORS.neonCyan,
  },
  filterLabelSelected: {
    color: COLORS.bgDark,
    fontWeight: 'bold',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  invoiceInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  profileName: {
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  amountRow: {
    marginBottom: 12,
  },
  amount: {
    fontWeight: 'bold',
    color: COLORS.neonCyan,
  },
  dateRow: {
    gap: 8,
  },
  dateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    color: COLORS.textSecondary,
  },
  overdueText: {
    color: COLORS.neonPink,
  },
  paidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  paidText: {
    color: COLORS.neonGreen,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    marginTop: 16,
    color: COLORS.textSecondary,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  // Offline payment styles
  offlineInvoiceInfo: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: COLORS.bgElevated,
    borderRadius: 8,
    gap: 4,
  },
  offlineLabel: {
    marginBottom: 8,
    color: COLORS.textPrimary,
  },
  bankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  bankChip: {
    backgroundColor: COLORS.bgElevated,
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  proofPreviewContainer: {
    position: 'relative',
    alignItems: 'center',
    marginBottom: 8,
  },
  proofPreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: COLORS.bgElevated,
  },
  removeProofBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
  },
});
