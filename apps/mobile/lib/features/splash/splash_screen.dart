import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/brand.dart';
import '../auth/application/session_controller.dart';

/// Écran de démarrage (cahier §7.1) : restaure la session puis le routeur redirige.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future.wait([
        ref.read(sessionControllerProvider.notifier).restore(),
        Future<void>.delayed(const Duration(milliseconds: 700)),
      ]);
    });
  }

  @override
  Widget build(BuildContext context) {
    final version = ref.watch(deviceIdentityProvider).appVersion;
    return Scaffold(
      backgroundColor: BColors.navy900,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Visuel hero officiel en arrière-plan
          Image.asset(
            'assets/images/splash_hero.jpg',
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => const SizedBox.shrink(),
          ),
          // Dégradé sombre / navy pour assurer une lisibilité parfaite des textes et du logo
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
              const SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
              ),
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
