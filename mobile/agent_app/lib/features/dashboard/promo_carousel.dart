import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';

/// Banner promo yang sama dengan aplikasi pelanggan (diatur admin). Tidak tampil bila belum ada banner.
class PromoCarousel extends StatefulWidget {
  const PromoCarousel({super.key});

  @override
  State<PromoCarousel> createState() => _PromoCarouselState();
}

class _PromoCarouselState extends State<PromoCarousel> {
  final _controller = PageController();
  Timer? _timer;
  List<Map<String, dynamic>> _banners = [];
  int _page = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.get('/api/public/promo-banners');
      final list = ((res is Map ? res['banners'] : null) as List?)?.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() ?? [];
      if (!mounted) return;
      setState(() => _banners = list.where((b) => (b['imageUrl']?.toString() ?? '').isNotEmpty).toList());
      if (_banners.length > 1) {
        _timer = Timer.periodic(const Duration(seconds: 5), (_) {
          if (!mounted || !_controller.hasClients) return;
          _controller.animateToPage((_page + 1) % _banners.length, duration: const Duration(milliseconds: 400), curve: Curves.easeOut);
        });
      }
    } catch (_) {
      // Banner hanya pelengkap: gagal memuat berarti bagian ini disembunyikan.
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  String _url(String path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    final base = ApiClient.instance.baseUrl;
    return path.startsWith('/') ? '$base$path' : '$base/$path';
  }

  @override
  Widget build(BuildContext context) {
    if (_banners.isEmpty) return const SizedBox.shrink();
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: Gap.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(
            aspectRatio: 16 / 7,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppTheme.radiusBrand),
              child: Listener(
                onPointerDown: (_) {
                  _timer?.cancel();
                  _timer = null;
                },
                child: PageView.builder(
                  controller: _controller,
                  itemCount: _banners.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (context, i) {
                    final b = _banners[i];
                    final link = b['linkUrl']?.toString();
                    return Semantics(
                      label: b['title']?.toString() ?? 'Promo ${i + 1} dari ${_banners.length}',
                      button: link != null && link.isNotEmpty,
                      child: GestureDetector(
                        onTap: link == null || link.isEmpty
                            ? null
                            : () {
                                final uri = Uri.tryParse(link);
                                if (uri != null) launchUrl(uri, mode: LaunchMode.externalApplication);
                              },
                        child: Image.network(
                          _url(b['imageUrl'].toString()),
                          fit: BoxFit.cover,
                          width: double.infinity,
                          loadingBuilder: (_, child, p) => p == null ? child : Container(color: c.surfaceContainerHighest),
                          errorBuilder: (_, __, ___) => Container(color: c.surfaceContainerHighest),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
          if (_banners.length > 1) ...[
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < _banners.length; i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: i == _page ? 18 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: i == _page ? Theme.of(context).colorScheme.primary : c.onSurfaceVariant.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
