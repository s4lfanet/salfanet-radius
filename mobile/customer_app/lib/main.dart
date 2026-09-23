import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'core/api/api_client.dart';
import 'core/push/push_service.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_provider.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/otp_screen.dart';
import 'features/invoices/invoice_provider.dart';
import 'features/shell/main_shell.dart';
import 'features/tickets/ticket_provider.dart';
import 'features/wifi/wifi_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID', null);
  await PushService.instance.initialize();
  runApp(const CustomerApp());
}

class CustomerApp extends StatelessWidget {
  const CustomerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()..bootstrap()),
        ChangeNotifierProvider(create: (_) => InvoiceProvider()),
        ChangeNotifierProvider(create: (_) => WifiProvider()),
        ChangeNotifierProvider(create: (_) => TicketProvider()),
      ],
      child: MaterialApp(
        title: 'Salfanet',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        home: const _AuthGate(),
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
        return auth.pendingPhone != null ? const OtpScreen() : const LoginScreen();
      case AuthStatus.authenticated:
        return const MainShell();
    }
  }
}
