import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator as RNActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Text, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants';
import { TicketService, TicketMessage } from '@/services/ticket';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { AuthService } from '@/services/auth';

const STATUS_CONFIG = {
  OPEN: { label: 'Terbuka', color: COLORS.neonBlue },
  IN_PROGRESS: { label: 'Diproses', color: COLORS.neonOrange },
  WAITING_CUSTOMER: { label: 'Menunggu', color: COLORS.neonViolet },
  RESOLVED: { label: 'Selesai', color: COLORS.neonGreen },
  CLOSED: { label: 'Ditutup', color: COLORS.textSecondary },
};

const PRIORITY_CONFIG = {
  LOW: { label: 'Rendah', color: '#6B7280' },
  MEDIUM: { label: 'Sedang', color: COLORS.neonBlue },
  HIGH: { label: 'Tinggi', color: COLORS.neonOrange },
  URGENT: { label: 'Mendesak', color: COLORS.neonPink },
};

export default function TicketDetailScreen() {
  const params = useLocalSearchParams();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [userName, setUserName] = useState('Customer');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadTicketData();
    loadUserName();
  }, [ticketId]);

  const loadUserName = async () => {
    try {
      const profile = await AuthService.getProfile();
      setUserName(profile.name || profile.username);
    } catch (error) {
      console.error('Load user name error:', error);
    }
  };

  const loadTicketData = async () => {
    try {
      const [ticketsData, messagesData] = await Promise.all([
        TicketService.getTickets(),
        TicketService.getMessages(ticketId),
      ]);

      const foundTicket = ticketsData.find((t) => t.id === ticketId);
      if (foundTicket) {
        setTicket(foundTicket);
      }
      setMessages(messagesData);
    } catch (error) {
      console.error('Load ticket data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;

    if (replyText.trim().length < 5) {
      Alert.alert('Error', 'Pesan minimal 5 karakter');
      return;
    }

    setSending(true);
    try {
      const result = await TicketService.sendMessage(ticketId, replyText.trim(), userName);

      if (result.success) {
        setReplyText('');
        // Reload messages
        const messagesData = await TicketService.getMessages(ticketId);
        setMessages(messagesData);
        // Scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        Alert.alert('Error', result.error || 'Gagal mengirim pesan');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Terjadi kesalahan');
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: TicketMessage }) => {
    const isCustomer = item.senderType === 'CUSTOMER';
    const isSystem = item.senderType === 'SYSTEM';

    return (
      <View
        style={[
          styles.messageContainer,
          isCustomer && styles.messageContainerCustomer,
          isSystem && styles.messageContainerSystem,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isCustomer && styles.messageBubbleCustomer,
            isSystem && styles.messageBubbleSystem,
          ]}
        >
          {!isCustomer && (
            <View style={styles.messageSender}>
              <MaterialCommunityIcons
                name={isSystem ? 'robot' : 'account-tie'}
                size={14}
                color={isSystem ? COLORS.neonBlue : COLORS.neonGreen}
              />
              <Text variant="bodySmall" style={styles.senderName}>
                {item.senderName}
              </Text>
            </View>
          )}
          <Text
            variant="bodyMedium"
            style={[
              styles.messageText,
              isCustomer && styles.messageTextCustomer,
              isSystem && styles.messageTextSystem,
            ]}
          >
            {item.message}
          </Text>
          <Text
            variant="bodySmall"
            style={[
              styles.messageTime,
              isCustomer && styles.messageTimeCustomer,
              isSystem && styles.messageTimeSystem,
            ]}
          >
            {format(new Date(item.createdAt), 'dd MMM, HH:mm', { locale: id })}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Detail Tiket' }} />
        <RNActivityIndicator size="large" color={COLORS.neonCyan} />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Detail Tiket' }} />
        <MaterialCommunityIcons name="ticket-outline" size={64} color={COLORS.textSecondary} />
        <Text variant="titleMedium" style={{ marginTop: 16, color: COLORS.textSecondary }}>
          Tiket tidak ditemukan
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, borderWidth: 1, borderColor: COLORS.neonCyan, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ color: COLORS.neonCyan, fontWeight: 'bold' }}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusConfig = STATUS_CONFIG[ticket.status];
  const priorityConfig = PRIORITY_CONFIG[ticket.priority];
  const isClosed = ticket.status === 'CLOSED';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: `Tiket #${ticket.ticketNumber}`,
        }}
      />

      {/* Header Info */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={{ backgroundColor: statusConfig.color, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
            <Text style={{ color: COLORS.bgDark, fontSize: 11, fontWeight: 'bold' }}>{statusConfig.label}</Text>
          </View>
          <View style={{ backgroundColor: priorityConfig.color, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{priorityConfig.label}</Text>
          </View>
          {ticket.category && (
            <View style={{ backgroundColor: ticket.category.color, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{ticket.category.name}</Text>
            </View>
          )}
        </View>
        <Text variant="titleMedium" style={styles.ticketSubject}>
          {ticket.subject}
        </Text>
        <Text variant="bodySmall" style={styles.ticketMeta}>
          Dibuat: {format(new Date(ticket.createdAt), 'dd MMMM yyyy, HH:mm', { locale: id })}
        </Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Reply Input */}
      {!isClosed && (
        <View style={styles.replyContainer}>
          <TextInput
            style={styles.replyInput}
            placeholder="Ketik balasan..."
            value={replyText}
            onChangeText={setReplyText}
            multiline
            maxLength={500}
          />
          <IconButton
            icon="send"
            size={24}
            iconColor={COLORS.bgDark}
            containerColor={replyText.trim() ? COLORS.neonCyan : COLORS.textSecondary}
            onPress={handleSendReply}
            disabled={!replyText.trim() || sending}
          />
        </View>
      )}

      {isClosed && (
        <View style={styles.closedNotice}>
          <MaterialCommunityIcons name="lock" size={20} color={COLORS.textSecondary} />
          <Text variant="bodyMedium" style={{ color: COLORS.textSecondary }}>
            Tiket ini sudah ditutup
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
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
  headerCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  ticketSubject: {
    fontWeight: '600',
    marginBottom: 8,
    color: COLORS.textPrimary,
  },
  ticketMeta: {
    color: COLORS.textSecondary,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageContainer: {
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  messageContainerCustomer: {
    alignItems: 'flex-end',
  },
  messageContainerSystem: {
    alignItems: 'center',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  messageBubbleCustomer: {
    backgroundColor: COLORS.neonCyan,
    borderColor: COLORS.neonCyan,
  },
  messageBubbleSystem: {
    backgroundColor: COLORS.bgElevated,
    borderColor: COLORS.border,
    maxWidth: '90%',
  },
  messageSender: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  senderName: {
    fontWeight: '600',
    color: COLORS.neonGreen,
  },
  messageText: {
    color: COLORS.textPrimary,
  },
  messageTextCustomer: {
    color: COLORS.bgDark,
  },
  messageTextSystem: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  messageTime: {
    marginTop: 6,
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  messageTimeCustomer: {
    color: 'rgba(10, 14, 26, 0.6)',
  },
  messageTimeSystem: {
    color: COLORS.textSecondary,
  },
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.bgCard,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  replyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    backgroundColor: COLORS.bgElevated,
    color: COLORS.textPrimary,
  },
  closedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: COLORS.bgCard,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
});
