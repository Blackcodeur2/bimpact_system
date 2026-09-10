import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/money_format.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/states.dart';
import '../draws_data.dart';

/// Résultat d'un tirage et preuve d'intégrité vérifiable (cahier §11).
class DrawDetailScreen extends ConsumerWidget {
  const DrawDetailScreen({super.key, required this.drawId});
  final String drawId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(drawDetailProvider(drawId));
    return Scaffold(
      backgroundColor: BColors.background,
      appBar: AppBar(title: const Text('Résultat du tirage')),
      body: detail.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 4)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(drawDetailProvider(drawId))),
        data: (data) => ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
          _ResultCard(detail: data),
          const SizedBox(height: BSpace.x6),
          if (data.draw.status != 'DRAFT' && data.draw.status != 'CANCELLED') _AuditSection(drawId: drawId),
        ]),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.detail});
  final DrawDetail detail;

  @override
  Widget build(BuildContext context) {
    final draw = detail.draw;
    final (color, background, icon, title, message) = switch (detail) {
      _ when draw.status == 'CANCELLED' => (BColors.textMuted, BColors.neutral100, Icons.block_rounded, 'Tirage annulé', 'Ce tirage a été annulé.'),
      _ when !draw.isPublished => (
          BColors.primary600,
          BColors.primary50,
          Icons.hourglass_top_rounded,
          'Résultats à venir',
          detail.included ? 'Vous participez. Les résultats seront publiés après validation.' : 'Les résultats seront publiés après validation.',
        ),
      _ when detail.selected == true => (
          BColors.growth600,
          BColors.growth50,
          Icons.emoji_events_rounded,
          'Félicitations, vous êtes sélectionné !',
          'Rang ${detail.rank} sur ${draw.winnerCount}. Votre parcours entrepreneurial commence.',
        ),
      _ when detail.included => (
          BColors.warning700,
          BColors.warning50,
          Icons.favorite_border_rounded,
          'Pas sélectionné cette fois',
          'Continuez vos contributions : vous restez éligible aux prochains tirages.',
        ),
      _ => (BColors.textMuted, BColors.neutral100, Icons.info_outline_rounded, 'Vous ne participiez pas', 'Vous ne remplissiez pas les conditions lors du gel de la liste.'),
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(BSpace.x6),
        child: Column(children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(color: background, shape: BoxShape.circle),
            child: Icon(icon, size: 44, color: color),
          ),
          const SizedBox(height: BSpace.x3),
          Text(title, textAlign: TextAlign.center, style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: BSpace.x2),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: BSpace.x4),
          Text(draw.title, style: const TextStyle(fontWeight: FontWeight.w700)),
          Text(
            '${draw.eligibleCount ?? '-'} participants · ${draw.winnerCount} bénéficiaire${draw.winnerCount > 1 ? 's' : ''}'
            '${draw.publishedAt != null ? ' · publié le ${formatDate(draw.publishedAt!)}' : ''}',
            style: const TextStyle(color: BColors.textMuted, fontSize: 13),
          ),
          if (detail.participantToken != null) ...[
            const SizedBox(height: BSpace.x3),
            SelectableText('Votre jeton anonyme : ${detail.participantToken}',
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12, color: BColors.textMuted)),
          ],
          if (detail.selected == true) ...[
            const SizedBox(height: BSpace.x4),
            FilledButton(onPressed: () => context.push(Routes.program), child: const Text('Commencer mon parcours')),
          ],
        ]),
      ),
    );
  }
}

class _AuditSection extends ConsumerWidget {
  const _AuditSection({required this.drawId});
  final String drawId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final audit = ref.watch(drawAuditProvider(drawId));
    return Card(
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        leading: const Icon(Icons.fact_check_outlined, color: BColors.primary500),
        title: const Text('Voir la preuve du tirage', style: TextStyle(fontWeight: FontWeight.w800)),
        subtitle: const Text('Tout le monde peut recalculer le résultat, sans donnée personnelle.'),
        childrenPadding: const EdgeInsets.fromLTRB(BSpace.x4, 0, BSpace.x4, BSpace.x4),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        children: [
          audit.when(
            loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: CircularProgressIndicator()),
            error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(drawAuditProvider(drawId))),
            data: (a) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (a.checks != null) ...[
                _Check('Liste des participants inchangée', a.checks!['snapshotMatches'] ?? false),
                _Check('Graine conforme à l’engagement publié avant le tirage', a.checks!['seedMatchesCommitment'] ?? false),
                _Check('Gagnants recalculés identiques', a.checks!['winnersMatch'] ?? false),
                _Check('Empreinte des résultats conforme', a.checks!['resultHashMatches'] ?? false),
                const SizedBox(height: BSpace.x3),
              ] else
                const Padding(
                  padding: EdgeInsets.only(bottom: BSpace.x3),
                  child: Text('La graine sera révélée à la publication ; la vérification complète sera alors possible.'),
                ),
              _Hash('Participants', '${a.participantsCount}'),
              if (a.snapshotHash != null) _Hash('Empreinte de la liste', a.snapshotHash!),
              if (a.seedCommitment != null) _Hash('Engagement sur la graine', a.seedCommitment!),
              if (a.seed != null) _Hash('Graine révélée', a.seed!),
              if (a.resultHash != null) _Hash('Empreinte des résultats', a.resultHash!),
              if (a.winners.isNotEmpty) ...[
                const SizedBox(height: BSpace.x2),
                const Text('Gagnants (jetons anonymes)', style: TextStyle(fontWeight: FontWeight.w700)),
                for (final w in a.winners)
                  Text('#${w.rank}  ${w.token}', style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
              ],
              const SizedBox(height: BSpace.x3),
              Text('Méthode (${a.algorithmVersion}) : ${a.method}', style: const TextStyle(color: BColors.textMuted, fontSize: 12)),
            ]),
          ),
        ],
      ),
    );
  }
}

class _Check extends StatelessWidget {
  const _Check(this.label, this.ok);
  final String label;
  final bool ok;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(children: [
        Icon(ok ? Icons.check_circle_rounded : Icons.cancel_rounded, color: ok ? BColors.growth500 : BColors.danger500, size: 18),
        const SizedBox(width: BSpace.x2),
        Expanded(child: Text(label)),
      ]),
    );
  }
}

class _Hash extends StatelessWidget {
  const _Hash(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BSpace.x1),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(color: BColors.textMuted, fontSize: 12)),
        SelectableText(value, style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
      ]),
    );
  }
}
