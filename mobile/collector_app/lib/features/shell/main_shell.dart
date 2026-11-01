import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/update/app_updater.dart';
import '../auth/auth_provider.dart';
import '../billing/billing_screen.dart';
import '../customers/customers_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../isolir/isolir_screen.dart';
import '../more/more_screen.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  // Same four tabs as the web portal's bottom bar (Ringkasan, Tagihan,
  // Pelanggan, Isolir); the rest sits under Menu, as on the web.
  static const _tabs = <Widget>[
    DashboardScreen(),
    BillingScreen(),
    CustomersScreen(),
    IsolirScreen(),
    MoreScreen(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      AppUpdater.checkOnLaunch(context);
    });
  }

  @override
  Widget build(BuildContext context) {
    context.watch<AuthProvider>();
    return Scaffold(
      body: IndexedStack(index: _index, children: _tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard_rounded), label: 'Ringkasan'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long_rounded), label: 'Tagihan'),
          NavigationDestination(icon: Icon(Icons.people_alt_outlined), selectedIcon: Icon(Icons.people_alt_rounded), label: 'Pelanggan'),
          NavigationDestination(icon: Icon(Icons.person_off_outlined), selectedIcon: Icon(Icons.person_off_rounded), label: 'Isolir'),
          NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view_rounded), label: 'Menu'),
        ],
      ),
    );
  }
}
