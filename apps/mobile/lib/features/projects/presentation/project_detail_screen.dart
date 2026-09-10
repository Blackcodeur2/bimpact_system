import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/formatters.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../application/projects_providers.dart';

class ProjectDetailScreen extends ConsumerWidget {
  const ProjectDetailScreen({super.key, required this.projectId});
  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectAsync = ref.watch(projectDetailProvider(projectId));

    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Détail du projet'),
      ),
      body: projectAsync.when(
        data: (p) {
          final statusColor = switch (p.status) {
            'APPROVED' || 'FUNDED' => BColors.brandGreen,
            'REJECTED' => Colors.red,
            'UNDER_REVIEW' => BColors.brandOrange,
            _ => BColors.brandBlue,
          };

          return ListView(
            padding: const EdgeInsets.all(BSpace.x4),
            children: [
              Container(
                padding: const EdgeInsets.all(BSpace.x5),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(BRadius.xl),
                  border: Border.all(color: BColors.border),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.03),
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
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: statusColor.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(BRadius.sm),
                          ),
                          child: Text(
                            p.statusLabel,
                            style: TextStyle(color: statusColor, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const Spacer(),
                        Text('${p.city} • ${p.sector}', style: const TextStyle(color: BColors.textSecondary, fontSize: 12)),
                      ],
                    ),
                    const SizedBox(height: BSpace.x3),
                    Text(
                      p.title,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BColors.textPrimary),
                    ),
                    if (p.locationDetail != null) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.place, size: 14, color: Colors.grey),
                          const SizedBox(width: 4),
                          Text(p.locationDetail!, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                        ],
                      ),
                    ],
                    const Divider(height: 32),

                    // Montants
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _buildStat('Budget total', formatXaf(p.estimatedBudget)),
                        _buildStat('Apport personnel', formatXaf(p.personalContribution)),
                        _buildStat('Subvention', formatXaf(p.grantRequested), color: BColors.brandBlue),
                      ],
                    ),
                  ],
                ),
              ),

              if (p.reviewFeedback != null) ...[
                const SizedBox(height: BSpace.x4),
                Container(
                  padding: const EdgeInsets.all(BSpace.x4),
                  decoration: BoxDecoration(
                    color: BColors.brandOrange.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(BRadius.lg),
                    border: Border.all(color: BColors.brandOrange.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.feedback_outlined, color: BColors.brandOrange),
                      const SizedBox(width: BSpace.x3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Retour du comité d’instruction', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                            const SizedBox(height: 4),
                            Text(p.reviewFeedback!, style: const TextStyle(fontSize: 13, height: 1.4)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: BSpace.x6),
              const Text(
                'Description détaillée',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BColors.textPrimary),
              ),
              const SizedBox(height: BSpace.x2),
              Container(
                padding: const EdgeInsets.all(BSpace.x4),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(BRadius.lg),
                  border: Border.all(color: BColors.border),
                ),
                child: Text(
                  p.description,
                  style: const TextStyle(fontSize: 14, height: 1.5, color: BColors.textPrimary),
                ),
              ),

              const SizedBox(height: BSpace.x6),
              const Text(
                'Jalons de décaissement',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BColors.textPrimary),
              ),
              const SizedBox(height: BSpace.x2),

              if (p.milestones.isEmpty)
                const Text('Aucun jalon défini pour le moment.', style: TextStyle(color: Colors.grey))
              else
                ...p.milestones.asMap().entries.map((entry) {
                  final index = entry.key;
                  final m = entry.value;
                  return Container(
                    margin: const EdgeInsets.only(bottom: BSpace.x3),
                    padding: const EdgeInsets.all(BSpace.x4),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(BRadius.md),
                      border: Border.all(color: m.isCompleted ? BColors.brandGreen.withValues(alpha: 0.3) : BColors.border),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 14,
                          backgroundColor: m.isCompleted ? BColors.brandGreen : BColors.surface,
                          child: Icon(
                            m.isCompleted ? Icons.check : Icons.circle_outlined,
                            size: 16,
                            color: m.isCompleted ? Colors.white : Colors.grey,
                          ),
                        ),
                        const SizedBox(width: BSpace.x3),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Jalon ${index + 1} : ${m.title}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                              Text(formatXaf(m.amount), style: const TextStyle(fontSize: 12, color: BColors.brandBlue, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: AppErrorState(message: 'Impossible de charger le projet.', onRetry: () => ref.refresh(projectDetailProvider(projectId)))),
      ),
    );
  }

  Widget _buildStat(String label, String value, {Color? color}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: color ?? BColors.textPrimary)),
      ],
    );
  }
}
