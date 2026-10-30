import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import 'api/api_client.dart';
import 'widgets/dialogs.dart';

/// Picks a file and uploads it as multipart. Returns the server response,
/// or null when nothing was picked or the upload failed (already toasted).
Future<dynamic> pickAndUpload(BuildContext context, String path, {String field = 'file', Map<String, dynamic>? fields, List<String>? extensions}) async {
  final picked = await FilePicker.platform.pickFiles(type: extensions == null ? FileType.any : FileType.custom, allowedExtensions: extensions);
  final file = picked?.files.single;
  if (file?.path == null || !context.mounted) return null;
  dynamic result;
  final ok = await runAction(context, () async {
    result = await ApiClient.instance.upload(path, file!.path!, field: field, filename: file.name, fields: fields);
  });
  return ok ? result : null;
}

/// Downloads a server-generated file and opens the share sheet so staff can
/// save it or send it on (WhatsApp, Drive, email).
Future<void> downloadAndShare(BuildContext context, String path, String filename, {Map<String, dynamic>? query}) async {
  String? local;
  final ok = await runAction(context, () async {
    local = await ApiClient.instance.download(path, filename, query: query);
  });
  if (!ok || local == null) return;
  await Share.shareXFiles([XFile(local!)], subject: filename);
}
