import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/states.dart';
import '../../core/widgets/sync_status.dart';

/// Navigation principale (BottomNavigation — cahier §6).
class MainShell extends StatelessWidget {
  const MainShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: shell,
      bottomNavigationBar: Column(mainAxisSize: MainAxisSize.min, children: [
        const SyncStatusBanner(),
        const OfflineBanner(),
        NavigationBar(
          selectedIndex: shell.currentIndex,
          onDestinationSelected: (index) => shell.goBranch(index, initialLocation: index == shell.currentIndex),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Accueil'),
            NavigationDestination(
              icon: Icon(Icons.account_balance_wallet_outlined),
              selectedIcon: Icon(Icons.account_balance_wallet_rounded),
              label: 'Portefeuille',
            ),
            NavigationDestination(icon: Icon(Icons.person_outline_rounded), selectedIcon: Icon(Icons.person_rounded), label: 'Profil'),
          ],
        ),
      ]),
    );
  }
}
