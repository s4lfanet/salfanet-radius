import '../../core/api/api_client.dart';

/// Asks the same endpoint the web customer list polls for online state.
/// `online-status` checks radacct *and* live MikroTik /ppp/active (so a
/// customer whose RADIUS accounting has gone stale still reads online);
/// the plain list/detail endpoints used to check less than that, which is
/// why customers who were connected showed as offline in the app.
///
/// Returns null if the call fails, so callers keep whatever they had rather
/// than flipping everyone to offline on a network blip.
Future<Set<String>?> fetchOnlineUsernames(Iterable<String> usernames) async {
  final names = usernames.where((u) => u.isNotEmpty).toSet().toList();
  if (names.isEmpty) return <String>{};
  final online = <String>{};
  // Chunked: usernames go in the query string, and a few hundred of them in
  // one GET can exceed the reverse proxy's request-line limit (nginx: 8KB).
  const chunk = 80;
  try {
    for (var i = 0; i < names.length; i += chunk) {
      final part = names.sublist(i, i + chunk > names.length ? names.length : i + chunk);
      final res = await ApiClient.instance.get('/api/pppoe/users/online-status', query: {'usernames': part.join(',')});
      if (res is! Map<String, dynamic> || res['online'] is! List) return null;
      online.addAll((res['online'] as List).map((e) => e.toString()));
    }
    return online;
  } on ApiException catch (_) {
    return null;
  }
}
