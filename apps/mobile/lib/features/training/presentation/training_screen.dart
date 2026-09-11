import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/tokens.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../core/widgets/sync_status.dart';
import '../application/training_providers.dart';
import '../domain/training_models.dart';

/// Formation (cahier §7.13) : progression réelle, module en cours, modules débloqués dans l'ordre.
class TrainingScreen extends ConsumerWidget {
  const TrainingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(trainingOverviewProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Formation')),
      body: Column(children: [
        const SyncStatusBanner(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(trainingOverviewProvider);
              try {
                await ref.read(trainingOverviewProvider.future);
              } catch (_) {}
            },
            child: overview.when(
              loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 4)),
              error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(trainingOverviewProvider)),
              data: (o) => o.modules.isEmpty
                  ? ListView(children: const [
                      EmptyState(
                        icon: Icons.school_outlined,
                        title: 'Formation en préparation',
                        message: 'Les modules de formation seront disponibles ici dès leur publication.',
                      ),
                    ])
                  : ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
                      _SummaryCard(summary: o.summary),
                      const SizedBox(height: BSpace.x6),
                      Text('Modules', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                      const SizedBox(height: BSpace.x3),
                      for (final module in o.modules) _ModuleCard(module: module),
                    ]),
            ),
          ),
        ),
      ]),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.summary});
  final TrainingSummary summary;

  @override
  Widget build(BuildContext context) {
    final current = summary.current;
    return Container(
      padding: const EdgeInsets.all(BSpace.x4),
      decoration: BoxDecoration(gradient: BColors.brandGradient, borderRadius: BorderRadius.circular(BRadius.xl), boxShadow: BShadow.raised),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          SizedBox(
            width: 68,
            height: 68,
            child: Stack(fit: StackFit.expand, children: [
              CircularProgressIndicator(
                value: summary.progressPercent / 100,
                strokeWidth: 7,
                backgroundColor: Colors.white24,
                valueColor: const AlwaysStoppedAnimation<Color>(BColors.accent500),
              ),
              Center(child: Text('${summary.progressPercent} %', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800))),
            ]),
          ),
          const SizedBox(width: BSpace.x4),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${summary.completedModules} sur ${summary.totalModules} modules validés',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: BSpace.x1),
              Text(
                summary.certified ? 'Formation terminée : votre certificat est disponible.' : 'Validez le quiz de chaque module pour débloquer le suivant.',
                style: const TextStyle(color: Colors.white70, fontSize: 13),
              ),
            ]),
          ),
        ]),
        const SizedBox(height: BSpace.x4),
        if (summary.certified)
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: Colors.white, backgroundColor: Colors.white24),
            onPressed: () => context.push('/training/certificate'),
            icon: const Icon(Icons.workspace_premium_rounded),
            label: const Text('Voir mon certificat'),
          )
        else if (current != null)
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: BColors.accent500),
            onPressed: () => current.nextLessonId != null
                ? context.push('/training/lesson/${current.nextLessonId}')
                : current.quizReady
                    ? context.push('/training/quiz/${current.moduleId}')
                    : context.push('/training/module/${current.moduleId}'),
            icon: const Icon(Icons.play_arrow_rounded),
            label: Text(
              current.nextLessonTitle != null
                  ? 'Continuer : ${current.nextLessonTitle}'
                  : current.quizReady
                      ? 'Passer le quiz du module ${current.month}'
                      : 'Ouvrir le module ${current.month}',
              overflow: TextOverflow.ellipsis,
            ),
          ),
      ]),
    );
  }
}

class _ModuleCard extends StatelessWidget {
  const _ModuleCard({required this.module});
  final TrainingModuleItem module;

  @override
  Widget build(BuildContext context) {
    final (label, tone, icon) = switch (module.status) {
      'COMPLETED' => ('Validé', BadgeTone.success, Icons.check_circle_rounded),
      'IN_PROGRESS' => ('En cours', BadgeTone.info, Icons.timelapse_rounded),
      'AVAILABLE' => ('À commencer', BadgeTone.info, Icons.play_circle_outline_rounded),
      _ => ('Verrouillé', BadgeTone.neutral, Icons.lock_outline_rounded),
    };
    return Card(
      margin: const EdgeInsets.only(bottom: BSpace.x3),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: module.isLocked
            ? () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Validez le quiz du module précédent pour débloquer celui-ci.')))
            : () => context.push('/training/module/${module.id}'),
        child: Padding(
          padding: const EdgeInsets.all(BSpace.x4),
          child: Row(children: [
            Icon(icon, color: module.isLocked ? BColors.neutral400 : BColors.primary500, size: 32),
            const SizedBox(width: BSpace.x3),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Module ${module.month}', style: const TextStyle(color: BColors.textMuted, fontSize: 12, fontWeight: FontWeight.w700)),
                Text(module.title, style: TextStyle(fontWeight: FontWeight.w800, color: module.isLocked ? BColors.textMuted : BColors.text)),
                const SizedBox(height: BSpace.x1),
                Text(
                  '${module.completedLessons}/${module.totalLessons} leçon${module.totalLessons > 1 ? 's' : ''} · ${module.durationMinutes} min'
                  '${module.bestScore == null ? '' : ' · meilleur score ${module.bestScore} %'}',
                  style: const TextStyle(color: BColors.textMuted, fontSize: 12.5),
                ),
              ]),
            ),
            StatusBadge(label: label, tone: tone),
          ]),
        ),
      ),
    );
  }
}
