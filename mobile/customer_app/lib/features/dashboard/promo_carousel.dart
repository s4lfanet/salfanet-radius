import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/media_url.dart';
import '../../models/promo_banner.dart';

/// Auto-advancing promo carousel — only renders when real banners exist
/// (an empty or fake carousel would be worse than no section at all).
class PromoCarousel extends StatefulWidget {
  const PromoCarousel({super.key, required this.banners});
  final List<PromoBanner> banners;

  @override
  State<PromoCarousel> createState() => _PromoCarouselState();
}

class _PromoCarouselState extends State<PromoCarousel> {
  final _controller = PageController();
  Timer? _timer;
  int _page = 0;

  @override
  void initState() {
    super.initState();
    if (widget.banners.length > 1) {
      _timer = Timer.periodic(const Duration(seconds: 5), (_) {
        if (!mounted) return;
        final next = (_page + 1) % widget.banners.length;
        _controller.animateToPage(next, duration: const Duration(milliseconds: 400), curve: Curves.easeOut);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.banners.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AspectRatio(
          aspectRatio: 16 / 7,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: PageView.builder(
              controller: _controller,
              itemCount: widget.banners.length,
              onPageChanged: (i) => setState(() => _page = i),
              itemBuilder: (context, index) {
                final banner = widget.banners[index];
                final url = resolveMediaUrl(banner.imageUrl);
                return GestureDetector(
                  onTap: banner.linkUrl == null
                      ? null
                      : () {
                          final uri = Uri.tryParse(banner.linkUrl!);
                          if (uri != null) launchUrl(uri, mode: LaunchMode.externalApplication);
                        },
                  child: url == null
                      ? Container(color: scheme.surfaceContainerHighest)
                      : CachedNetworkImage(
                          imageUrl: url,
                          fit: BoxFit.cover,
                          width: double.infinity,
                          placeholder: (_, __) => Container(color: scheme.surfaceContainerHighest),
                          errorWidget: (_, __, ___) => Container(color: scheme.surfaceContainerHighest),
                        ),
                );
              },
            ),
          ),
        ),
        if (widget.banners.length > 1) ...[
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(widget.banners.length, (i) {
              final active = i == _page;
              return AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: active ? 18 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color: active ? scheme.primary : scheme.outlineVariant,
                  borderRadius: BorderRadius.circular(999),
                ),
              );
            }),
          ),
        ],
      ],
    );
  }
}
