import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/forms/field_spec.dart' show extractList;
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';

/// Peta Jaringan: OLT, ODC, ODP, OTB / joint closure and customers that
/// have coordinates, with the cable path between them. Read-only; the
/// points are edited in the Jaringan menus. Mirrors the web's network map,
/// which reads the same endpoints.
class NetworkMapScreen extends StatefulWidget {
  const NetworkMapScreen({super.key});

  @override
  State<NetworkMapScreen> createState() => _NetworkMapScreenState();
}

enum _Kind { olt, odc, odp, node, customer }

const _kindLabel = {
  _Kind.olt: 'OLT',
  _Kind.odc: 'ODC',
  _Kind.odp: 'ODP',
  _Kind.node: 'OTB / JC',
  _Kind.customer: 'Pelanggan',
};

const _kindIcon = {
  _Kind.olt: Icons.dns_rounded,
  _Kind.odc: Icons.hub_rounded,
  _Kind.odp: Icons.device_hub_rounded,
  _Kind.node: Icons.merge_type_rounded,
  _Kind.customer: Icons.home_rounded,
};

const _kindTone = {
  _Kind.olt: Tone.violet,
  _Kind.odc: Tone.accent,
  _Kind.odp: Tone.success,
  _Kind.node: Tone.primary,
  _Kind.customer: Tone.primary,
};

class _Point {
  _Point({required this.id, required this.kind, required this.name, required this.pos, required this.status, required this.rows, this.subtype});
  final String id;
  final _Kind kind;
  final String name;
  final LatLng pos;
  final String status;
  final String? subtype;
  final List<(String, String)> rows;
}

