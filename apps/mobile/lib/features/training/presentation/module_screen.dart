import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/tokens.dart';
import '../../../core/widgets/states.dart';
import '../application/training_providers.dart';

/// Leçons d'un module et accès au quiz de validation.
class ModuleScreen extends ConsumerWidget {
  const ModuleScreen({super.key, required this.moduleId});
  final String moduleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(moduleDetailProvider(moduleId));
    return Scaffold(
      appBar: AppBar(title: const Text('Module')),
      body: detail.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 4)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(moduleDetailProvider(moduleId))),
        data: (d) {
          final quiz = d.quiz;
          final remaining = d.module.totalLessons - d.module.completedLessons;
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(moduleDetailProvider(moduleId));
              try {
                await ref.read(moduleDetailProvider(moduleId).future);
              } catch (_) {}
            },
            child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
              Text('Module ${d.module.month}', style: const TextStyle(color: BColors.textMuted, fontWeight: FontWeight.w700)),
              Text(d.module.title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: BSpace.x2),
              Text(d.module.description, style: const TextStyle(color: BColors.textMuted, height: 1.4)),
              const SizedBox(height: BSpace.x4),
              Card(
                clipBehavior: Clip.antiAlias,
                child: Column(children: [
                  for (final (index, lesson) in d.lessons.indexed) ...[
                    if (index > 0) const Divider(indent: 56),
                    ListTile(
                      minTileHeight: 64,
                      leading: CircleAvatar(
                        backgroundColor: lesson.isCompleted ? BColors.growth50 : BColors.primary50,
                        child: lesson.isCompleted
                            ? const Icon(Icons.check_rounded, color: BColors.growth600)
                            : Text('${index + 1}', style: const TextStyle(color: BColors.primary600, fontWeight: FontWeight.w800)),
                      ),
                      title: Text(lesson.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(
                        '${lesson.durationMinutes} min${!lesson.isCompleted && lesson.progressPercent > 0 ? ' · lue à ${lesson.progressPercent} %' : ''}',
                      ),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => context.push('/training/lesson/${lesson.id}'),
                    ),
                  ],
                ]),
              ),
              if (quiz != null) ...[
                const SizedBox(height: BSpace.x6),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(BSpace.x4),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Row(children: [
                        const Icon(Icons.quiz_outlined, color: BColors.accent700),
                        const SizedBox(width: BSpace.x2),
                        Expanded(child: Text(quiz.title, style: const TextStyle(fontWeight: FontWeight.w800))),
                      ]),
                      const SizedBox(height: BSpace.x2),
                      Text('Score requis : ${quiz.passScore} %${quiz.bestScore == null ? '' : ' · meilleur score : ${quiz.bestScore} %'}'),
                      if (quiz.lastPassed == true)
                        const Text('Quiz validé.', style: TextStyle(color: BColors.growth700, fontWeight: FontWeight.w700)),
                      const SizedBox(height: BSpace.x3),
                      if (!quiz.available)
                        Text('Terminez encore $remaining leçon${remaining > 1 ? 's' : ''} pour passer le quiz.', style: const TextStyle(color: BColors.textMuted))
                      else if (quiz.attemptsLeftToday == 0)
                        const Text('Vous avez utilisé toutes vos tentatives des dernières 24 heures. Relisez les leçons et réessayez demain.',
                            style: TextStyle(color: BColors.warning700))
                      else
                        FilledButton(
                          onPressed: () => context.push('/training/quiz/$moduleId'),
                          child: Text('Passer le quiz (${quiz.attemptsLeftToday} tentative${quiz.attemptsLeftToday > 1 ? 's' : ''} aujourd’hui)'),
                        ),
                    ]),
                  ),
                ),
              ],
            ]),
          );
        },
      ),
    );
  }
}
