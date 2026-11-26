import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';

/// Daftar path lampiran dari kolom JSON (`["/uploads/tickets/x.jpg"]`) atau list.
List<String> parseAttachments(dynamic raw) {
  if (raw == null) return const [];
  if (raw is List) return raw.map((e) => e.toString()).toList();
  if (raw is String && raw.trim().isNotEmpty) {
    try {
      final d = jsonDecode(raw);
      if (d is List) return d.map((e) => e.toString()).toList();
    } catch (_) {}
  }
  return const [];
}

/// Thumbnail foto/PDF lampiran tiket; path relatif terhadap server.
class TicketAttachments extends StatelessWidget {
  const TicketAttachments({super.key, required this.paths});
  final List<String> paths;

  String _resolve(String path) {
    if (path.startsWith('http')) return path;
    final base = ApiClient.instance.baseUrl.replaceAll(RegExp(r'/+$'), '');
    return '$base${path.startsWith('/') ? '' : '/'}$path';
  }

  @override
  Widget build(BuildContext context) {
    if (paths.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Wrap(spacing: 8, runSpacing: 8, children: [
        for (final p in paths) _Thumb(url: _resolve(p), isPdf: p.toLowerCase().endsWith('.pdf')),
      ]),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.url, required this.isPdf});
  final String url;
  final bool isPdf;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () {
        if (isPdf) {
          launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
          return;
        }
        Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => Scaffold(
            backgroundColor: Colors.black,
            appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white),
            body: Center(child: InteractiveViewer(child: Image.network(url))),
          ),
        ));
      },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 72,
          height: 72,
          color: c.surfaceContainerHighest,
          child: isPdf
              ? Icon(Icons.picture_as_pdf_rounded, color: c.error)
              : Image.network(url, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Icon(Icons.broken_image_outlined, color: c.onSurfaceVariant)),
        ),
      ),
    );
  }
}
