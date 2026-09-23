import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../media_url.dart';
import '../../models/company_info.dart';

/// Shows the operator's real logo when one is configured; otherwise an
/// initials mark built from their company name — never a generic stock icon
/// standing in for a logo that was never provided.
class CompanyLogo extends StatelessWidget {
  const CompanyLogo({super.key, required this.company, this.size = 64, this.radius = 18});

  final CompanyInfo? company;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final logoUrl = resolveMediaUrl(company?.logo);

    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: scheme.primaryContainer,
        borderRadius: BorderRadius.circular(radius),
      ),
      clipBehavior: Clip.antiAlias,
      child: logoUrl != null
          ? Padding(
              padding: EdgeInsets.all(size * 0.14),
              child: CachedNetworkImage(
                imageUrl: logoUrl,
                fit: BoxFit.contain,
                placeholder: (_, __) => SizedBox(
                  width: size * 0.4,
                  height: size * 0.4,
                  child: CircularProgressIndicator(strokeWidth: 2, color: scheme.onPrimaryContainer),
                ),
                errorWidget: (_, __, ___) => _initials(scheme),
              ),
            )
          : _initials(scheme),
    );
  }

  Widget _initials(ColorScheme scheme) {
    final name = company?.name.trim();
    final letter = (name != null && name.isNotEmpty) ? name[0].toUpperCase() : 'S';
    return Text(
      letter,
      style: TextStyle(fontSize: size * 0.42, fontWeight: FontWeight.bold, color: scheme.onPrimaryContainer),
    );
  }
}
