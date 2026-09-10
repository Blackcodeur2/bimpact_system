import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/states.dart';
import '../../auth/application/session_controller.dart';
import '../../wallet/application/wallet_providers.dart';
import '../../wallet/presentation/widgets/balance_card.dart';
import '../domain/dashboard.dart';

/// Accueil conducteur (cahier §7.6) : situation financière et prochaines actions en moins de 5 secondes.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    final user = session is SignedIn ? session.user : null;
    final dashboard = ref.watch(dashboardProvider);

    Future<void> refresh() async {
      ref.invalidate(dashboardProvider);
      try {
        await ref.read(dashboardProvider.future);
      } catch (_) {
        // L'erreur est affichée par l'état de l'écran.
      }
    }

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(padding: EdgeInsets.zero, children: [
          _Header(
            firstName: user?.profile.firstName ?? '',
            initials: user?.initials ?? '',
            child: switch (dashboard) {
              AsyncData(:final value) => BalanceCard(
                  available: value.data.wallet.availableBalance,
                  reserved: value.data.wallet.reservedBalance,
                  paymentsEnabled: value.data.isEnabled('payments'),
                  onRecharge: () => context.push(Routes.recharge),
                  onHistory: () => context.go(Routes.transactions),
                ),
              AsyncError() => const SizedBox.shrink(),
              _ => const SkeletonBox(height: 176, radius: BRadius.xl),
            },
          ),
          Padding(
            padding: const EdgeInsets.all(BSpace.x4),
            child: dashboard.when(
              data: (loaded) => _DashboardBody(dashboard: loaded.data, cachedAt: loaded.cachedAt),
              loading: () => const SkeletonList(count: 3),
              error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(dashboardProvider)),
            ),
          ),
        ]),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.firstName, required this.initials, required this.child});
  final String firstName;
  final String initials;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      decoration: const BoxDecoration(
        gradient: BColors.brandGradient,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(BSpace.x4, BSpace.x3, BSpace.x4, BSpace.x6),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Bonjour $firstName 👋',
                      style: text.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text('Voici votre situation du jour', style: text.bodyMedium?.copyWith(color: Colors.white70)),
                ]),
              ),
              IconButton(
                tooltip: 'Notifications',
                onPressed: () => showComingSoon(context, 'Le centre de notifications'),
                icon: const Icon(Icons.notifications_none_rounded, color: Colors.white),
              ),
              InkWell(
                customBorder: const CircleBorder(),
                onTap: () => context.go(Routes.profile),
                child: CircleAvatar(
                  radius: 22,
                  backgroundColor: BColors.accent500,
                  child: Text(initials, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                ),
              ),
            ]),
            const SizedBox(height: BSpace.x4),
            child,
          ]),
        ),
      ),
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({required this.dashboard, required this.cachedAt});
  final Dashboard dashboard;
  final DateTime? cachedAt;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (cachedAt != null) ...[CachedDataNotice(cachedAt: cachedAt!), const SizedBox(height: BSpace.x3)],
      for (final alert in dashboard.alerts) ...[_AlertCard(alert: alert), const SizedBox(height: BSpace.x3)],
      const SizedBox(height: BSpace.x2),
      Text('Votre contribution', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: BSpace.x3),
      InkWell(
        borderRadius: BorderRadius.circular(BRadius.lg),
        onTap: () => context.push(Routes.contributions),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(BSpace.x4),
            child: Row(children: [
              Container(
                padding: const EdgeInsets.all(BSpace.x3),
                decoration: const BoxDecoration(color: BColors.growth50, shape: BoxShape.circle),
                child: const Icon(Icons.savings_rounded, color: BColors.growth600),
              ),
              const SizedBox(width: BSpace.x3),
              const Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Flexible(child: Text('Contribution quotidienne', style: TextStyle(fontWeight: FontWeight.w800))),
                    SizedBox(width: BSpace.x2),
                    Text('200 FCFA / jour', style: TextStyle(color: BColors.growth600, fontWeight: FontWeight.w700, fontSize: 12)),
                  ]),
                  SizedBox(height: BSpace.x1),
                  Text('Suivez vos cotisations et votre éligibilité aux tirages quotidiens.',
                      style: TextStyle(color: BColors.textMuted, fontSize: 13)),
                ]),
              ),
              const Icon(Icons.chevron_right_rounded, color: BColors.neutral400),
            ]),
          ),
        ),
      ),
      const SizedBox(height: BSpace.x6),
      Text('Raccourcis', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: BSpace.x3),
      GridView.count(
        crossAxisCount: 4,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: BSpace.x3,
        crossAxisSpacing: BSpace.x3,
        childAspectRatio: 0.78,
        children: [
          _Shortcut(
            icon: Icons.emoji_events_rounded,
            label: 'Tirages',
            enabled: dashboard.isEnabled('draws'),
            onTap: () => context.push(Routes.draws),
          ),
          _Shortcut(
            icon: Icons.school_rounded,
            label: 'Formation',
            enabled: dashboard.isEnabled('training'),
            onTap: () => context.push(Routes.training),
          ),
          _Shortcut(
            icon: Icons.lightbulb_rounded,
            label: 'Projets',
            enabled: dashboard.isEnabled('projects'),
            onTap: () => context.push(Routes.projects),
          ),
          _Shortcut(
            icon: Icons.health_and_safety_rounded,
            label: 'Accidents',
            enabled: false,
            onTap: () => showComingSoon(context, 'La déclaration d’accident'),
          ),
        ],
      ),
    ]);
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({required this.alert});
  final DashboardAlert alert;

  @override
  Widget build(BuildContext context) {
    final (background, foreground, icon) = switch (alert.severity) {
      'danger' => (BColors.danger50, BColors.danger500, Icons.error_rounded),
      'info' => (BColors.primary50, BColors.primary700, Icons.info_rounded),
      _ => (BColors.warning50, BColors.warning700, Icons.shield_outlined),
    };
    return Container(
      padding: const EdgeInsets.all(BSpace.x4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(BRadius.lg)),
      child: Row(children: [
        Icon(icon, color: foreground),
        const SizedBox(width: BSpace.x3),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(alert.title, style: TextStyle(color: foreground, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(alert.message, style: const TextStyle(color: BColors.text, fontSize: 13.5)),
          ]),
        ),
        if (alert.action != null)
          TextButton(
            onPressed: () => alert.action!.deepLink == Routes.kyc
                ? context.push(Routes.kyc)
                : showComingSoon(context, 'Cette action'),
            child: Text(alert.action!.label),
          ),
      ]),
    );
  }
}


class _Shortcut extends StatelessWidget {
  const _Shortcut({
    required this.icon,
    required this.label,
    required this.enabled,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(BRadius.md),
      onTap: onTap,
      child: Column(children: [
        Container(
          height: 56,
          width: 56,
          decoration: BoxDecoration(
            color: enabled ? BColors.primary50 : BColors.neutral100,
            borderRadius: BorderRadius.circular(BRadius.lg),
          ),
          child: Icon(icon, color: enabled ? BColors.primary500 : BColors.neutral400),
        ),
        const SizedBox(height: BSpace.x2),
        Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
        if (!enabled) const Text('Bientôt', style: TextStyle(fontSize: 10.5, color: BColors.textMuted)),
      ]),
    );
  }
}
