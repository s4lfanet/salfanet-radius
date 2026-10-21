import 'package:flutter/material.dart';

import '../../core/guides/guides.dart';
import '../../core/update/app_updater.dart';

import '../dashboard/dashboard_screen.dart';
import '../invoices/invoice_list_screen.dart';
import '../more/more_menu_screen.dart';
import '../pppoe/pppoe_list_screen.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  // Each tab carries the web page it mirrors, for its Panduan button.
  static const _screens = [
    GuideScope(path: '/admin', child: DashboardScreen()),
    GuideScope(path: '/admin/pppoe/users', child: PppoeListScreen()),
    GuideScope(path: '/admin/invoices', child: InvoiceListScreen()),
    MoreMenuScreen(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) AppUpdater.checkOnLaunch(context);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(border: Border(top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant))),
        child: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard_rounded), label: 'Dashboard'),
          NavigationDestination(icon: Icon(Icons.people_alt_outlined), selectedIcon: Icon(Icons.people_alt_rounded), label: 'Pelanggan'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long_rounded), label: 'Tagihan'),
          NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view_rounded), label: 'Lainnya'),
        ],
        ),
      ),
    );
  }
}
