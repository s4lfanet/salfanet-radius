import '../api/api_client.dart';
import '../forms/field_spec.dart';

/// Option loaders for the reference data most forms pick from. Each hits
/// the same list endpoint the web panel's dropdowns use.
class Lookups {
  static Future<FieldOptions> _get(
    String path, {
    String? listKey,
    String valueKey = 'id',
    String Function(Map<String, dynamic>)? label,
    String labelKey = 'name',
    Map<String, dynamic>? query,
  }) => optionsFrom(
    () => ApiClient.instance.get(path, query: query),
    listKey: listKey,
    valueKey: valueKey,
    label: label,
    labelKey: labelKey,
  );

  static Future<FieldOptions> routers() =>
      _get('/api/network/routers', listKey: 'routers', label: (r) => '${r['name']}${r['nasname'] != null ? ' (${r['nasname']})' : ''}');
  static Future<FieldOptions> areas() => _get('/api/pppoe/areas', listKey: 'areas');
  static Future<FieldOptions> pppoeProfiles() => _get('/api/pppoe/profiles', listKey: 'profiles', label: (p) => '${p['name']} · ${_rp(p['price'])}');
  static Future<FieldOptions> hotspotProfiles() =>
      _get('/api/hotspot/profiles', listKey: 'profiles', label: (p) => '${p['name']} · ${_rp(p['sellingPrice'] ?? p['costPrice'])}');
  static Future<FieldOptions> agents() => _get('/api/hotspot/agents', listKey: 'agents');
  static Future<FieldOptions> technicians() =>
      _get('/api/admin/technicians', listKey: 'technicians', label: (t) => '${t['name']}${t['phoneNumber'] != null ? ' · ${t['phoneNumber']}' : ''}');
  static Future<FieldOptions> olts() => _get('/api/network/olts', listKey: 'olts');
  static Future<FieldOptions> odcs() => _get('/api/network/odcs', listKey: 'odcs');
  static Future<FieldOptions> odps() => _get('/api/network/odps', listKey: 'odps');
  static Future<FieldOptions> otbs() => _get('/api/network/otbs', listKey: 'otbs', query: {'limit': 500});
  static Future<FieldOptions> jointClosures() => _get('/api/network/joint-closures', listKey: 'data');
  static Future<FieldOptions> cables() =>
      _get('/api/network/cables', listKey: 'cables', query: {'limit': 500}, label: (c) => '${c['code'] ?? ''} ${c['name'] ?? ''}'.trim());
  static Future<FieldOptions> ticketCategories() => _get('/api/tickets/categories');
  static Future<FieldOptions> addonTypes() => _get('/api/addon-types', listKey: 'addons', label: (a) => '${a['name']} · ${_rp(a['price'])}');
  static Future<FieldOptions> ipPools() => _get('/api/admin/ippool', listKey: 'data', valueKey: 'pool_name', labelKey: 'pool_name');
  static Future<FieldOptions> keuanganCategories({String? type}) => _get(
    '/api/keuangan/categories',
    listKey: 'categories',
    query: {if (type != null) 'type': type},
    label: (c) => '${c['name']} (${c['type'] == 'INCOME' ? 'Masuk' : 'Keluar'})',
  );
  static Future<FieldOptions> vpnServers() => _get('/api/network/vpn-server', listKey: 'servers', label: (s) => '${s['name']} · ${s['host']}');
  static Future<FieldOptions> vpnClients() =>
      _get('/api/network/vpn-client', listKey: 'clients', label: (c) => '${c['name']}${c['vpnIp'] != null ? ' · ${c['vpnIp']}' : ''}');
  static Future<FieldOptions> whatsappTemplates() => _get('/api/whatsapp/templates', listKey: 'data');
  static Future<FieldOptions> pppoeUsers() =>
      _get('/api/pppoe/users', listKey: 'users', query: {'limit': 5000}, label: (u) => '${u['name'] ?? u['username']} · ${u['username']}');

  static String _rp(Object? v) {
    final n = v is num ? v : num.tryParse('${v ?? ''}');
    if (n == null) return '-';
    final s = n.round().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.');
    return 'Rp $s';
  }
}

/// Coercions for FieldSpec.transform.
Object? toIntOrNull(Object? v) => v == null || v == '' ? null : (v is num ? v.toInt() : int.tryParse(v.toString()));
