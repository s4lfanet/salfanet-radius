import 'package:flutter/material.dart';

import '../storage/app_storage.dart';

/// Light / dark / follow-system choice, persisted per device.
class ThemeController extends ChangeNotifier {
  ThemeMode mode = ThemeMode.system;

  Future<void> restore() async {
    final saved = await AppStorage.instance.readThemeMode();
    mode = switch (saved) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
    notifyListeners();
  }

  Future<void> set(ThemeMode next) async {
    mode = next;
    notifyListeners();
    await AppStorage.instance.saveThemeMode(next.name);
  }
}
