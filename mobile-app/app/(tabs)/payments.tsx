/**
 * Payments Screen — Neon Cyberpunk Theme
 */

import { View, StyleSheet, FlatList } from 'react-native';
import { Text, Chip, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePayments } from '@/hooks';
import { COLORS, PAYMENT_STATUS } from '@/constants';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Payment } from '@/services/payment';

export default function PaymentsScreen() {
  const { data, isLoading, refetch, isRefetching } = usePayments(1);

  const renderPaymentItem = ({ item }: { item: Payment }) => {
    const statusKey = item.status?.toUpperCase() || 'PENDING';
    const statusConfig = PAYMENT_STATUS[statusKey] || { label: statusKey, color: COLORS.textSecondary };

    return (
      <View style={styles.card}>
        <View style={styles.cardInner}>
          <View style={styles.cardHeader}>
            <View style={styles.paymentInfo}>
              <Text variant="titleMedium" style={styles.invoiceNumber}>
                {item.invoiceNumber || 'N/A'}
              </Text>
              <Text variant="bodySmall" style={styles.paymentMethod}>
                {item.method}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '20', borderColor: statusConfig.color }]}>
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
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
            <MaterialCommunityIcons name="calendar" size={16} color={COLORS.textSecondary} />
            <Text variant="bodySmall" style={styles.dateText}>
              {format(new Date(item.createdAt), 'dd MMM yyyy HH:mm', { locale: id })}
            </Text>
          </View>

          {item.confirmedAt && (
            <View style={styles.confirmedRow}>
              <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.neonGreen} />
              <Text variant="bodySmall" style={styles.confirmedText}>
                Dikonfirmasi: {format(new Date(item.confirmedAt), 'dd MMM yyyy HH:mm', { locale: id })}
              </Text>
            </View>
          )}

          {item.notes && (
            <Text variant="bodySmall" style={styles.notes}>
              Catatan: {item.notes}
            </Text>
          )}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.neonCyan} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data?.payments || []}
        renderItem={renderPaymentItem}
        keyExtractor={(item) => item.id}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="cash-multiple" size={64} color={COLORS.textSecondary} />
            <Text variant="bodyLarge" style={styles.emptyText}>
              Belum ada riwayat pembayaran
            </Text>
          </View>
        }
        contentContainerStyle={(data?.payments?.length ?? 0) === 0 ? styles.emptyList : { paddingTop: 16, paddingBottom: 24 }}
      />
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
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardInner: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  paymentInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  paymentMethod: {
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  amountRow: {
    marginBottom: 12,
  },
  amount: {
    fontWeight: 'bold',
    color: COLORS.neonCyan,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    color: COLORS.textSecondary,
  },
  confirmedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  confirmedText: {
    color: COLORS.neonGreen,
  },
  notes: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
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
});