double? _num(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

LatLng? _latLng(Map<String, dynamic> m) {
  final lat = _num(m['latitude']);
  final lng = _num(m['longitude']);
  if (lat == null || lng == null || (lat == 0 && lng == 0)) return null;
  if (lat.abs() > 90 || lng.abs() > 180) return null;
  return LatLng(lat, lng);
}

String _s(dynamic v) => v == null ? '' : v.toString();

class _NetworkMapScreenState extends State<NetworkMapScreen> {
  final _map = MapController();
  bool _loading = true;
  final List<String> _errors = [];
  List<_Point> _points = [];
  List<(LatLng, LatLng, _Kind)> _lines = [];
  final Set<_Kind> _shown = {..._Kind.values};
  bool _showLines = true;
  bool _satellite = false;
  LatLng? _me;
  bool _locating = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<dynamic> _get(String path, String what) async {
    try {
      return await ApiClient.instance.get(path);
    } catch (e) {
      _errors.add('$what: ${e is ApiException ? e.message : 'gagal dimuat'}');
      return null;
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _errors.clear();
    });
    final res = await Future.wait([
      _get('/api/network/olts', 'OLT'),
      _get('/api/network/odcs', 'ODC'),
      _get('/api/network/odps', 'ODP'),
      _get('/api/network/nodes?limit=2000', 'OTB / JC'),
      _get('/api/customers/with-location?limit=2000', 'Pelanggan'),
    ]);
    if (!mounted) return;

    final points = <_Point>[];
    final byId = <String, _Point>{};
    final lines = <(LatLng, LatLng, _Kind)>[];
    void add(_Point p) {
      points.add(p);
      byId[p.id] = p;
    }

    final olts = extractList(res[0], listKey: 'olts');
    for (final o in olts) {
      final pos = _latLng(o);
      if (pos == null) continue;
      add(_Point(
        id: _s(o['id']),
        kind: _Kind.olt,
        name: _s(o['name']),
        pos: pos,
        status: _s(o['status']),
        rows: [
          ('IP', _s(o['ipAddress'])),
          if (o['vendor'] != null) ('Vendor', '${_s(o['vendor'])} ${_s(o['model'])}'.trim()),
          ('ONU online', _s(o['onlineOnu'] ?? 0)),
          ('ONU offline', _s(o['offlineOnu'] ?? 0)),
        ],
      ));
    }
    final odcs = extractList(res[1], listKey: 'odcs');
    for (final o in odcs) {
      final pos = _latLng(o);
      if (pos == null) continue;
      add(_Point(
        id: _s(o['id']),
        kind: _Kind.odc,
        name: _s(o['name']),
        pos: pos,
        status: _s(o['status']),
        rows: [
          if (o['olt'] is Map) ('OLT', _s((o['olt'] as Map)['name'])),
          ('PON port', _s(o['ponPort'])),
          ('Jumlah port', _s(o['portCount'])),
        ],
      ));
    }
    final odps = extractList(res[2], listKey: 'odps');
    for (final o in odps) {
      final pos = _latLng(o);
      if (pos == null) continue;
      add(_Point(
        id: _s(o['id']),
        kind: _Kind.odp,
        name: _s(o['name']),
        pos: pos,
        status: _s(o['status']),
        rows: [
          if (o['odc'] is Map) ('ODC', _s((o['odc'] as Map)['name'])),
          if (o['parentOdp'] is Map) ('ODP induk', _s((o['parentOdp'] as Map)['name'])),
          if (o['olt'] is Map) ('OLT', _s((o['olt'] as Map)['name'])),
          ('Jumlah port', _s(o['portCount'])),
        ],
      ));
    }
    // network_nodes holds OTB and joint closures (and nodes added on the web's
    // unified map). Skip one that is already on the map as an OLT/ODC/ODP.
    final nodes = extractList(res[3], listKey: 'data');
    for (final n in nodes) {
      final pos = _latLng(n);
      if (pos == null) continue;
      final type = _s(n['type']);
      final name = _s(n['name']);
      final dup = points.any((p) => p.kind != _Kind.customer && p.name == name && (p.pos.latitude - pos.latitude).abs() < 1e-5 && (p.pos.longitude - pos.longitude).abs() < 1e-5);
      if (dup) continue;
      add(_Point(
        id: _s(n['id']),
        kind: switch (type) { 'OLT' => _Kind.olt, 'ODC' => _Kind.odc, 'ODP' => _Kind.odp, _ => _Kind.node },
        subtype: type == 'JOINT_CLOSURE' ? 'Joint Closure' : type,
        name: name.isEmpty ? _s(n['code']) : name,
        pos: pos,
        status: _s(n['status']),
        rows: [
          if (_s(n['code']).isNotEmpty) ('Kode', _s(n['code'])),
          ('Jenis', type == 'JOINT_CLOSURE' ? 'Joint Closure' : type),
          if (_s(n['address']).isNotEmpty) ('Alamat', _s(n['address'])),
        ],
      ));
    }
    final customers = extractList(res[4], listKey: 'data');
    for (final c in customers) {
      final pos = _latLng(c);
      if (pos == null) continue;
      final p = _Point(
        id: 'c:${_s(c['id'])}',
        kind: _Kind.customer,
        name: _s(c['name']).isEmpty ? _s(c['username']) : _s(c['name']),
        pos: pos,
        status: _s(c['status']),
        rows: [
          ('Username', _s(c['username'])),
          ('Paket', _s(c['pppoe_profiles'])),
          if (_s(c['odpName']).isNotEmpty) ('ODP', _s(c['odpName'])),
          if (_s(c['address']).isNotEmpty) ('Alamat', _s(c['address'])),
        ],
      );
      add(p);
      final odp = c['odpCoordinates'];
      if (odp is Map) {
        final to = _latLng(Map<String, dynamic>.from(odp));
        if (to != null) lines.add((pos, to, _Kind.customer));
      }
    }

    // Cable path: ODC → OLT, ODP → parent ODP / ODC / OLT.
    for (final o in odcs) {
      final from = byId[_s(o['id'])];
      final to = byId[_s(o['oltId'])];
      if (from != null && to != null) lines.add((from.pos, to.pos, _Kind.odc));
    }
    for (final o in odps) {
      final from = byId[_s(o['id'])];
      final to = byId[_s(o['parentOdpId'])] ?? byId[_s(o['odcId'])] ?? byId[_s(o['oltId'])];
      if (from != null && to != null) lines.add((from.pos, to.pos, _Kind.odp));
    }
    for (final n in nodes) {
      final from = byId[_s(n['id'])];
      final to = byId[_s(n['upstreamId'])];
      if (from != null && to != null) lines.add((from.pos, to.pos, _Kind.node));
    }

    setState(() {
      _points = points;
      _lines = lines;
      _loading = false;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _fitAll());
  }

  List<_Point> get _visible => _points.where((p) => _shown.contains(p.kind)).toList();

  void _fitAll() {
    final pts = _visible.map((p) => p.pos).toList();
    if (pts.isEmpty) return;
    try {
      if (pts.length == 1) {
        _map.move(pts.first, 16);
      } else {
        _map.fitCamera(CameraFit.coordinates(coordinates: pts, padding: const EdgeInsets.fromLTRB(40, 120, 40, 40), maxZoom: 17));
      }
    } catch (_) {
      // Map not laid out yet.
    }
  }

  Future<void> _locateMe() async {
    setState(() => _locating = true);
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        throw Exception('Izin lokasi ditolak.');
      }
      final pos = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)));
      final me = LatLng(pos.latitude, pos.longitude);
      if (!mounted) return;
      setState(() => _me = me);
      _map.move(me, 17);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is TimeoutException ? 'Lokasi belum didapat. Coba di tempat terbuka.' : e.toString().replaceFirst('Exception: ', ''))));
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Color _statusColor(BuildContext context, _Point p) {
    switch (p.status.toLowerCase()) {
      case 'active':
      case 'online':
        return context.tone(_kindTone[p.kind]!);
      case 'isolated':
      case 'maintenance':
        return context.tone(Tone.warning);
      case 'stop':
      case 'blocked':
      case 'damaged':
      case 'offline':
        return context.tone(Tone.danger);
      default:
        return context.tone(Tone.neutral);
    }
  }

  void _openPoint(_Point p) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        final text = Theme.of(ctx).textTheme;
        final muted = Theme.of(ctx).colorScheme.onSurfaceVariant;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(_kindIcon[p.kind], color: _statusColor(ctx, p)),
                    const SizedBox(width: 10),
                    Expanded(child: Text(p.name.isEmpty ? '-' : p.name, style: text.titleMedium)),
                  ],
                ),
                const SizedBox(height: 4),
                Text('${p.subtype ?? _kindLabel[p.kind]} · ${p.status.isEmpty ? '-' : p.status}', style: text.bodySmall?.copyWith(color: muted)),
                const SizedBox(height: 12),
                for (final (k, v) in p.rows)
                  if (v.trim().isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(width: 110, child: Text(k, style: text.bodySmall?.copyWith(color: muted))),
                          Expanded(child: Text(v, style: text.bodyMedium)),
                        ],
                      ),
                    ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: [
                      SizedBox(width: 110, child: Text('Koordinat', style: text.bodySmall?.copyWith(color: muted))),
                      Expanded(
                        child: Text('${p.pos.latitude.toStringAsFixed(6)}, ${p.pos.longitude.toStringAsFixed(6)}', style: text.bodyMedium),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => launchUrl(
                      Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${p.pos.latitude},${p.pos.longitude}'),
                      mode: LaunchMode.externalApplication,
                    ),
                    icon: const Icon(Icons.directions_rounded),
                    label: const Text('Petunjuk arah'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _marker(BuildContext context, _Point p) {
    final color = _statusColor(context, p);
    if (p.kind == _Kind.customer) {
      return GestureDetector(
        onTap: () => _openPoint(p),
        child: Container(
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 3)],
          ),
        ),
      );
    }
    return GestureDetector(
      onTap: () => _openPoint(p),
      child: Container(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 4)],
        ),
        child: Icon(_kindIcon[p.kind], color: Colors.white, size: 18),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final visible = _visible;
    final counts = {for (final k in _Kind.values) k: _points.where((p) => p.kind == k).length};
    final lineColor = scheme.primary.withValues(alpha: 0.55);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Peta Jaringan'),
        actions: [
          IconButton(
            tooltip: _satellite ? 'Peta jalan' : 'Citra satelit',
            icon: Icon(_satellite ? Icons.map_outlined : Icons.satellite_alt_rounded),
            onPressed: () => setState(() => _satellite = !_satellite),
          ),
          IconButton(
            tooltip: _showLines ? 'Sembunyikan jalur kabel' : 'Tampilkan jalur kabel',
            icon: Icon(Icons.cable_rounded, color: _showLines ? null : scheme.onSurfaceVariant.withValues(alpha: 0.5)),
            onPressed: () => setState(() => _showLines = !_showLines),
          ),
          IconButton(tooltip: 'Muat ulang', icon: const Icon(Icons.refresh_rounded), onPressed: _loading ? null : _load),
        ],
      ),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _map,
            options: const MapOptions(
              initialCenter: LatLng(-2.5, 118),
              initialZoom: 5,
              interactionOptions: InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
            ),
            children: [
              // Same tile sources as the web map.
              if (_satellite)
                TileLayer(
                  urlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                  userAgentPackageName: 'id.my.salfa.admin_app',
                  maxNativeZoom: 18,
                )
              else
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'id.my.salfa.admin_app',
                  maxNativeZoom: 19,
                ),
              if (_showLines)
                PolylineLayer(
                  polylines: [
                    for (final (a, b, kind) in _lines)
                      if (_shown.contains(kind))
                        Polyline(
                          points: [a, b],
                          strokeWidth: kind == _Kind.customer ? 1.5 : 3,
                          color: kind == _Kind.customer ? lineColor.withValues(alpha: 0.35) : lineColor,
                        ),
                  ],
                ),
              MarkerLayer(
                markers: [
                  for (final p in visible.where((p) => p.kind == _Kind.customer))
                    Marker(point: p.pos, width: 16, height: 16, child: _marker(context, p)),
                  for (final p in visible.where((p) => p.kind != _Kind.customer))
                    Marker(point: p.pos, width: 34, height: 34, child: _marker(context, p)),
                  if (_me != null)
                    Marker(
                      point: _me!,
                      width: 22,
                      height: 22,
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.blue,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 3),
                          boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 4)],
                        ),
                      ),
                    ),
                ],
              ),
              RichAttributionWidget(attributions: [TextSourceAttribution(_satellite ? 'Esri World Imagery' : 'OpenStreetMap contributors')]),
            ],
          ),
          // Filter by kind, with counts.
          Positioned(
            left: 0,
            right: 0,
            top: 8,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  for (final k in _Kind.values)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: FilterChip(
                        avatar: Icon(_kindIcon[k], size: 16, color: context.tone(_kindTone[k]!)),
                        label: Text('${_kindLabel[k]} ${counts[k]}'),
                        selected: _shown.contains(k),
                        showCheckmark: false,
                        backgroundColor: scheme.surface,
                        selectedColor: scheme.secondaryContainer,
                        elevation: 2,
                        onSelected: (on) => setState(() => on ? _shown.add(k) : _shown.remove(k)),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (_loading) const Positioned(left: 0, right: 0, top: 0, child: LinearProgressIndicator()),
          if (!_loading && _points.isEmpty)
            Positioned.fill(
              child: ColoredBox(
                color: scheme.surface.withValues(alpha: 0.9),
                child: _errors.isNotEmpty
                    ? ErrorView(message: _errors.join('\n'), onRetry: _load)
                    : const EmptyState(
                        icon: Icons.map_outlined,
                        message: 'Belum ada titik di peta',
                        hint: 'Isi koordinat OLT, ODC, ODP atau pelanggan agar muncul di sini.',
                      ),
              ),
            ),
          if (!_loading && _points.isNotEmpty && _errors.isNotEmpty)
            Positioned(
              left: 12,
              right: 12,
              bottom: 12,
              child: Material(
                color: scheme.errorContainer,
                borderRadius: BorderRadius.circular(10),
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Text('Sebagian data tidak tampil:\n${_errors.join('\n')}', style: TextStyle(color: scheme.onErrorContainer, fontSize: 12)),
                ),
              ),
            ),
        ],
      ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FloatingActionButton.small(
            heroTag: 'fit',
            tooltip: 'Tampilkan semua titik',
            onPressed: _fitAll,
            child: const Icon(Icons.zoom_out_map_rounded),
          ),
          const SizedBox(height: 10),
          FloatingActionButton.small(
            heroTag: 'me',
            tooltip: 'Lokasi saya',
            onPressed: _locating ? null : _locateMe,
            child: _locating
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.my_location_rounded),
          ),
        ],
      ),
    );
  }
}
