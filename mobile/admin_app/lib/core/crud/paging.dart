import '../api/api_client.dart';
import '../forms/field_spec.dart';

/// Total rows the server has for a list response, when it says so. Routes
/// put it at the top level (`total`, `totalCount`) or under `pagination`.
int? totalOf(dynamic res) {
  if (res is! Map) return null;
  final meta = res['pagination'] is Map ? res['pagination'] as Map : res;
  final v = meta['total'] ?? meta['totalCount'] ?? res['total'] ?? res['totalCount'];
  return v is num ? v.toInt() : int.tryParse('${v ?? ''}');
}

/// Whether another page exists after [page]. Uses the server's page count
/// or total when present; otherwise a full page means there may be more.
bool hasMorePages(dynamic res, {required int page, required int got, required int loaded, required int pageSize}) {
  if (got == 0) return false;
  if (res is Map) {
    final meta = res['pagination'] is Map ? res['pagination'] as Map : res;
    final pages = meta['totalPages'];
    if (pages is num) return page < pages;
  }
  final total = totalOf(res);
  if (total != null) return loaded < total;
  return got >= pageSize;
}

/// Pulls every page of a list. Several routes cap `limit` (customers at
/// 500), so one large request silently drops everything past the cap.
Future<List<Map<String, dynamic>>> fetchAllPages(
  String path, {
  String? listKey,
  Map<String, dynamic>? query,
  int pageSize = 500,
  int maxPages = 40,
  void Function(dynamic firstResponse)? onFirst,
}) async {
  final all = <Map<String, dynamic>>[];
  for (var page = 1; page <= maxPages; page++) {
    final res = await ApiClient.instance.get(path, query: {...?query, 'page': page, 'limit': pageSize});
    if (page == 1) onFirst?.call(res);
    final got = extractList(res, listKey: listKey);
    all.addAll(got);
    if (!hasMorePages(res, page: page, got: got.length, loaded: all.length, pageSize: pageSize)) break;
  }
  return all;
}
