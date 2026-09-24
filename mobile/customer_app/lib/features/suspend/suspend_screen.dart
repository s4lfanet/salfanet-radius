import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/formatters.dart';
import '../../core/theme/feature_colors.dart';
import 'suspend_provider.dart';

class SuspendScreen extends StatefulWidget {
  const SuspendScreen({super.key});

  @override
  State<SuspendScreen> createState() => _SuspendScreenState();
}

class _SuspendScreenState extends State<SuspendScreen> {
  DateTimeRange? _range;
  final _reasonController = TextEditingController();
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SuspendProvider>().load();
    });
  }

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _range = picked);
  }

  Future<void> _submit() async {
    if (_range == null) {
      setState(() => _error = 'Pilih rentang tanggal terlebih dahulu');
      return;
    }
    setState(() => _error = null);
    try {
      await context.read<SuspendProvider>().requestSuspend(
            start: _range!.start,
            end: _range!.end,
            reason: _reasonController.text.trim(),
          );
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Gagal mengirim permintaan');
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<SuspendProvider>();
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: featureAppBar(title: 'Suspend Layanan', icon: Icons.pause_circle_outline_rounded, accent: FeatureColors.suspend),
      body: provider.loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (provider.current != null && (provider.current!.isPending || provider.current!.isApproved)) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            provider.current!.isPending ? 'Menunggu Persetujuan' : 'Suspend Disetujui',
                            style: TextStyle(fontWeight: FontWeight.bold, color: scheme.primary),
                          ),
                          const SizedBox(height: 6),
                          Text('${formatDate(provider.current!.startDate)} s.d. ${formatDate(provider.current!.endDate)}'),
                          if (provider.current!.reason != null) Text(provider.current!.reason!),
                          if (provider.current!.isPending) ...[
                            const SizedBox(height: 12),
                            OutlinedButton(
                              onPressed: provider.submitting ? null : () => context.read<SuspendProvider>().cancel(provider.current!.id),
                              child: const Text('Batalkan Permintaan'),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ] else ...[
                  Text(
                    'Jeda sementara langganan Anda (mis. saat bepergian). Maksimum 90 hari.',
                    style: TextStyle(color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: _pickRange,
                    icon: const Icon(Icons.date_range),
                    label: Text(_range == null ? 'Pilih Tanggal' : '${formatDate(_range!.start)} s.d. ${formatDate(_range!.end)}'),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _reasonController,
                    decoration: const InputDecoration(labelText: 'Alasan (opsional)'),
                    maxLines: 3,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: TextStyle(color: scheme.error)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: provider.submitting ? null : _submit,
                    child: provider.submitting
                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Ajukan Suspend'),
                  ),
                ],
              ],
            ),
    );
  }
}
