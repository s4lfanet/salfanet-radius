import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../models/ticket.dart';

class TicketProvider extends ChangeNotifier {
  List<Ticket> tickets = [];
  bool loading = false;
  String? error;
  String status = 'OPEN';

  static const statusOptions = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'];

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/tickets', query: {'status': status});
      if (res is List) {
        tickets = res.map((e) => Ticket.fromJson(e as Map<String, dynamic>)).toList();
      }
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  void setStatus(String s) {
    status = s;
    load();
  }

  Future<void> updateTicketStatus(String id, String newStatus) async {
    await ApiClient.instance.put('/api/tickets', data: {'id': id, 'status': newStatus});
    await load();
  }
}

class TicketMessagesProvider extends ChangeNotifier {
  TicketMessagesProvider(this.ticketId);
  final String ticketId;

  List<TicketMessage> messages = [];
  bool loading = false;
  bool sending = false;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.get('/api/tickets/messages', query: {'ticketId': ticketId, 'includeInternal': true});
      if (res is List) {
        messages = res.map((e) => TicketMessage.fromJson(e as Map<String, dynamic>)).toList();
      }
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> reply({required String senderName, required String message, bool isInternal = false}) async {
    sending = true;
    notifyListeners();
    try {
      await ApiClient.instance.post('/api/tickets/messages', data: {
        'ticketId': ticketId,
        'senderType': 'ADMIN',
        'senderName': senderName,
        'message': message,
        'isInternal': isInternal,
      });
      await load();
    } finally {
      sending = false;
      notifyListeners();
    }
  }
}
