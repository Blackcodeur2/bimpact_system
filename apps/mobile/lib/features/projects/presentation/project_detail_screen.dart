import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/money_format.dart';
import '../../../core/network/api_url.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/document_picker.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../core/widgets/sync_status.dart';
import '../application/projects_providers.dart';
import '../domain/project_models.dart';

/// Fiche projet : état, retour du comité, complétude, justificatifs, jalons et entreprise.
class ProjectDetailScreen extends ConsumerStatefulWidget {
  const ProjectDetailScreen({super.key, required this.projectId});
  final String projectId;

  @override
  ConsumerState<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends ConsumerState<ProjectDetailScreen> {
  bool _busy = false;

  Future<void> _submit(ProjectDetail project) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Soumettre au comité ?'),
        content: const Text('Le projet ne pourra plus être modifié pendant son examen, sauf si le comité demande des corrections.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, BSize.touchTarget)), onPressed: () => Navigator.pop(ctx, true), child: const Text('Soumettre')),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _busy = true);
    try {
      await ref.read(projectsRepositoryProvider).submit(project.summary.id);
      ref
        ..invalidate(projectDetailProvider(project.summary.id))
        ..invalidate(projectsListProvider);
      if (mounted) showSuccessSnackBar(context, 'Projet soumis au comité.');
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
      ref.invalidate(projectDetailProvider(project.summary.id));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addDocument(ProjectDetail project) async {
    final type = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          for (final entry in projectDocumentTypes.entries) ListTile(title: Text(entry.value), onTap: () => Navigator.pop(ctx, entry.key)),
        ]),
      ),
    );
    if (type == null || !mounted) return;
    final picked = await pickDocumentPhoto(context);
    if (picked == null) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(projectsRepositoryProvider)
          .uploadDocument(projectId: project.summary.id, type: type, bytes: picked.bytes, filename: picked.filename);
      ref.invalidate(projectDetailProvider(project.summary.id));
      if (mounted) showSuccessSnackBar(context, 'Document ajouté.');
    } on NetworkFailure {
      if (mounted) showErrorSnackBar(context, 'L’envoi d’un document nécessite le réseau.');
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final project = ref.watch(projectDetailProvider(widget.projectId));
    return Scaffold(
      appBar: AppBar(title: const Text('Projet')),
      body: project.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 4)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(projectDetailProvider(widget.projectId))),
        data: (p) {
          final s = p.summary;
          final text = Theme.of(context).textTheme;
          return Column(children: [
            const SyncStatusBanner(),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(projectDetailProvider(widget.projectId));
                  try {
                    await ref.read(projectDetailProvider(widget.projectId).future);
                  } catch (_) {}
                },
                child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(BSpace.x4),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(s.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
                          StatusBadge(label: projectStatusLabel(s.status), tone: projectStatusTone(s.status)),
                        ]),
                        const SizedBox(height: BSpace.x1),
                        Text(
                          [s.sector, s.city, p.locationDetail].whereType<String>().join(' · '),
                          style: const TextStyle(color: BColors.textMuted),
                        ),
                        const Divider(height: BSpace.x6),
                        _Row('Budget total', s.estimatedBudget?.formatted ?? '—'),
                        _Row('Apport personnel', p.personalContribution.formatted),
                        _Row('Subvention demandée', s.grantRequested?.formatted ?? '—'),
                        if (s.submittedAt != null) _Row('Soumis le', formatDate(s.submittedAt!)),
                      ]),
                    ),
                  ),
                  if (p.reviewFeedback != null) ...[
                    const SizedBox(height: BSpace.x3),
                    Container(
                      padding: const EdgeInsets.all(BSpace.x3),
                      decoration: BoxDecoration(
                        color: s.status == 'REJECTED' ? BColors.danger50 : s.status == 'CHANGES_REQUESTED' ? BColors.warning50 : BColors.growth50,
                        borderRadius: BorderRadius.circular(BRadius.md),
                      ),
                      child: Text('Retour du comité : ${p.reviewFeedback}', style: const TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ],
                  if (p.canEdit) ...[
                    const SizedBox(height: BSpace.x4),
                    _CompletenessCard(project: p),
                    const SizedBox(height: BSpace.x3),
                    Row(children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => context.push('/projects/${s.id}/edit'),
                          icon: const Icon(Icons.edit_outlined),
                          label: const Text('Compléter'),
                        ),
                      ),
                      const SizedBox(width: BSpace.x3),
                      Expanded(child: LoadingButton(label: 'Soumettre', loading: _busy, onPressed: p.canSubmit ? () => _submit(p) : null)),
                    ]),
                  ],
                  if (p.canCreateCompany) ...[
                    const SizedBox(height: BSpace.x4),
                    FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: BColors.growth600),
                      onPressed: () => context.push('/companies/new?projectId=${s.id}'),
                      icon: const Icon(Icons.storefront_rounded),
                      label: const Text('Créer mon entreprise'),
                    ),
                  ],
                  if (s.companyId != null) ...[
                    const SizedBox(height: BSpace.x4),
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.storefront_rounded, color: BColors.growth600),
                        title: Text(s.companyName ?? 'Mon entreprise', style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: const Text('Équipe, offres d’emploi et candidatures'),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: () => context.push('/companies/${s.companyId}'),
                      ),
                    ),
                  ],
                  for (final (title, value) in [
                    ('Description', p.description),
                    ('Problème', p.problem),
                    ('Solution', p.solution),
                    ('Clients visés', p.market),
                  ])
                    if (value != null) ...[
                      const SizedBox(height: BSpace.x4),
                      Text(title, style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                      const SizedBox(height: BSpace.x1),
                      Text(value, style: const TextStyle(height: 1.45)),
                    ],
                  if (p.budgetLines.isNotEmpty) ...[
                    const SizedBox(height: BSpace.x4),
                    Text('Détail du budget', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                    for (final line in p.budgetLines) _Row(line.label, line.amount.formatted),
                  ],
                  if (p.teamMembers.isNotEmpty) ...[
                    const SizedBox(height: BSpace.x4),
                    Text('Équipe', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                    for (final member in p.teamMembers) _Row(member.fullName, member.role),
                  ],
                  if (p.monthlyRevenue != null || p.monthlyCosts != null || p.jobsCreated != null) ...[
                    const SizedBox(height: BSpace.x4),
                    Text('Prévisions mensuelles', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                    if (p.monthlyRevenue != null) _Row('Chiffre d’affaires', p.monthlyRevenue!.formatted),
                    if (p.monthlyCosts != null) _Row('Charges', p.monthlyCosts!.formatted),
                    if (p.jobsCreated != null) _Row('Emplois créés', '${p.jobsCreated}'),
                  ],
                  const SizedBox(height: BSpace.x6),
                  Row(children: [
                    Expanded(child: Text('Documents', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
                    if (p.canAddDocuments)
                      TextButton.icon(onPressed: _busy ? null : () => _addDocument(p), icon: const Icon(Icons.upload_file_rounded), label: const Text('Ajouter')),
                  ]),
                  if (p.documents.isEmpty)
                    const Text('Aucun document.', style: TextStyle(color: BColors.textMuted))
                  else
                    for (final document in p.documents)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: document.isImage
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(BRadius.sm),
                                child: Image.network(
                                  resolveApiUrl(document.url),
                                  width: 48,
                                  height: 48,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) => const Icon(Icons.image_outlined),
                                ),
                              )
                            : const Icon(Icons.picture_as_pdf_rounded, color: BColors.danger500),
                        title: Text(projectDocumentTypes[document.type] ?? document.type),
                        subtitle: Text('Ajouté le ${formatDate(document.uploadedAt)}'),
                      ),
                  if (p.milestones.isNotEmpty) ...[
                    const SizedBox(height: BSpace.x4),
                    Text('Jalons de financement', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    for (final milestone in p.milestones)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(milestone.isCompleted ? Icons.check_circle_rounded : Icons.radio_button_unchecked, color: BColors.growth600),
                        title: Text(milestone.title),
                        subtitle: Text(milestone.targetDate == null ? milestone.amount.formatted : '${milestone.amount.formatted} · ${formatDate(milestone.targetDate!)}'),
                      ),
                  ],
                  if (p.reviews.isNotEmpty) ...[
                    const SizedBox(height: BSpace.x4),
                    Text('Décisions du comité', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    for (final review in p.reviews)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('${review.decisionLabel}${review.score == null ? '' : ' · note ${review.score}/100'}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('${review.reason}\n${formatDate(review.createdAt)}'),
                        isThreeLine: true,
                      ),
                  ],
                ]),
              ),
            ),
          ]);
        },
      ),
    );
  }
}

