import 'package:flutter/material.dart';

import '../../core/update/app_updater.dart';
import '../dashboard/dashboard_screen.dart';
import '../more/more_screen.dart';
import '../sessions/sessions_screen.dart';
import '../tickets/tickets_screen.dart';
import '../vouchers/vouchers_screen.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  // Same tabs as the web portal: Ringkasan, Voucher, Sesi, Tiket; the rest is under Menu.
  static const _tabs = <Widget>[
    DashboardScreen(),
    VouchersScreen(),
    SessionsScreen(),
    TicketsScreen(),
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
    return Scaffold(
      body: IndexedStack(index: _index, children: _tabs),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(border: Border(top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant))),
        child: NavigationBar(
          height: 64,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          selectedIndex: _index,
          onDestinationSelected: (i) => setState(() => _index = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard_rounded), label: 'Ringkasan'),
            NavigationDestination(icon: Icon(Icons.confirmation_number_outlined), selectedIcon: Icon(Icons.confirmation_number_rounded), label: 'Voucher'),
            NavigationDestination(icon: Icon(Icons.wifi_outlined), selectedIcon: Icon(Icons.wifi_rounded), label: 'Sesi'),
            NavigationDestination(icon: Icon(Icons.support_agent_outlined), selectedIcon: Icon(Icons.support_agent_rounded), label: 'Tiket'),
            NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view_rounded), label: 'Menu'),
          ],
        ),
      ),
    );
  }
}
