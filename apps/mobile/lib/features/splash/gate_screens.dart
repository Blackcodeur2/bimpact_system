import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/remote_config.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/brand.dart';

/// Maintenance annoncée par la configuration distante (cahier §7.1).
class MaintenanceScreen extends ConsumerStatefulWidget {
  const MaintenanceScreen({super.key});

  @override
  ConsumerState<MaintenanceScreen> createState() => _MaintenanceScreenState();
}

class _MaintenanceScreenState extends ConsumerState<MaintenanceScreen> {
  bool _checking = false;

  Future<void> _retry() async {
    setState(() => _checking = true);
    await ref.read(appGateProvider.notifier).check();
    if (mounted) setState(() => _checking = false);
  }

  @override
  Widget build(BuildContext context) {
    final gate = ref.watch(appGateProvider);
    final message = gate is GateMaintenance ? gate.message : null;
    return _GateLayout(
      icon: Icons.construction_rounded,
      title: 'Maintenance en cours',
      message: message ?? 'Le service est momentanément indisponible pour une opération de maintenance. Vos données sont conservées.',
      action: FilledButton(onPressed: _checking ? null : _retry, child: Text(_checking ? 'Vérification…' : 'Réessayer')),
    );
  }
}

/// Version trop ancienne : les règles de sécurité ou de calcul ont changé côté serveur.
class UpdateRequiredScreen extends ConsumerWidget {
  const UpdateRequiredScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gate = ref.watch(appGateProvider);
    final minVersion = gate is GateUpdateRequired ? gate.minVersion : null;
    final current = ref.watch(deviceIdentityProvider).appVersion;
    return _GateLayout(
      icon: Icons.system_update_rounded,
      title: 'Mise à jour nécessaire',
      message:
          'Cette version de l’application ($current) n’est plus prise en charge${minVersion == null ? '' : ' (version minimale : $minVersion)'}. '
          'Installez la dernière version depuis Google Play pour continuer.',
      action: OutlinedButton(
        style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white)),
        onPressed: () => ref.read(appGateProvider.notifier).check(),
        child: const Text('J’ai mis à jour'),
      ),
    );
  }
}

class _GateLayout extends StatelessWidget {
  const _GateLayout({required this.icon, required this.title, required this.message, required this.action});
  final IconData icon;
  final String title;
  final String message;
  final Widget action;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BColors.navy800,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(BSpace.x6),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const BrandLockup(markSize: 56),
              const SizedBox(height: BSpace.x8),
              Icon(icon, size: 56, color: BColors.accent500),
              const SizedBox(height: BSpace.x4),
              Text(title, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
              const SizedBox(height: BSpace.x3),
              Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, height: 1.45)),
              const SizedBox(height: BSpace.x8),
              SizedBox(width: double.infinity, child: action),
            ]),
          ),
        ),
      ),
    );
  }
}
