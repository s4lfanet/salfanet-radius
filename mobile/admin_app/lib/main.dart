import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'core/api/api_client.dart';
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

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID', null);
  final themeController = ThemeController();
  await themeController.restore();
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
  @override
  void initState() {
    super.initState();
    ApiClient.instance.onUnauthorized = () {
      context.read<AuthProvider>().forceLogout();
    };
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    switch (auth.status) {
      case AuthStatus.unknown:
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      case AuthStatus.unauthenticated:
        // The gate alone decides login vs 2FA; the login screen must not
        // also push the 2FA screen, or it shows up twice.
        return auth.pendingTfaToken != null ? const TwoFactorScreen() : const LoginScreen();
      case AuthStatus.authenticated:
        return const MainShell();
    }
  }
}
