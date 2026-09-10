import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatters.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../application/projects_providers.dart';
import '../domain/project_models.dart';

class ProjectsScreen extends ConsumerWidget {
  const ProjectsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectsAsync = ref.watch(projectsListProvider);

    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Projets & Entreprises'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline),
            tooltip: 'Nouveau projet',
            onPressed: () => context.push('/projects/new'),
          ),
        ],
      ),
      body: projectsAsync.when(
        data: (projects) => RefreshIndicator(
          onRefresh: () async => ref.refresh(projectsListProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(BSpace.x4),
            children: [
              // Hero banner
              Container(
                padding: const EdgeInsets.all(BSpace.x5),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [BColors.primaryNavy, Color(0xFF1E3A8A)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(BRadius.xl),
                  boxShadow: [
                    BoxShadow(
                      color: BColors.primaryNavy.withValues(alpha: 0.25),
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
                          padding: const EdgeInsets.all(BSpace.x2),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(BRadius.md),
                          ),
                          child: const Icon(Icons.rocket_launch, color: Colors.white, size: 24),
                        ),
                        const SizedBox(width: BSpace.x3),
                        const Expanded(
                          child: Text(
                            'Financement de votre Projet',
                            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: BSpace.x3),
                    const Text(
                      'Soumettez votre business plan simplifié et bénéficiez des subventions et prêts d’honneur Benskin Impact.',
                      style: TextStyle(color: Colors.white70, fontSize: 13, height: 1.4),
                    ),
                    const SizedBox(height: BSpace.x4),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: BColors.brandOrange,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                        ),
                        onPressed: () => context.push('/projects/new'),
                        icon: const Icon(Icons.add),
                        label: const Text('Déposer un projet', style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: BSpace.x6),
              const Text(
                'Mes projets d’entreprise',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: BColors.textPrimary),
              ),
              const SizedBox(height: BSpace.x3),

              if (projects.isEmpty)
                Container(
                  padding: const EdgeInsets.all(BSpace.x6),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(BRadius.lg),
                    border: Border.all(color: BColors.border),
                  ),
                  child: Column(
                    children: [
                      const Icon(Icons.storefront_outlined, size: 48, color: Colors.grey),
                      const SizedBox(height: BSpace.x3),
                      const Text(
                        'Aucun projet déposé pour l’instant',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                      ),
                      const SizedBox(height: BSpace.x2),
                      const Text(
                        'Création d’un atelier mécanique, commerce, flotte de livraison... Déposez votre dossier dès maintenant.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: BColors.textSecondary, fontSize: 13),
                      ),
                    ],
                  ),
                )
              else
                ...projects.map((p) => _buildProjectCard(context, p)),
            ],
          ),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: AppErrorState(
            message: 'Impossible de charger vos projets.',
            onRetry: () => ref.refresh(projectsListProvider),
          ),
        ),
      ),
    );
  }

  Widget _buildProjectCard(BuildContext context, ProjectItem p) {
    final statusColor = switch (p.status) {
      'APPROVED' || 'FUNDED' => BColors.brandGreen,
      'REJECTED' => Colors.red,
      'UNDER_REVIEW' => BColors.brandOrange,
      _ => BColors.brandBlue,
    };

    return Container(
      margin: const EdgeInsets.only(bottom: BSpace.x4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(BRadius.lg),
        border: Border.all(color: BColors.border),
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
          onTap: () => context.push('/projects/${p.id}'),
          child: Padding(
            padding: const EdgeInsets.all(BSpace.x4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: BSpace.x2, vertical: 3),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(BRadius.sm),
                      ),
                      child: Text(
                        p.statusLabel,
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: statusColor),
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '${p.city} • ${p.sector}',
                      style: const TextStyle(fontSize: 12, color: BColors.textSecondary),
                    ),
                  ],
                ),
                const SizedBox(height: BSpace.x2),
                Text(
                  p.title,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BColors.textPrimary),
                ),
                const SizedBox(height: 4),
                Text(
                  p.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, color: BColors.textSecondary, height: 1.3),
                ),
                const SizedBox(height: BSpace.x4),
                Row(
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Budget total', style: TextStyle(fontSize: 11, color: Colors.grey)),
                        Text(
                          formatXaf(p.estimatedBudget),
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ],
                    ),
                    const SizedBox(width: BSpace.x6),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Subvention sollicitée', style: TextStyle(fontSize: 11, color: Colors.grey)),
                        Text(
                          formatXaf(p.grantRequested),
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: BColors.brandBlue),
                        ),
                      ],
                    ),
                    const Spacer(),
                    const Icon(Icons.arrow_forward_ios, size: 14, color: Colors.grey),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
