import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'core/api/api_client.dart';
import 'core/push/push_service.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'features/auth/auth_provider.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/two_factor_screen.dart';
import 'features/dashboard/dashboard_provider.dart';
import 'features/invoices/invoice_provider.dart';
import 'features/notifications/notifications_provider.dart';
import 'features/pppoe/pppoe_provider.dart';
import 'features/registrations/registration_provider.dart';
import 'features/shell/main_shell.dart';
import 'features/splash/splash_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID', null);
  final themeController = ThemeController();
  await themeController.restore();
  await PushService.instance.initialize();
  runApp(AdminApp(themeController: themeController));
}

class AdminApp extends StatelessWidget {
  const AdminApp({super.key, required this.themeController});
  final ThemeController themeController;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: themeController),
        ChangeNotifierProvider(create: (_) => AuthProvider()..bootstrap()),
        ChangeNotifierProvider(create: (_) => DashboardProvider()),
        ChangeNotifierProvider(create: (_) => PppoeProvider()),
        ChangeNotifierProvider(create: (_) => InvoiceProvider()),
        ChangeNotifierProvider(create: (_) => RegistrationProvider()),
        ChangeNotifierProvider(create: (_) => NotificationsProvider()),
      ],
      child: Consumer<ThemeController>(
        builder: (context, theme, _) => MaterialApp(
          title: 'Salfanet Admin',
          navigatorKey: PushService.instance.navigatorKey,
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: theme.mode,
          home: const _AuthGate(),
        ),
      ),
    );
  }
}

class _AuthGate extends StatefulWidget {
  const _AuthGate();

  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  // Splash stays up this long even when auth resolves instantly, so the
  // opening motion reads once instead of flickering by.
  bool _splashHeld = false;

  @override
  void initState() {
    super.initState();
    ApiClient.instance.onUnauthorized = () {
      context.read<AuthProvider>().forceLogout();
    };
    Timer(const Duration(milliseconds: 1700), () {
      if (mounted) setState(() => _splashHeld = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final Widget child;
    if (!_splashHeld || auth.status == AuthStatus.unknown) {
      child = const SplashScreen(key: ValueKey('splash'));
    } else if (auth.status == AuthStatus.unauthenticated) {
      // The gate alone decides login vs 2FA; the login screen must not
      // also push the 2FA screen, or it shows up twice.
      child = auth.pendingTfaToken != null
          ? const TwoFactorScreen(key: ValueKey('tfa'))
          : const LoginScreen(key: ValueKey('login'));
    } else {
      child = const MainShell(key: ValueKey('shell'));
    }
    return AnimatedSwitcher(duration: const Duration(milliseconds: 350), child: child);
  }
}
