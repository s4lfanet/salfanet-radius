import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/api/api_client.dart';

/// A payment gateway's checkout page inside the app.
///
/// Gateways (Midtrans, Xendit, Duitku, Tripay) only offer a web checkout,
/// so it is shown here instead of in the phone's browser. When the gateway
/// sends the customer back to the operator's own site, the payment step is
/// over: the screen closes and the caller reloads the invoice.
///
/// E-wallet buttons on those pages open the e-wallet app (gojek://,
/// dana://, intent://...), which a WebView cannot load itself; those are
/// handed to Android.
class PaymentWebViewScreen extends StatefulWidget {
  const PaymentWebViewScreen({super.key, required this.url, this.title = 'Pembayaran'});
  final String url;
  final String title;

  @override
  State<PaymentWebViewScreen> createState() => _PaymentWebViewScreenState();
}

class _PaymentWebViewScreenState extends State<PaymentWebViewScreen> {
  late final WebViewController _controller;
  int _progress = 0;
  String? _error;
  bool _leftOwnSite = false;

  String get _ownHost => Uri.tryParse(ApiClient.instance.baseUrl)?.host ?? '';

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) => setState(() => _progress = p),
          onPageStarted: (_) => setState(() => _error = null),
          onWebResourceError: (e) {
            if (e.isForMainFrame ?? true) setState(() => _error = 'Halaman pembayaran gagal dimuat (${e.description}).');
          },
          onNavigationRequest: _onNavigation,
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
    _leftOwnSite = Uri.tryParse(widget.url)?.host != _ownHost;
  }

  NavigationDecision _onNavigation(NavigationRequest request) {
    final uri = Uri.tryParse(request.url);
    if (uri == null) return NavigationDecision.prevent;

    if (uri.scheme != 'http' && uri.scheme != 'https') {
      _openExternal(uri);
      return NavigationDecision.prevent;
    }

    // Back on the operator's site after the gateway page: the gateway has
    // finished with the customer (paid, pending or cancelled). The app
    // shows the outcome itself instead of the web page.
    if (uri.host == _ownHost) {
      if (_leftOwnSite) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) Navigator.of(context).pop(true);
        });
        return NavigationDecision.prevent;
      }
    } else {
      _leftOwnSite = true;
    }
    return NavigationDecision.navigate;
  }

  /// e-wallet deep links. Android "intent://" URLs carry the real scheme and
  /// a browser fallback inside the fragment.
  Future<void> _openExternal(Uri uri) async {
    var target = uri;
    String? fallback;
    if (uri.scheme == 'intent') {
      final raw = uri.toString();
      final hash = raw.indexOf('#Intent;');
      final params = hash >= 0 ? raw.substring(hash + 8).split(';') : const <String>[];
      String? scheme;
      for (final p in params) {
        if (p.startsWith('scheme=')) scheme = p.substring(7);
        if (p.startsWith('S.browser_fallback_url=')) fallback = Uri.decodeComponent(p.substring(23));
      }
      final body = hash >= 0 ? raw.substring('intent://'.length, hash) : raw.substring('intent://'.length);
      if (scheme != null) target = Uri.parse('$scheme://$body');
    }
    final opened = await launchUrl(target, mode: LaunchMode.externalApplication).catchError((_) => false);
    if (!opened) {
      if (fallback != null) {
        _controller.loadRequest(Uri.parse(fallback));
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Aplikasi pembayaran itu tidak terpasang di HP ini. Pilih metode lain.')),
        );
      }
    }
  }

  Future<bool> _confirmLeave() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tutup pembayaran?'),
        content: const Text('Kalau Anda sudah membayar, status tagihan akan diperbarui otomatis setelah pembayaran diterima.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Lanjut bayar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Tutup')),
        ],
      ),
    );
    return leave ?? false;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else if (await _confirmLeave() && context.mounted) {
          Navigator.of(context).pop(true);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.title),
          leading: IconButton(
            tooltip: 'Tutup',
            icon: const Icon(Icons.close_rounded),
            onPressed: () async {
              if (await _confirmLeave() && context.mounted) Navigator.of(context).pop(true);
            },
          ),
          bottom: _progress < 100
              ? PreferredSize(
                  preferredSize: const Size.fromHeight(2),
                  child: LinearProgressIndicator(value: _progress / 100, minHeight: 2),
                )
              : null,
        ),
        body: _error == null
            ? WebViewWidget(controller: _controller)
            : Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.wifi_off_rounded, size: 44, color: Theme.of(context).colorScheme.onSurfaceVariant),
                      const SizedBox(height: 12),
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      OutlinedButton(onPressed: () => _controller.reload(), child: const Text('Muat ulang')),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}
