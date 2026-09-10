import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';

class _Slide {
  const _Slide({
    required this.image,
    required this.icon,
    required this.badge,
    required this.title,
    required this.body,
  });
  final String image;
  final IconData icon;
  final String badge;
  final String title;
  final String body;
}

const _slides = [
  _Slide(
    image: 'assets/images/onboarding_1.jpg',
    icon: Icons.two_wheeler_rounded,
    badge: '200 FCFA / jour',
    title: 'Votre route vers une nouvelle opportunité',
    body: 'Une petite contribution régulière vous ouvre l’accès au programme BENSKIN IMPACT.',
  ),
  _Slide(
    image: 'assets/images/onboarding_2.jpg',
    icon: Icons.school_rounded,
    badge: 'Formation 6 mois',
    title: 'Apprenez. Entreprenez. Recrutez.',
    body: 'Formation entrepreneuriale, accompagnement de projet et création d’activité.',
  ),
  _Slide(
    image: 'assets/images/onboarding_3.jpg',
    icon: Icons.groups_rounded,
    badge: 'Chaque franc tracé',
    title: 'Une communauté qui avance ensemble',
    body: 'Des tirages vérifiables, des décisions tracées et un portefeuille toujours consultable.',
  ),
];

/// Présentation en 3 écrans (cahier §7.2). La complétion est mémorisée localement, sans appel API.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _pages = PageController();
  int _index = 0;

  bool get _isLast => _index == _slides.length - 1;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<void> _finish(String route) async {
    await ref.read(onboardingDoneProvider.notifier).complete();
    if (mounted) context.go(route);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      backgroundColor: BColors.surface,
      body: SafeArea(
        child: Column(children: [
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(onPressed: () => _finish(Routes.login), child: const Text('Passer')),
          ),
          Expanded(
            child: PageView.builder(
              controller: _pages,
              itemCount: _slides.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (_, i) {
                final slide = _slides[i];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: BSpace.x6),
                  child: Column(children: [
                    Expanded(child: _Illustration(slide: slide)),
                    const SizedBox(height: BSpace.x8),
                    Text(slide.title,
                        textAlign: TextAlign.center,
                        style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: BColors.navy800)),
                    const SizedBox(height: BSpace.x3),
                    Text(slide.body,
                        textAlign: TextAlign.center, style: text.bodyLarge?.copyWith(color: BColors.textMuted, height: 1.45)),
                  ]),
                );
              },
            ),
          ),
          const SizedBox(height: BSpace.x6),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (var i = 0; i < _slides.length; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                margin: const EdgeInsets.symmetric(horizontal: 4),
                height: 8,
                width: i == _index ? 24 : 8,
                decoration: BoxDecoration(
                  color: i == _index ? BColors.primary500 : BColors.border,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
          ]),
          Padding(
            padding: const EdgeInsets.fromLTRB(BSpace.x6, BSpace.x6, BSpace.x6, BSpace.x4),
            child: Column(children: [
              FilledButton(
                onPressed: _isLast
                    ? () => _finish(Routes.register)
                    : () => _pages.nextPage(duration: const Duration(milliseconds: 280), curve: Curves.easeOut),
                child: Text(_isLast ? 'Commencer' : 'Suivant'),
              ),
              if (_isLast)
                TextButton(onPressed: () => _finish(Routes.login), child: const Text('J’ai déjà un compte')),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Illustration officielle pour chaque étape de l'onboarding.
class _Illustration extends StatelessWidget {
  const _Illustration({required this.slide});
  final _Slide slide;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: AspectRatio(
        aspectRatio: 1,
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Arrière-plan stylisé avec coins arrondis et ombre douce
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(BRadius.xl * 1.5),
                boxShadow: BShadow.raised,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(BRadius.xl * 1.5),
                child: Image.asset(
                  slide.image,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  height: double.infinity,
                  errorBuilder: (_, _, _) => Container(
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [BColors.primary50, BColors.growth50],
                      ),
                      borderRadius: BorderRadius.circular(BRadius.xl * 1.5),
                    ),
                    child: Center(
                      child: Container(
                        width: 150,
                        height: 150,
                        decoration: const BoxDecoration(
                          gradient: BColors.brandGradient,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(slide.icon, size: 80, color: Colors.white),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            // Badge mis en valeur en bas
            Positioned(
              bottom: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: BSpace.x4, vertical: BSpace.x2),
                decoration: BoxDecoration(
                  color: BColors.accent500,
                  borderRadius: BorderRadius.circular(999),
                  boxShadow: BShadow.card,
                ),
                child: Text(
                  slide.badge,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