class _CompletenessCard extends StatelessWidget {
  const _CompletenessCard({required this.project});
  final ProjectDetail project;

  @override
  Widget build(BuildContext context) {
    if (project.missing.isEmpty && project.issues.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(BSpace.x3),
        decoration: BoxDecoration(color: BColors.growth50, borderRadius: BorderRadius.circular(BRadius.md)),
        child: const Row(children: [
          Icon(Icons.check_circle_rounded, color: BColors.growth600),
          SizedBox(width: BSpace.x2),
          Expanded(child: Text('Le projet est complet : vous pouvez le soumettre au comité.', style: TextStyle(fontWeight: FontWeight.w600))),
        ]),
      );
    }
    return Container(
      padding: const EdgeInsets.all(BSpace.x3),
      decoration: BoxDecoration(color: BColors.warning50, borderRadius: BorderRadius.circular(BRadius.md)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('À compléter avant la soumission', style: TextStyle(fontWeight: FontWeight.w800, color: BColors.warning700)),
        const SizedBox(height: BSpace.x1),
        for (final field in project.missing) Text('• ${projectFieldLabels[field] ?? field}'),
        for (final issue in project.issues) Text('• ${projectIssueLabels[issue] ?? issue}'),
      ]),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: Text(label, style: const TextStyle(color: BColors.textMuted))),
        const SizedBox(width: BSpace.x2),
        Flexible(child: Text(value, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w700))),
      ]),
    );
  }
}
