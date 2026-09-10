import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../application/training_providers.dart';
import '../domain/training_models.dart';

class TrainingScreen extends ConsumerWidget {
  const TrainingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final modulesAsync = ref.watch(trainingModulesProvider);
    final certsAsync = ref.watch(certificatesProvider);

    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Académie Entrepreneuriale'),
        actions: [
          certsAsync.when(
            data: (certs) => certs.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.verified, color: BColors.brandOrange),
                    tooltip: 'Mon Certificat',
                    onPressed: () => context.push('/training/certificate'),
                  )
                : const SizedBox.shrink(),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
      body: modulesAsync.when(
        data: (modules) => RefreshIndicator(
          onRefresh: () async => ref.refresh(trainingModulesProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(BSpace.x4),
            children: [
              // Hero banner
              Container(
                padding: const EdgeInsets.all(BSpace.x5),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [BColors.primaryNavy, BColors.brandBlue],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(BRadius.xl),
                  boxShadow: [
                    BoxShadow(
                      color: BColors.primaryNavy.withValues(alpha: 0.25),
                      blurRadius: 12,
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
                          padding: const EdgeInsets.all(BSpace.x2),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(BRadius.md),
                          ),
                          child: const Icon(Icons.school, color: Colors.white, size: 24),
                        ),
                        const SizedBox(width: BSpace.x3),
                        const Expanded(
                          child: Text(
                            'Cursus 6 Mois — Du Guidon au Business',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: BSpace.x3),
                    const Text(
                      'Chaque mois validé vous rapproche du financement de votre micro-entreprise par Benskin Impact.',
                      style: TextStyle(color: Colors.white70, fontSize: 13, height: 1.4),
                    ),
                    const SizedBox(height: BSpace.x4),
                    _buildOverallProgress(modules),
                  ],
                ),
              ),

              const SizedBox(height: BSpace.x6),
              const Text(
                'Programme des modules',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: BColors.textPrimary),
              ),
              const SizedBox(height: BSpace.x3),

              ...modules.map((m) => _buildModuleCard(context, ref, m)),
            ],
          ),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: AppErrorState(
            message: 'Impossible de charger la formation.',
            onRetry: () => ref.refresh(trainingModulesProvider),
          ),
        ),
      ),
    );
  }

  Widget _buildOverallProgress(List<TrainingModuleItem> modules) {
    final completed = modules.where((m) => m.isCompleted).length;
    final total = modules.length;
    final pct = total > 0 ? (completed / total) : 0.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '$completed sur $total modules validés',
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
            ),
            Text(
              '${(pct * 100).toInt()}%',
              style: const TextStyle(color: BColors.brandOrange, fontSize: 13, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        const SizedBox(height: BSpace.x2),
        ClipRRect(
          borderRadius: BorderRadius.circular(BRadius.full),
          child: LinearProgressIndicator(
            value: pct,
            backgroundColor: Colors.white.withValues(alpha: 0.2),
            valueColor: const AlwaysStoppedAnimation<Color>(BColors.brandOrange),
            minHeight: 8,
          ),
        ),
      ],
    );
  }

  Widget _buildModuleCard(BuildContext context, WidgetRef ref, TrainingModuleItem module) {
    final isLocked = module.isLocked;
    final isCompleted = module.isCompleted;

    return Container(
      margin: const EdgeInsets.only(bottom: BSpace.x4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(BRadius.lg),
        border: Border.all(
          color: isCompleted
              ? BColors.brandGreen.withValues(alpha: 0.3)
              : isLocked
                  ? BColors.border
                  : BColors.brandBlue.withValues(alpha: 0.3),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(BRadius.lg),
        child: InkWell(
          borderRadius: BorderRadius.circular(BRadius.lg),
          onTap: isLocked
              ? () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Validez le quiz du mois précédent pour débloquer ce module.'),
                    ),
                  );
                }
              : () => _openModuleModal(context, ref, module),
          child: Padding(
            padding: const EdgeInsets.all(BSpace.x4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: BSpace.x2, vertical: 4),
                      decoration: BoxDecoration(
                        color: isCompleted
                            ? BColors.brandGreen.withValues(alpha: 0.1)
                            : isLocked
                                ? Colors.grey.withValues(alpha: 0.1)
                                : BColors.brandBlue.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(BRadius.sm),
                      ),
                      child: Text(
                        'MOIS ${module.month}',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: isCompleted
                              ? BColors.brandGreen
                              : isLocked
                                  ? Colors.grey
                                  : BColors.brandBlue,
                        ),
                      ),
                    ),
                    const Spacer(),
                    if (isCompleted)
                      const Row(
                        children: [
                          Icon(Icons.check_circle, color: BColors.brandGreen, size: 16),
                          SizedBox(width: 4),
                          Text('Validé', style: TextStyle(color: BColors.brandGreen, fontSize: 12, fontWeight: FontWeight.bold)),
                        ],
                      )
                    else if (isLocked)
                      const Row(
                        children: [
                          Icon(Icons.lock, color: Colors.grey, size: 16),
                          SizedBox(width: 4),
                          Text('Verrouillé', style: TextStyle(color: Colors.grey, fontSize: 12)),
                        ],
                      )
                    else
                      const Row(
                        children: [
                          Icon(Icons.play_circle_fill, color: BColors.brandBlue, size: 16),
                          SizedBox(width: 4),
                          Text('En cours', style: TextStyle(color: BColors.brandBlue, fontSize: 12, fontWeight: FontWeight.bold)),
                        ],
                      ),
                  ],
                ),
                const SizedBox(height: BSpace.x2),
                Text(
                  module.title,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: isLocked ? BColors.textSecondary : BColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  module.description,
                  style: const TextStyle(fontSize: 13, color: BColors.textSecondary, height: 1.3),
                ),
                const SizedBox(height: BSpace.x3),
                Row(
                  children: [
                    Icon(Icons.timer_outlined, size: 14, color: isLocked ? Colors.grey : BColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(
                      '${module.durationMinutes} min',
                      style: TextStyle(fontSize: 12, color: isLocked ? Colors.grey : BColors.textSecondary),
                    ),
                    const SizedBox(width: BSpace.x4),
                    Icon(Icons.menu_book, size: 14, color: isLocked ? Colors.grey : BColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(
                      '${module.completedLessons}/${module.totalLessons} leçons',
                      style: TextStyle(fontSize: 12, color: isLocked ? Colors.grey : BColors.textSecondary),
                    ),
                    const Spacer(),
                    if (!isLocked)
                      Text(
                        'Accéder →',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: isCompleted ? BColors.brandGreen : BColors.brandBlue,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _openModuleModal(BuildContext context, WidgetRef ref, TrainingModuleItem module) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(BRadius.xl)),
      ),
      builder: (ctx) => Consumer(
        builder: (context, ref, _) {
          final detailAsync = ref.watch(trainingModuleDetailProvider(module.id));
          return detailAsync.when(
            data: (detail) {
              final lessons = (detail['lessons'] as List<dynamic>?) ?? [];
              final quiz = detail['quiz'] as Map<String, dynamic>?;

              return Padding(
                padding: const EdgeInsets.all(BSpace.x6),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text('Mois ${module.month} — Leçons', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        const Spacer(),
                        IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(ctx)),
                      ],
                    ),
                    Text(module.title, style: const TextStyle(color: BColors.textSecondary, fontSize: 14)),
                    const SizedBox(height: BSpace.x4),
                    ...lessons.map((l) {
                      final isDone = (l['isCompleted'] as bool?) ?? false;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: CircleAvatar(
                          backgroundColor: isDone ? BColors.brandGreen.withValues(alpha: 0.1) : BColors.brandBlue.withValues(alpha: 0.1),
                          child: Icon(
                            isDone ? Icons.check : Icons.headphones,
                            color: isDone ? BColors.brandGreen : BColors.brandBlue,
                            size: 18,
                          ),
                        ),
                        title: Text(l['title'] as String, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                        subtitle: Text('${l['durationMinutes']} min', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                        trailing: const Icon(Icons.chevron_right, color: Colors.grey),
                        onTap: () {
                          Navigator.pop(ctx);
                          context.push('/training/lesson/${l['id']}');
                        },
                      );
                    }),
                    if (quiz != null) ...[
                      const Divider(height: 32),
                      Container(
                        padding: const EdgeInsets.all(BSpace.x4),
                        decoration: BoxDecoration(
                          color: BColors.brandOrange.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(BRadius.md),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.quiz, color: BColors.brandOrange),
                            const SizedBox(width: BSpace.x3),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(quiz['title'] as String, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                  const Text('Requis pour valider le mois', style: TextStyle(fontSize: 11, color: BColors.textSecondary)),
                                ],
                              ),
                            ),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: BColors.brandOrange,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              ),
                              onPressed: () {
                                Navigator.pop(ctx);
                                context.push('/training/quiz/${module.id}');
                              },
                              child: const Text('Passer le Quiz'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              );
            },
            loading: () => const SizedBox(height: 250, child: Center(child: CircularProgressIndicator())),
            error: (e, _) => SizedBox(height: 200, child: Center(child: Text('Erreur: $e'))),
          );
        },
      ),
    );
  }
}
