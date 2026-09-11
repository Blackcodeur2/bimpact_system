import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/money_format.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../core/widgets/sync_status.dart';
import '../application/projects_providers.dart';
import '../domain/project_models.dart';

/// Mes projets (cahier §7.17) et accès aux entreprises créées.
class ProjectsScreen extends ConsumerWidget {
  const ProjectsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectsListProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes projets'),
        actions: [
          IconButton(tooltip: 'Mes entreprises', onPressed: () => context.push('/companies'), icon: const Icon(Icons.storefront_outlined)),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/projects/new'),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Nouveau projet'),
      ),
      body: Column(children: [
        const SyncStatusBanner(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(projectsListProvider);
              try {
                await ref.read(projectsListProvider.future);
              } catch (_) {}
            },
            child: projects.when(
              loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 3)),
              error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(projectsListProvider)),
              data: (items) => ListView(padding: const EdgeInsets.fromLTRB(BSpace.x4, BSpace.x4, BSpace.x4, 96), children: [
                const Text(
                  'Décrivez votre idée, détaillez le budget puis soumettez le projet au comité. Vous pouvez enregistrer un brouillon à tout moment.',
                  style: TextStyle(color: BColors.textMuted),
                ),
                const SizedBox(height: BSpace.x4),
                if (items.isEmpty)
                  const Card(
                    child: EmptyState(
                      icon: Icons.lightbulb_outline_rounded,
                      title: 'Aucun projet pour le moment',
                      message: 'Commerce, atelier, service de livraison… Créez votre premier projet.',
                    ),
                  )
                else
                  for (final project in items) ProjectCard(project: project),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

class ProjectCard extends StatelessWidget {
  const ProjectCard({super.key, required this.project});
  final ProjectSummary project;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: BSpace.x3),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/projects/${project.id}'),
        child: Padding(
          padding: const EdgeInsets.all(BSpace.x4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(project.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
              StatusBadge(label: projectStatusLabel(project.status), tone: projectStatusTone(project.status)),
            ]),
            const SizedBox(height: BSpace.x1),
            Text(
              [project.sector, project.city].whereType<String>().join(' · ').ifEmpty('Brouillon à compléter'),
              style: const TextStyle(color: BColors.textMuted, fontSize: 13),
            ),
            const SizedBox(height: BSpace.x3),
            Row(children: [
              Expanded(child: _Figure('Budget', project.estimatedBudget?.formatted ?? '—')),
              Expanded(child: _Figure('Subvention demandée', project.grantRequested?.formatted ?? '—')),
            ]),
            if (project.companyName != null) ...[
              const SizedBox(height: BSpace.x2),
              Text('Entreprise : ${project.companyName}', style: const TextStyle(color: BColors.growth700, fontWeight: FontWeight.w700)),
            ],
            const SizedBox(height: BSpace.x2),
            Text('Mis à jour le ${formatDate(project.updatedAt)}', style: const TextStyle(color: BColors.textMuted, fontSize: 12)),
          ]),
        ),
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(color: BColors.textMuted, fontSize: 12)),
      Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
    ]);
  }
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}
