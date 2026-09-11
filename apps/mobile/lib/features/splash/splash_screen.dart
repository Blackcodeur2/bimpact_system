import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/analytics/analytics.dart';
import '../../core/config/remote_config.dart';
import '../../core/providers.dart';
import '../../core/security/app_lock.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/brand.dart';
import '../auth/application/session_controller.dart';

/// Écran de démarrage (cahier §7.1) : configuration distante (maintenance, version minimale),
/// verrouillage biométrique éventuel, puis restauration de la session. Le routeur redirige ensuite.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  Future<void> _start() async {
    ref.read(analyticsProvider).track('app.opened');
    await Future.wait([
      ref.read(appGateProvider.notifier).check(),
      Future<void>.delayed(const Duration(milliseconds: 700)),
    ]);
    // Verrouillé avant la restauration : les données du membre ne s'affichent jamais avant le déverrouillage.
    ref.read(appLockProvider.notifier).lockIfEnabled();
    await ref.read(sessionControllerProvider.notifier).restore();
  }

  @override
  Widget build(BuildContext context) {
    final version = ref.watch(deviceIdentityProvider).appVersion;
    return Scaffold(
      backgroundColor: BColors.navy900,
      body: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset('assets/images/splash_hero.jpg', fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox.shrink()),
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  BColors.navy900.withValues(alpha: 0.92),
                  BColors.navy800.withValues(alpha: 0.70),
                  BColors.navy900.withValues(alpha: 0.95),
                ],
                stops: const [0.0, 0.45, 0.85],
              ),
            ),
          ),
          SafeArea(
            child: Column(children: [
              const Spacer(flex: 3),
              const BrandLockup(markSize: 88),
              const SizedBox(height: BSpace.x4),
              const Tagline(),
              const Spacer(flex: 4),
              const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white)),
              const SizedBox(height: BSpace.x6),
              Text('Version $version', style: const TextStyle(color: Colors.white70, fontSize: 12)),
              const SizedBox(height: BSpace.x4),
            ]),
          ),
        ],
      ),
    );
  }
}
