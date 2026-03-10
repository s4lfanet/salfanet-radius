import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator as RNActivityIndicator,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants';
import { TicketService, Ticket } from '@/services/ticket';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

const STATUS_CONFIG = {
  OPEN: { label: 'Terbuka', color: COLORS.neonBlue, icon: 'ticket-outline' },
  IN_PROGRESS: { label: 'Diproses', color: COLORS.neonOrange, icon: 'progress-clock' },
  WAITING_CUSTOMER: { label: 'Menunggu', color: COLORS.neonViolet, icon: 'account-clock' },
  RESOLVED: { label: 'Selesai', color: COLORS.neonGreen, icon: 'check-circle' },
  CLOSED: { label: 'Ditutup', color: COLORS.textSecondary, icon: 'close-circle' },
};

const PRIORITY_CONFIG = {
  LOW: { label: 'Rendah', color: '#6B7280' },
  MEDIUM: { label: 'Sedang', color: COLORS.neonBlue },
  HIGH: { label: 'Tinggi', color: COLORS.neonOrange },
  URGENT: { label: 'Mendesak', color: COLORS.neonPink },
};

export default function TicketsScreen() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    try {
      const data = await TicketService.getTickets();
      setTickets(data);
    } catch (error) {
      console.error('Load tickets error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadTickets();
  };

  const handleCreateTicket = () => {
    router.push('/tickets/create' as any);
  };

  const handleTicketPress = (ticket: Ticket) => {
    router.push(`/tickets/${ticket.id}` as any);
  };

  const renderTicketItem = ({ item }: { item: Ticket }) => {
    const statusConfig = STATUS_CONFIG[item.status];
    const priorityConfig = PRIORITY_CONFIG[item.priority];

    return (
      <TouchableOpacity onPress={() => handleTicketPress(item)}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.ticketInfo}>
              <Text variant="bodySmall" style={styles.ticketNumber}>
                #{item.ticketNumber}
              </Text>
              <Text variant="titleMedium" style={styles.subject} numberOfLines={2}>
                {item.subject}
              </Text>
            </View>
            <MaterialCommunityIcons
              name={statusConfig.icon as any}
              size={32}
              color={statusConfig.color}
            />
          </View>

          <View style={styles.chipRow}>
            <View style={{ backgroundColor: statusConfig.color, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
              <Text style={{ color: COLORS.bgDark, fontSize: 11, fontWeight: 'bold' }}>{statusConfig.label}</Text>
            </View>
            <View style={{ backgroundColor: priorityConfig.color, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{priorityConfig.label}</Text>
            </View>
            {item.category && (
              <View style={{ backgroundColor: item.category.color, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{item.category.name}</Text>
              </View>
            )}
          </View>

          <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="calendar" size={14} color={COLORS.textSecondary} />
                <Text variant="bodySmall" style={styles.metaText}>
                  {format(new Date(item.createdAt), 'dd MMM yyyy, HH:mm', { locale: id })}
                </Text>
              </View>
              {item.lastResponseAt && (
                <View style={styles.metaItem}>
                  <MaterialCommunityIcons
                    name="message-reply"
                    size={14}
                    color={COLORS.textSecondary}
                  />
                  <Text variant="bodySmall" style={styles.metaText}>
                    Balasan terakhir
                  </Text>
                </View>
              )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Tiket Support' }} />
        <ActivityIndicator size="large" color={COLORS.neonCyan} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Tiket Support' }} />

      <FlatList
        data={tickets}
        renderItem={renderTicketItem}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={
          tickets.length === 0 ? styles.emptyList : { paddingVertical: 16 }
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="ticket-outline"
              size={64}
              color={COLORS.textSecondary}
            />
            <Text variant="titleMedium" style={styles.emptyTitle}>
              Belum Ada Tiket
            </Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              Buat tiket support untuk mendapatkan bantuan
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={handleCreateTicket}
      >
        <MaterialCommunityIcons name="plus" size={22} color={COLORS.bgDark} />
        <Text style={{ color: COLORS.bgDark, fontWeight: 'bold', fontSize: 14, marginLeft: 8 }}>Buat Tiket</Text>
      </TouchableOpacity>
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
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
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
  ticketInfo: {
    flex: 1,
    marginRight: 12,
  },
  ticketNumber: {
    color: COLORS.neonCyan,
    marginBottom: 4,
    fontWeight: '600',
  },
  subject: {
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: COLORS.textSecondary,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: COLORS.textSecondary,
  },
  emptyText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: COLORS.neonCyan,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
  },
});
