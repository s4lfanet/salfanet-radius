import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/guides/guides.dart';
import '../../core/update/app_updater.dart';

import '../auth/auth_provider.dart';
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

  // Each tab carries the web page it mirrors (for its Panduan button) and
  // the permission its API checks: a role without it does not get the tab.
  static const _tabs = <(Widget, NavigationDestination, String?)>[
    (
      GuideScope(path: '/admin', child: DashboardScreen()),
      NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard_rounded), label: 'Dashboard'),
      null,
    ),
    (
      GuideScope(path: '/admin/pppoe/users', child: PppoeListScreen()),
      NavigationDestination(icon: Icon(Icons.people_alt_outlined), selectedIcon: Icon(Icons.people_alt_rounded), label: 'Pelanggan'),
      'customers.view',
    ),
    (
      GuideScope(path: '/admin/invoices', child: InvoiceListScreen()),
      NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long_rounded), label: 'Tagihan'),
      'invoices.view',
    ),
    (
      MoreMenuScreen(),
      NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view_rounded), label: 'Lainnya'),
      null,
    ),
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
    final user = context.watch<AuthProvider>().user;
    final tabs = [for (final t in _tabs) if (user?.can(t.$3) ?? true) t];
    final index = _index.clamp(0, tabs.length - 1);
    return Scaffold(
      body: IndexedStack(index: index, children: [for (final t in tabs) t.$1]),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(border: Border(top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant))),
        child: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [for (final t in tabs) t.$2],
        ),
      ),
    );
  }
}
