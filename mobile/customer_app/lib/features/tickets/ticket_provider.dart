import 'dart:io';
import 'package:dio/dio.dart' as dio;
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

  /// Uploads one attachment and returns the stored URL the ticket should
  /// reference. Server accepts JPG/PNG/WebP/PDF up to 10MB and validates by
  /// magic bytes, so a wrong file comes back as a plain error message.
  Future<String> uploadAttachment(File file) async {
    final form = dio.FormData.fromMap({
      'file': await dio.MultipartFile.fromFile(
        file.path,
        filename: file.path.split(Platform.pathSeparator).last,
      ),
    });
    final res = await ApiClient.instance.postForm('/api/customer/tickets/upload', form);
    final url = res['url']?.toString();
    if (url == null || url.isEmpty) {
      throw ApiException(res['error']?.toString() ?? 'Lampiran gagal diunggah.');
    }
    return url;
  }

  Future<Ticket> createTicket({
    required String subject,
    required String description,
    String? categoryId,
    String priority = 'MEDIUM',
    double? latitude,
    double? longitude,
    String? locationTag,
    List<String> attachments = const [],
  }) async {
    final res = await ApiClient.instance.post('/api/customer/tickets', data: {
      'subject': subject,
      'description': description,
      if (categoryId != null) 'categoryId': categoryId,
      'priority': priority,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
      if (locationTag != null && locationTag.isNotEmpty) 'locationTag': locationTag,
      if (attachments.isNotEmpty) 'attachments': attachments,
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
