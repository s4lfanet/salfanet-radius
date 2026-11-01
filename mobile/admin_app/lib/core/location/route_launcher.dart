import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens Google Maps directions to [lat],[lng] starting from where this
/// phone is now.
///
/// Without a start point, Maps falls back to its own idea of "my location",
/// which is wrong or empty when GPS is off or Maps has no permission, so the
/// route starts somewhere else. This asks for GPS and the location
/// permission first, reads the position, and passes it as the origin.
Future<void> openRouteTo(BuildContext context, num lat, num lng) async {
  if (!await Geolocator.isLocationServiceEnabled()) {
    if (!context.mounted) return;
    final go = await _ask(
      context,
      title: 'Aktifkan GPS',
      message: 'GPS di HP ini mati, jadi titik awal rute tidak diketahui. Aktifkan GPS lalu ketuk Rute lagi.',
      action: 'Buka pengaturan GPS',
    );
    if (go) await Geolocator.openLocationSettings();
    return;
  }

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
  if (permission == LocationPermission.deniedForever) {
    if (!context.mounted) return;
    final go = await _ask(
      context,
      title: 'Izinkan akses lokasi',
      message: 'Izin lokasi untuk aplikasi ini ditolak. Izinkan di pengaturan aplikasi agar rute dimulai dari posisi Anda.',
      action: 'Buka pengaturan aplikasi',
    );
    if (go) await Geolocator.openAppSettings();
    return;
  }

  Position? here;
  if (permission == LocationPermission.always || permission == LocationPermission.whileInUse) {
    try {
      here = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 12)),
      );
    } catch (_) {
      here = await Geolocator.getLastKnownPosition();
    }
  }

  if (here == null && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Posisi Anda belum terbaca. Rute dibuka tanpa titik awal, periksa titik awalnya di Maps.')),
    );
  }
  final origin = here == null ? '' : '&origin=${here.latitude},${here.longitude}';
  await launchUrl(
    Uri.parse('https://www.google.com/maps/dir/?api=1$origin&destination=$lat,$lng&travelmode=driving'),
    mode: LaunchMode.externalApplication,
  );
}

Future<bool> _ask(BuildContext context, {required String title, required String message, required String action}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Nanti')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(action)),
      ],
    ),
  );
  return ok ?? false;
}
