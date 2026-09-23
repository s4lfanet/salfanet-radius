import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../models/customer.dart';
import '../../models/ticket.dart';

class TicketProvider extends ChangeNotifier {
  List<Ticket> tickets = [];
  List<TicketCategory> categories = [];
  bool loading = false;
  String? error;

  Future<void> loadTickets() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/customer/tickets');
      final list = res['data'] as List? ?? const [];
      tickets = list.map((e) => Ticket.fromJson(e as Map<String, dynamic>)).toList();
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> loadCategories() async {
    if (categories.isNotEmpty) return;
    try {
      final res = await ApiClient.instance.get('/api/tickets/categories', query: {'isActive': 'true'});
      final list = res['data'] as List? ?? const [];
      categories = list.map((e) => TicketCategory.fromJson(e as Map<String, dynamic>)).toList();
      notifyListeners();
    } catch (_) {
      // Category picker just falls back to "no category" — not worth surfacing an error for.
    }
  }

  Future<Ticket> createTicket({
    required String subject,
    required String description,
    String? categoryId,
    String priority = 'MEDIUM',
  }) async {
    final res = await ApiClient.instance.post('/api/customer/tickets', data: {
      'subject': subject,
      'description': description,
      if (categoryId != null) 'categoryId': categoryId,
      'priority': priority,
    });
    final ticket = Ticket.fromJson(res);
    tickets = [ticket, ...tickets];
    notifyListeners();
    return ticket;
  }

  Future<Ticket?> fetchTicketDetail(String ticketId) async {
    final res = await ApiClient.instance.get('/api/tickets', query: {'id': ticketId});
    final list = res['data'] as List? ?? const [];
    if (list.isEmpty) return null;
    return Ticket.fromJson(list.first as Map<String, dynamic>);
  }

  Future<List<TicketMessage>> fetchMessages(String ticketId) async {
    final res = await ApiClient.instance.get('/api/tickets/messages', query: {'ticketId': ticketId});
    final list = res['data'] as List? ?? const [];
    return list.map((e) => TicketMessage.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<TicketMessage> sendMessage({
    required String ticketId,
    required String message,
    required CustomerProfile sender,
  }) async {
    final res = await ApiClient.instance.post('/api/tickets/messages', data: {
      'ticketId': ticketId,
      'senderType': 'CUSTOMER',
      'senderId': sender.id,
      'senderName': sender.name,
      'message': message,
    });
    return TicketMessage.fromJson(res);
  }
}
