import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/money_format.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/states.dart';
import '../draws_data.dart';

/// Tirages (cahier §7.11) : prochain tirage, éligibilité réelle du membre, résultats publiés.
class DrawsScreen extends ConsumerWidget {
  const DrawsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final next = ref.watch(nextDrawProvider);
    final published = ref.watch(publishedDrawsProvider);
    final text = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: BColors.background,
      appBar: AppBar(title: const Text('Tirages', style: TextStyle(fontWeight: FontWeight.w800))),
      body: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(nextDrawProvider)
            ..invalidate(publishedDrawsProvider);
          try {
            await ref.read(nextDrawProvider.future);
          } catch (_) {}
        },
        child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
          Text('Prochain tirage', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: BSpace.x3),
          next.when(
            loading: () => const SkeletonBox(height: 220, radius: BRadius.xl),
            error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(nextDrawProvider)),
            data: (data) => _NextDrawCard(next: data),
          ),
          const SizedBox(height: BSpace.x6),
          Text('Résultats publiés', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: BSpace.x3),
          published.when(
            loading: () => const SkeletonList(count: 2),
            error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(publishedDrawsProvider)),
            data: (draws) => draws.isEmpty
                ? const Card(
                    child: EmptyState(
                      icon: Icons.emoji_events_outlined,
                      title: 'Aucun résultat pour le moment',
                      message: 'Les résultats et leur preuve d’intégrité apparaîtront ici après chaque tirage.',
                    ),
                  )
                : Card(
                    clipBehavior: Clip.antiAlias,
                    child: Column(children: [
                      for (final draw in draws)
                        ListTile(
                          onTap: () => context.push(Routes.draw(draw.id)),
                          leading: const CircleAvatar(
                            backgroundColor: BColors.growth50,
                            child: Icon(Icons.verified_rounded, color: BColors.growth600),
                          ),
                          title: Text(draw.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                          subtitle: Text(
                            '${draw.winnerCount} bénéficiaire${draw.winnerCount > 1 ? 's' : ''} sur ${draw.eligibleCount ?? '-'} participants · '
                            '${formatDate(draw.publishedAt ?? draw.scheduledAt)}',
                          ),
                          trailing: const Icon(Icons.chevron_right_rounded),
                        ),
                    ]),
                  ),
          ),
        ]),
      ),
    );
  }
}

class _NextDrawCard extends StatelessWidget {
  const _NextDrawCard({required this.next});
  final NextDraw next;

  @override
  Widget build(BuildContext context) {
    final draw = next.draw;
    final eligibility = next.eligibility;
    if (draw == null) {
      return Card(
        child: EmptyState(
          icon: Icons.event_outlined,
          title: 'Aucun tirage programmé',
          message: eligibility.eligible
              ? 'Vous remplissez déjà les conditions. Le prochain tirage sera annoncé dans l’application.'
              : 'Continuez vos contributions : le prochain tirage sera annoncé dans l’application.',
        ),
      );
    }

    final remaining = draw.scheduledAt.difference(DateTime.now());
    final countdown = remaining.isNegative
        ? 'En cours de traitement'
        : remaining.inDays >= 1
            ? 'Dans ${remaining.inDays} jour${remaining.inDays > 1 ? 's' : ''}'
            : 'Dans ${remaining.inHours} h ${remaining.inMinutes.remainder(60)} min';
    final ratio = eligibility.requiredDays == 0 ? 0.0 : (eligibility.paidDays / eligibility.requiredDays).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.all(BSpace.x6),
      decoration: BoxDecoration(gradient: BColors.brandGradient, borderRadius: BorderRadius.circular(BRadius.xl), boxShadow: BShadow.raised),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(draw.title, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: BSpace.x3, vertical: BSpace.x1),
            decoration: BoxDecoration(color: BColors.accent500, borderRadius: BorderRadius.circular(BRadius.pill)),
            child: Text(countdown, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
          ),
        ]),
        const SizedBox(height: BSpace.x2),
        Text('${formatDateTime(draw.scheduledAt)} · ${draw.winnerCount} bénéficiaire${draw.winnerCount > 1 ? 's' : ''}',
            style: const TextStyle(color: Colors.white70)),
        const Divider(color: Colors.white24, height: BSpace.x6),
        Text(
          'Conditions : identité vérifiée et ${draw.minPaidDays} jour${draw.minPaidDays > 1 ? 's' : ''} de contribution payés sur les ${draw.windowDays} derniers jours.',
          style: const TextStyle(color: Colors.white, fontSize: 13.5),
        ),
        const SizedBox(height: BSpace.x3),
        ClipRRect(
          borderRadius: BorderRadius.circular(BRadius.pill),
          child: LinearProgressIndicator(
            value: ratio,
            minHeight: 8,
            backgroundColor: Colors.white24,
            valueColor: const AlwaysStoppedAnimation<Color>(BColors.accent500),
          ),
        ),
        const SizedBox(height: BSpace.x2),
        Text('${eligibility.paidDays} / ${eligibility.requiredDays} jours payés',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        const SizedBox(height: BSpace.x3),
        _EligibilityLine(next: next),
        if (draw.isFrozen && draw.snapshotHash != null) ...[
          const SizedBox(height: BSpace.x3),
          Text(
            'Liste figée le ${formatDateTime(draw.snapshotAt!)} : ${draw.eligibleCount} participants. Empreinte ${draw.snapshotHash!.substring(0, 16)}…',
            style: const TextStyle(color: Colors.white70, fontSize: 12),
          ),
        ],
      ]),
    );
  }
}

class _EligibilityLine extends StatelessWidget {
  const _EligibilityLine({required this.next});
  final NextDraw next;

  @override
  Widget build(BuildContext context) {
    final e = next.eligibility;
    final (icon, label, action) = switch (true) {
      _ when next.included == true => (Icons.check_circle_rounded, 'Vous participez à ce tirage.', null),
      _ when next.included == false => (Icons.info_rounded, 'La liste des participants est figée : vous n’en faites pas partie.', null),
      _ when e.reasons.contains('ALREADY_BENEFICIARY') => (Icons.star_rounded, 'Vous êtes déjà bénéficiaire du programme.', ('Mon parcours', Routes.program)),
      _ when e.reasons.contains('KYC_NOT_APPROVED') => (Icons.shield_outlined, 'Vérifiez votre identité pour participer.', ('Vérifier', Routes.kyc)),
      _ when e.eligible => (Icons.check_circle_rounded, 'Vous êtes éligible à ce tirage.', null),
      _ => (
          Icons.hourglass_bottom_rounded,
          'Il vous manque ${e.requiredDays - e.paidDays} jour${e.requiredDays - e.paidDays > 1 ? 's' : ''} de contribution.',
          ('Contribuer', Routes.contributions),
        ),
    };
    return Row(children: [
      Icon(icon, color: Colors.white),
      const SizedBox(width: BSpace.x2),
      Expanded(child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
      if (action != null)
        TextButton(
          style: TextButton.styleFrom(foregroundColor: Colors.white, backgroundColor: Colors.white24),
          onPressed: () => context.push(action.$2),
          child: Text(action.$1),
        ),
    ]);
  }
}
