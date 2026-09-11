import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/network/app_failure.dart';
import '../../../core/sync/sync_queue.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/states.dart';
import '../application/training_providers.dart';
import '../domain/training_models.dart';

/// Lecture d'une leçon (cahier §7.14) : contenu écrit, points clés, audio s'il existe, progression enregistrée.
class LessonPlayerScreen extends ConsumerWidget {
  const LessonPlayerScreen({super.key, required this.lessonId});
  final String lessonId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lesson = ref.watch(lessonDetailProvider(lessonId));
    return Scaffold(
      appBar: AppBar(title: const Text('Leçon')),
      body: lesson.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 5)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(lessonDetailProvider(lessonId))),
        data: (l) => _LessonBody(lesson: l),
      ),
    );
  }
}

class _LessonBody extends ConsumerStatefulWidget {
  const _LessonBody({required this.lesson});
  final LessonDetail lesson;

  @override
  ConsumerState<_LessonBody> createState() => _LessonBodyState();
}

class _LessonBodyState extends ConsumerState<_LessonBody> {
  final _scroll = ScrollController();
  late int _savedPercent = widget.lesson.progressPercent;
  bool _completing = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_trackProgress);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _trackProgress() {
    if (!_scroll.hasClients || _scroll.position.maxScrollExtent <= 0) return;
    final percent = (_scroll.offset / _scroll.position.maxScrollExtent * 100).clamp(0, 100).round();
    if (percent >= _savedPercent + 25) {
      _savedPercent = percent;
      ref.read(trainingRepositoryProvider).saveProgress(widget.lesson.id, percent);
    }
  }

  Future<void> _complete() async {
    final lesson = widget.lesson;
    setState(() => _completing = true);
    try {
      final outcome = await ref.read(syncQueueProvider.notifier).submit(
            kind: 'training',
            label: 'Leçon terminée : ${lesson.title}',
            method: 'POST',
            path: '/training/lessons/${lesson.id}/complete',
          );
      if (!mounted) return;
      if (outcome is SubmitQueued) showInfoSnackBar(context, 'Pas de réseau : la leçon sera enregistrée comme terminée automatiquement.');
      _goNext();
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
    } finally {
      if (mounted) setState(() => _completing = false);
    }
  }

  void _goNext() {
    final lesson = widget.lesson;
    if (lesson.nextLessonId != null) {
      context.pushReplacement('/training/lesson/${lesson.nextLessonId}');
    } else {
      context.pushReplacement('/training/module/${lesson.moduleId}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final lesson = widget.lesson;
    final text = Theme.of(context).textTheme;
    return Column(children: [
      Expanded(
        child: ListView(controller: _scroll, padding: const EdgeInsets.all(BSpace.x4), children: [
          Text('Module ${lesson.moduleMonth} · ${lesson.moduleTitle}', style: const TextStyle(color: BColors.textMuted, fontWeight: FontWeight.w700)),
          const SizedBox(height: BSpace.x1),
          Text(lesson.title, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          Text('${lesson.durationMinutes} min de lecture', style: const TextStyle(color: BColors.textMuted)),
          if (lesson.audioUrl != null) ...[
            const SizedBox(height: BSpace.x3),
            OutlinedButton.icon(
              onPressed: () => launchUrl(Uri.parse(lesson.audioUrl!), mode: LaunchMode.externalApplication),
              icon: const Icon(Icons.headphones_rounded),
              label: const Text('Écouter la version audio'),
            ),
          ],
          const SizedBox(height: BSpace.x4),
          ...LessonContent.render(lesson.content),
          if (lesson.keyPoints.isNotEmpty) ...[
            const SizedBox(height: BSpace.x4),
            Container(
              padding: const EdgeInsets.all(BSpace.x4),
              decoration: BoxDecoration(color: BColors.accent50, borderRadius: BorderRadius.circular(BRadius.lg)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('À retenir', style: TextStyle(fontWeight: FontWeight.w800, color: BColors.accent700)),
                const SizedBox(height: BSpace.x2),
                for (final point in lesson.keyPoints)
                  Padding(
                    padding: const EdgeInsets.only(bottom: BSpace.x1),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Icon(Icons.check_rounded, size: 18, color: BColors.accent700),
                      const SizedBox(width: BSpace.x2),
                      Expanded(child: Text(point)),
                    ]),
                  ),
              ]),
            ),
          ],
          const SizedBox(height: BSpace.x8),
        ]),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(BSpace.x4),
          child: lesson.isCompleted
              ? OutlinedButton(
                  onPressed: _goNext,
                  child: Text(lesson.nextLessonTitle != null ? 'Leçon suivante : ${lesson.nextLessonTitle}' : 'Retour au module', overflow: TextOverflow.ellipsis),
                )
              : LoadingButton(label: 'J’ai terminé cette leçon', loading: _completing, onPressed: _complete),
        ),
      ),
    ]);
  }
}

/// Mise en forme simple du contenu écrit : paragraphes, listes à puces et listes numérotées.
abstract final class LessonContent {
  static List<Widget> render(String content) {
    final widgets = <Widget>[];
    for (final raw in content.split('\n')) {
      final line = raw.trim().replaceAll('**', '').replaceFirst(RegExp(r'^#+\s*'), '');
      if (line.isEmpty) {
        widgets.add(const SizedBox(height: BSpace.x2));
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        widgets.add(_item('•', line.substring(2)));
      } else if (RegExp(r'^\d+\.\s').hasMatch(line)) {
        final match = RegExp(r'^(\d+)\.\s(.*)$').firstMatch(line)!;
        widgets.add(_item('${match.group(1)}.', match.group(2)!));
      } else {
        widgets.add(Padding(padding: const EdgeInsets.only(bottom: BSpace.x1), child: Text(line, style: const TextStyle(fontSize: 15.5, height: 1.55))));
      }
    }
    return widgets;
  }

  static Widget _item(String marker, String text) => Padding(
        padding: const EdgeInsets.only(bottom: BSpace.x2, left: BSpace.x2),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 22, child: Text(marker, style: const TextStyle(fontWeight: FontWeight.w800, color: BColors.primary600))),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 15.5, height: 1.5))),
        ]),
      );
}
