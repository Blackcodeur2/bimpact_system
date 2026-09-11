import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/money_format.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../core/widgets/sync_status.dart';
import '../application/accidents_providers.dart';
import '../domain/accident_models.dart';

/// Accidents & solidarité (cahier §7.21) : adhésion volontaire au fonds, déclarations et leur suivi.
class AccidentsScreen extends ConsumerWidget {
  const AccidentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final solidarity = ref.watch(solidarityStatusProvider);
    final claims = ref.watch(accidentClaimsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Accidents & solidarité')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: BColors.danger500,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/accidents/report'),
        icon: const Icon(Icons.add_alert_rounded),
        label: const Text('Déclarer un accident'),
      ),
      body: Column(children: [
        const SyncStatusBanner(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              ref
                ..invalidate(solidarityStatusProvider)
                ..invalidate(accidentClaimsProvider);
              try {
                await ref.read(accidentClaimsProvider.future);
              } catch (_) {}
            },
            child: ListView(padding: const EdgeInsets.fromLTRB(BSpace.x4, BSpace.x4, BSpace.x4, 96), children: [
              solidarity.when(
                loading: () => const SkeletonBox(height: 140, radius: BRadius.xl),
                error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(solidarityStatusProvider)),
                data: (status) => _SolidarityCard(status: status),
              ),
              const SizedBox(height: BSpace.x4),
              Container(
                padding: const EdgeInsets.all(BSpace.x3),
                decoration: BoxDecoration(color: BColors.primary50, borderRadius: BorderRadius.circular(BRadius.md)),
                child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(Icons.info_outline_rounded, color: BColors.primary600, size: 20),
                  SizedBox(width: BSpace.x2),
                  Expanded(
                    child: Text(
                      'En cas d’accident, faites-vous soigner d’abord. Vous pouvez déclarer un accident même sans adhésion : le comité examine chaque dossier.',
                      style: TextStyle(color: BColors.primary700, fontSize: 13),
                    ),
                  ),
                ]),
              ),
              const SizedBox(height: BSpace.x6),
              Text('Mes déclarations', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: BSpace.x3),
              claims.when(
                loading: () => const SkeletonList(count: 2),
                error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(accidentClaimsProvider)),
                data: (items) => items.isEmpty
                    ? const Card(
                        child: EmptyState(
                          icon: Icons.health_and_safety_outlined,
                          title: 'Aucune déclaration',
                          message: 'Vos déclarations d’accident et leur suivi apparaîtront ici.',
                        ),
                      )
                    : Column(children: [for (final claim in items) _ClaimCard(claim: claim)]),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _SolidarityCard extends StatelessWidget {
  const _SolidarityCard({required this.status});
  final SolidarityStatus status;

  @override
  Widget build(BuildContext context) {
    final (title, subtitle) = switch (status) {
      _ when status.covered => ('Adhérent solidaire · couvert', 'Vos accidents peuvent être aidés par le fonds, après examen du comité.'),
      _ when status.isMember && status.coveredFrom != null =>
        ('Adhérent solidaire', 'Couverture à partir du ${formatDate(status.coveredFrom!)} (délai de carence).'),
      _ when status.kycRequired => ('Fonds de solidarité', 'Vérifiez votre identité pour pouvoir adhérer.'),
      _ => ('Fonds de solidarité volontaire', 'L’adhésion est facultative et résiliable à tout moment.'),
    };
    return Container(
      padding: const EdgeInsets.all(BSpace.x4),
      decoration: BoxDecoration(gradient: BColors.brandGradient, borderRadius: BorderRadius.circular(BRadius.xl), boxShadow: BShadow.raised),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.volunteer_activism_rounded, color: Colors.white),
          const SizedBox(width: BSpace.x2),
          Expanded(child: Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16))),
        ]),
        const SizedBox(height: BSpace.x2),
        Text(subtitle, style: const TextStyle(color: Colors.white, fontSize: 13.5)),
        const SizedBox(height: BSpace.x2),
        Text(
          'Fonds : ${status.fundBalance.formatted} · ${status.activeMembers} adhérent${status.activeMembers > 1 ? 's' : ''}'
          '${status.rules.collectionsEnabled ? '' : ' · collectes non activées'}',
          style: const TextStyle(color: Colors.white70, fontSize: 12.5),
        ),
        const SizedBox(height: BSpace.x3),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            style: TextButton.styleFrom(foregroundColor: Colors.white, backgroundColor: Colors.white24),
            onPressed: () => context.push('/accidents/solidarity'),
            child: Text(status.isMember ? 'Mon adhésion' : 'Lire le règlement'),
          ),
        ),
      ]),
    );
  }
}

class _ClaimCard extends StatelessWidget {
  const _ClaimCard({required this.claim});
  final AccidentSummary claim;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: BSpace.x3),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/accidents/${claim.id}'),
        child: Padding(
          padding: const EdgeInsets.all(BSpace.x4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(claim.reference, style: const TextStyle(color: BColors.textMuted, fontWeight: FontWeight.w700, fontSize: 12.5))),
              StatusBadge(label: accidentStatusLabel(claim.status), tone: accidentStatusTone(claim.status)),
            ]),
            const SizedBox(height: BSpace.x2),
            Text(claim.location, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(height: BSpace.x1),
            Text('${formatDateTime(claim.date)} · ${claim.severityLabel}', style: const TextStyle(color: BColors.textMuted, fontSize: 13)),
            const SizedBox(height: BSpace.x2),
            Text(
              claim.disbursedAmount != null
                  ? 'Aide versée : ${claim.disbursedAmount!.formatted}'
                  : claim.approvedAmount != null
                      ? 'Aide accordée : ${claim.approvedAmount!.formatted}'
                      : 'Frais estimés : ${claim.requestedAmount.formatted}',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ]),
        ),
      ),
    );
  }
}
