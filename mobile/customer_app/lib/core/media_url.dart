import 'api/api_client.dart';

/// The backend returns image paths as either a full URL or a path relative
/// to its own host (e.g. `/uploads/promo/x.jpg`) — resolve the relative case
/// against whichever server is currently configured.
String? resolveMediaUrl(String? path) {
  if (path == null || path.isEmpty) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  final base = ApiClient.instance.baseUrl;
  return path.startsWith('/') ? '$base$path' : '$base/$path';
}
