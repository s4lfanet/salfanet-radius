import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';

/// Thumbnails for a ticket's uploaded photos/PDFs. Paths are server-relative
/// (/uploads/tickets/...), so they are resolved against the configured server.
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
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Lampiran (${paths.length})', style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final path in paths)
                _Thumb(url: _resolve(path), isPdf: path.toLowerCase().endsWith('.pdf')),
            ],
          ),
        ],
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.url, required this.isPdf});
  final String url;
  final bool isPdf;

  void _open(BuildContext context) {
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
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: () => _open(context),
      borderRadius: BorderRadius.circular(8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 72,
          height: 72,
          color: scheme.surfaceContainerHighest,
          child: isPdf
              ? Icon(Icons.picture_as_pdf_rounded, color: scheme.error)
              : Image.network(
                  url,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Icon(Icons.broken_image_outlined, color: scheme.onSurfaceVariant),
                ),
        ),
      ),
    );
  }
}
