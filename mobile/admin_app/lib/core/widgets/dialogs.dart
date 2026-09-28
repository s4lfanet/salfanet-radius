import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../theme/app_theme.dart';

/// Confirmation dialog used by every approve/reject/destructive action, so
/// they all read and behave the same (audit-003 #15). Returns true only on
/// explicit confirmation.
Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Ya, lanjutkan',
  bool destructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) {
      final c = destructive ? ctx.tone(Tone.danger) : ctx.colors.primary;
      return AlertDialog(
        title: Text(title),
        content: Text(message),
        actionsPadding: const EdgeInsets.fromLTRB(Gap.lg, 0, Gap.lg, Gap.lg),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            style: TextButton.styleFrom(foregroundColor: ctx.colors.onSurfaceVariant),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: c, foregroundColor: onColor(c), minimumSize: const Size(0, 42)),
            child: Text(confirmLabel),
          ),
        ],
      );
    },
  );
  return result == true;
}

/// Asks for a required reason (rejections). Returns null if cancelled or
/// left blank — the confirm button stays disabled until something is typed.
Future<String?> askReason(
  BuildContext context, {
  required String title,
  String label = 'Alasan',
  String confirmLabel = 'Tolak',
  bool required = true,
  bool destructive = true,
}) {
  return showDialog<String>(
    context: context,
    builder: (ctx) => _ReasonDialog(title: title, label: label, confirmLabel: confirmLabel, required: required, destructive: destructive),
  );
}

class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog({required this.title, required this.label, required this.confirmLabel, required this.required, required this.destructive});
  final String title;
  final String label;
  final String confirmLabel;
  final bool required;
  final bool destructive;

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = !widget.required || _controller.text.trim().isNotEmpty;
    final c = widget.destructive ? context.tone(Tone.danger) : context.colors.primary;
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        autofocus: true,
        maxLines: 3,
        minLines: 2,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(labelText: widget.label, hintText: widget.required ? 'Wajib diisi' : 'Opsional'),
      ),
      actionsPadding: const EdgeInsets.fromLTRB(Gap.lg, 0, Gap.lg, Gap.lg),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          style: TextButton.styleFrom(foregroundColor: context.colors.onSurfaceVariant),
          child: const Text('Batal'),
        ),
        FilledButton(
          onPressed: canSubmit ? () => Navigator.pop(context, _controller.text.trim()) : null,
          style: FilledButton.styleFrom(backgroundColor: c, foregroundColor: onColor(c), minimumSize: const Size(0, 42)),
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}

void showToast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// Runs an API action and reports the outcome as a toast: [success] on
/// completion, the server's own error message on failure. Returns whether
/// it succeeded so callers can close a sheet or reload.
Future<bool> runAction(BuildContext context, Future<void> Function() task, {String? success}) async {
  final messenger = ScaffoldMessenger.of(context);
  void toast(String m) => messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(m)));
  try {
    await task();
    if (success != null) toast(success);
    return true;
  } on ApiException catch (e) {
    toast(e.message);
    return false;
  }
}
