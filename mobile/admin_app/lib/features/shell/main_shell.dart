import 'package:flutter/material.dart';

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

  static const _screens = [DashboardScreen(), PppoeListScreen(), InvoiceListScreen(), MoreMenuScreen()];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard_rounded), label: 'Dashboard'),
          NavigationDestination(icon: Icon(Icons.people_alt_outlined), selectedIcon: Icon(Icons.people_alt_rounded), label: 'Pelanggan'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long_rounded), label: 'Tagihan'),
          NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view_rounded), label: 'Lainnya'),
        ],
      ),
    );
  }
}
