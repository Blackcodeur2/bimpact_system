import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../application/training_providers.dart';

class LessonPlayerScreen extends ConsumerStatefulWidget {
  const LessonPlayerScreen({super.key, required this.lessonId});
  final String lessonId;

  @override
  ConsumerState<LessonPlayerScreen> createState() => _LessonPlayerScreenState();
}

class _LessonPlayerScreenState extends ConsumerState<LessonPlayerScreen> {
  bool _isPlaying = false;
  double _audioProgress = 0.35;
  bool _isCompleting = false;

  @override
  Widget build(BuildContext context) {
    final lessonAsync = ref.watch(lessonDetailProvider(widget.lessonId));

    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Leçon audio & fiche'),
      ),
      body: lessonAsync.when(
        data: (lesson) => Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(BSpace.x4),
                children: [
                  // Audio player card if audio available
                  Container(
                    padding: const EdgeInsets.all(BSpace.x5),
                    decoration: BoxDecoration(
                      color: BColors.primaryNavy,
                      borderRadius: BorderRadius.circular(BRadius.xl),
                      boxShadow: [
                        BoxShadow(
                          color: BColors.primaryNavy.withValues(alpha: 0.3),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: BColors.brandOrange,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                'MOIS ${lesson.moduleMonth}',
                                style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                              ),
                            ),
                            const Spacer(),
                            const Icon(Icons.volume_up, color: Colors.white70, size: 18),
                            const SizedBox(width: 4),
                            Text(
                              '${lesson.durationMinutes} min',
                              style: const TextStyle(color: Colors.white70, fontSize: 12),
                            ),
                          ],
                        ),
                        const SizedBox(height: BSpace.x3),
                        Text(
                          lesson.title,
                          style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          lesson.moduleTitle,
                          style: const TextStyle(color: Colors.white70, fontSize: 13),
                        ),
                        const SizedBox(height: BSpace.x5),

                        // Progress slider
                        SliderTheme(
                          data: SliderTheme.of(context).copyWith(
                            trackHeight: 4,
                            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                            activeTrackColor: BColors.brandOrange,
                            inactiveTrackColor: Colors.white24,
                            thumbColor: Colors.white,
                          ),
                          child: Slider(
                            value: _audioProgress,
                            onChanged: (v) => setState(() => _audioProgress = v),
                          ),
                        ),

                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              '04:12',
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 11),
                            ),
                            Text(
                              '${lesson.durationMinutes}:00',
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 11),
                            ),
                          ],
                        ),

                        const SizedBox(height: BSpace.x3),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.replay_10, color: Colors.white, size: 28),
                              onPressed: () => setState(() => _audioProgress = (_audioProgress - 0.05).clamp(0.0, 1.0)),
                            ),
                            const SizedBox(width: BSpace.x4),
                            CircleAvatar(
                              radius: 28,
                              backgroundColor: BColors.brandOrange,
                              child: IconButton(
                                icon: Icon(_isPlaying ? Icons.pause : Icons.play_arrow, color: Colors.white, size: 30),
                                onPressed: () => setState(() => _isPlaying = !_isPlaying),
                              ),
                            ),
                            const SizedBox(width: BSpace.x4),
                            IconButton(
                              icon: const Icon(Icons.forward_10, color: Colors.white, size: 28),
                              onPressed: () => setState(() => _audioProgress = (_audioProgress + 0.05).clamp(0.0, 1.0)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: BSpace.x6),
                  const Text(
                    'Fiche de synthèse',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BColors.textPrimary),
                  ),
                  const SizedBox(height: BSpace.x3),

                  Container(
                    padding: const EdgeInsets.all(BSpace.x4),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(BRadius.lg),
                      border: Border.all(color: BColors.border),
                    ),
                    child: Text(
                      lesson.markdownContent,
                      style: const TextStyle(fontSize: 14, height: 1.6, color: BColors.textPrimary),
                    ),
                  ),
                ],
              ),
            ),

            // Bottom action bar
            Container(
              padding: const EdgeInsets.all(BSpace.x4),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: BColors.border)),
              ),
              child: SafeArea(
                child: SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: lesson.isCompleted ? BColors.brandGreen : BColors.brandBlue,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                    ),
                    onPressed: _isCompleting
                        ? null
                        : () async {
                            setState(() => _isCompleting = true);
                            try {
                              await ref.read(trainingRepositoryProvider).completeLesson(lesson.id);
                              ref.invalidate(trainingModulesProvider);
                              ref.invalidate(lessonDetailProvider(widget.lessonId));
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('🎉 Bravo ! Leçon enregistrée comme terminée.'),
                                    backgroundColor: BColors.brandGreen,
                                  ),
                                );
                                context.pop();
                              }
                            } catch (e) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('Erreur: $e')),
                                );
                              }
                            } finally {
                              if (mounted) setState(() => _isCompleting = false);
                            }
                          },
                    icon: _isCompleting
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : Icon(lesson.isCompleted ? Icons.check_circle : Icons.done_all),
                    label: Text(
                      lesson.isCompleted ? 'Leçon déjà validée (Marquer revue)' : 'Marquer comme terminée',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: AppErrorState(message: 'Impossible d’ouvrir la leçon.', onRetry: () => ref.refresh(lessonDetailProvider(widget.lessonId)))),
      ),
    );
  }
}
