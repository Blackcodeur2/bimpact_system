import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format/money_format.dart';
import '../../core/format/phone_format.dart';
import '../../core/network/app_failure.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/feedback.dart';
import '../../core/widgets/fields.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';
import '../projects/application/projects_providers.dart';
import 'companies_data.dart';

/// Mes entreprises (fondateur ou membre de l'équipe).
class CompaniesScreen extends ConsumerWidget {
  const CompaniesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final companies = ref.watch(myCompaniesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Mes entreprises')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myCompaniesProvider);
          try {
            await ref.read(myCompaniesProvider.future);
          } catch (_) {}
        },
        child: companies.when(
          loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 2)),
          error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(myCompaniesProvider)),
          data: (items) => ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
            if (items.isEmpty)
              Card(
                child: EmptyState(
                  icon: Icons.storefront_outlined,
                  title: 'Aucune entreprise',
                  message: 'Une entreprise se crée à partir d’un projet approuvé par le comité. Vous verrez aussi ici les entreprises qui vous ont recruté.',
                  action: OutlinedButton(onPressed: () => context.push('/projects'), child: const Text('Voir mes projets')),
                ),
              ),
            for (final company in items)
              Card(
                margin: const EdgeInsets.only(bottom: BSpace.x3),
                child: ListTile(
                  minTileHeight: 72,
                  leading: const CircleAvatar(backgroundColor: BColors.growth50, child: Icon(Icons.storefront_rounded, color: BColors.growth600)),
                  title: Text(company.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(
                    '${company.sector} · ${company.city}\n${company.membersCount} membre${company.membersCount > 1 ? 's' : ''} · '
                    '${company.openJobsCount} offre${company.openJobsCount > 1 ? 's' : ''} ouverte${company.openJobsCount > 1 ? 's' : ''}',
                  ),
                  isThreeLine: true,
                  trailing: StatusBadge(label: company.isOwner ? 'Fondateur' : 'Membre', tone: company.isOwner ? BadgeTone.success : BadgeTone.info),
                  onTap: () => context.push('/companies/${company.id}'),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}

/// Création d'une entreprise à partir d'un projet approuvé.
class CreateCompanyScreen extends ConsumerStatefulWidget {
  const CreateCompanyScreen({super.key, required this.projectId});
  final String projectId;

  @override
  ConsumerState<CreateCompanyScreen> createState() => _CreateCompanyScreenState();
}

class _CreateCompanyScreenState extends ConsumerState<CreateCompanyScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _sector = TextEditingController();
  final _city = TextEditingController();
  final _description = TextEditingController();
  final _phone = TextEditingController();
  bool _saving = false;
  bool _prefilled = false;
  String? _error;

  @override
  void dispose() {
    for (final controller in [_name, _sector, _city, _description, _phone]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final company = await ref.read(companiesRepositoryProvider).create({
        'projectId': widget.projectId,
        'name': _name.text.trim(),
        'sector': _sector.text.trim(),
        'city': _city.text.trim(),
        if (_description.text.trim().isNotEmpty) 'description': _description.text.trim(),
        if (_phone.text.trim().isNotEmpty) 'phone': CameroonPhone.toE164(_phone.text),
      });
      ref
        ..invalidate(myCompaniesProvider)
        ..invalidate(projectDetailProvider(widget.projectId))
        ..invalidate(projectsListProvider);
      if (mounted) context.pushReplacement('/companies/${company.id}');
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final project = ref.watch(projectDetailProvider(widget.projectId)).valueOrNull;
    if (project != null && !_prefilled) {
      _prefilled = true;
      _name.text = project.summary.title;
      _sector.text = project.summary.sector ?? '';
      _city.text = project.summary.city ?? '';
      _description.text = project.description ?? '';
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Créer mon entreprise')),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
          const FieldLabel('Nom de l’entreprise'),
          TextFormField(controller: _name, maxLength: 120, validator: (v) => (v ?? '').trim().length < 2 ? 'Nom requis.' : null),
          const FieldLabel('Secteur'),
          TextFormField(controller: _sector, maxLength: 80, validator: (v) => (v ?? '').trim().length < 2 ? 'Secteur requis.' : null),
          const FieldLabel('Ville'),
          TextFormField(controller: _city, maxLength: 60, validator: (v) => (v ?? '').trim().length < 2 ? 'Ville requise.' : null),
          const FieldLabel('Présentation (facultatif)'),
          TextFormField(controller: _description, minLines: 3, maxLines: 6, maxLength: 2000),
          const FieldLabel('Téléphone de l’entreprise (facultatif)'),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            validator: (v) => (v ?? '').trim().isEmpty || CameroonPhone.isValid(v!) ? null : 'Numéro mobile camerounais invalide.',
          ),
          const SizedBox(height: BSpace.x4),
          if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x4)],
          LoadingButton(label: 'Créer l’entreprise', loading: _saving, onPressed: _submit),
        ]),
      ),
    );
  }
}

/// Fiche entreprise : équipe et offres ; gestion réservée au fondateur.
class CompanyDetailScreen extends ConsumerWidget {
  const CompanyDetailScreen({super.key, required this.companyId});
  final String companyId;

  Future<void> _run(BuildContext context, WidgetRef ref, Future<Object?> Function() action, String success) async {
    try {
      await action();
      ref
        ..invalidate(companyProvider(companyId))
        ..invalidate(myCompaniesProvider);
      if (context.mounted) showSuccessSnackBar(context, success);
    } on AppFailure catch (failure) {
      if (context.mounted) showFailureSnackBar(context, failure);
    }
  }

  Future<void> _addMember(BuildContext context, WidgetRef ref) async {
    final name = TextEditingController();
    final role = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Ajouter un membre'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nom complet')),
          const SizedBox(height: BSpace.x3),
          TextField(controller: role, decoration: const InputDecoration(labelText: 'Rôle')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, BSize.touchTarget)), onPressed: () => Navigator.pop(ctx, true), child: const Text('Ajouter')),
        ],
      ),
    );
    if (confirmed == true && context.mounted) {
      await _run(
        context,
        ref,
        () => ref.read(companiesRepositoryProvider).addMember(companyId, fullName: name.text.trim(), role: role.text.trim()),
        'Membre ajouté.',
      );
    }
    name.dispose();
    role.dispose();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final company = ref.watch(companyProvider(companyId));
    return Scaffold(
      appBar: AppBar(title: const Text('Entreprise')),
      body: company.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 4)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(companyProvider(companyId))),
        data: (c) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(companyProvider(companyId));
            try {
              await ref.read(companyProvider(companyId).future);
            } catch (_) {}
          },
          child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(BSpace.x4),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(c.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
                    StatusBadge(label: c.isActive ? 'Active' : c.status == 'SUSPENDED' ? 'Suspendue' : 'Fermée', tone: c.isActive ? BadgeTone.success : BadgeTone.neutral),
                  ]),
                  Text('${c.sector} · ${c.city}', style: const TextStyle(color: BColors.textMuted)),
                  if (c.description != null) ...[const SizedBox(height: BSpace.x2), Text(c.description!, style: const TextStyle(height: 1.4))],
                  if (c.projectTitle != null) ...[
                    const SizedBox(height: BSpace.x2),
                    InkWell(
                      onTap: () => context.push('/projects/${c.projectId}'),
                      child: Text('Projet d’origine : ${c.projectTitle}', style: const TextStyle(color: BColors.primary600, fontWeight: FontWeight.w600)),
                    ),
                  ],
                  Text('Créée le ${formatDate(c.createdAt)}', style: const TextStyle(color: BColors.textMuted, fontSize: 12)),
                ]),
              ),
            ),
            const SizedBox(height: BSpace.x6),
            Row(children: [
              Expanded(child: Text('Équipe (${c.members.length})', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
              if (c.isOwner && c.isActive)
                TextButton.icon(onPressed: () => _addMember(context, ref), icon: const Icon(Icons.person_add_alt), label: const Text('Ajouter')),
            ]),
            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(children: [
                for (final member in c.members)
                  ListTile(
                    leading: CircleAvatar(child: Text(member.fullName.isEmpty ? '?' : member.fullName[0].toUpperCase())),
                    title: Text(member.fullName, style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${member.role} · depuis le ${formatDate(member.joinedAt)}'),
                    trailing: c.isOwner && !member.isOwner
                        ? IconButton(
                            tooltip: 'Retirer de l’équipe',
                            onPressed: () => _run(context, ref, () => ref.read(companiesRepositoryProvider).removeMember(companyId, member.id), 'Membre retiré.'),
                            icon: const Icon(Icons.person_remove_outlined, color: BColors.danger500),
                          )
                        : null,
                  ),
              ]),
            ),
            const SizedBox(height: BSpace.x6),
            Row(children: [
              Expanded(child: Text('Offres d’emploi', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
              if (c.isOwner && c.isActive)
                TextButton.icon(onPressed: () => context.push('/companies/$companyId/jobs/new'), icon: const Icon(Icons.add), label: const Text('Publier')),
            ]),
            if (c.jobs.isEmpty)
              const Text('Aucune offre publiée.', style: TextStyle(color: BColors.textMuted))
            else
              for (final job in c.jobs)
                Card(
                  margin: const EdgeInsets.only(bottom: BSpace.x2),
                  child: ListTile(
                    title: Text(job.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(
                      '${job.location} · ${job.slots} poste${job.slots > 1 ? 's' : ''}'
                      '${job.applicationsTotal == null ? '' : '\n${job.applicationsTotal} candidature${job.applicationsTotal! > 1 ? 's' : ''}, ${job.applicationsPending} à traiter'}',
                    ),
                    isThreeLine: job.applicationsTotal != null,
                    trailing: StatusBadge(label: job.isActive ? 'Ouverte' : 'Fermée', tone: job.isActive ? BadgeTone.success : BadgeTone.neutral),
                    onTap: c.isOwner ? () => context.push('/companies/$companyId/jobs/${job.id}/applications') : null,
                  ),
                ),
          ]),
        ),
      ),
    );
  }
}

/// Publication d'une offre d'emploi par le fondateur.
class JobOfferFormScreen extends ConsumerStatefulWidget {
  const JobOfferFormScreen({super.key, required this.companyId});
  final String companyId;

  @override
  ConsumerState<JobOfferFormScreen> createState() => _JobOfferFormScreenState();
}

class _JobOfferFormScreenState extends ConsumerState<JobOfferFormScreen> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _sector = TextEditingController();
  final _location = TextEditingController();
  final _description = TextEditingController();
  final _requirements = TextEditingController();
  final _salary = TextEditingController();
  final _slots = TextEditingController(text: '1');
  final _skills = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final controller in [_title, _sector, _location, _description, _requirements, _salary, _slots, _skills]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await ref.read(companiesRepositoryProvider).publishJob(widget.companyId, {
        'title': _title.text.trim(),
        'sector': _sector.text.trim(),
        'location': _location.text.trim(),
        'description': _description.text.trim(),
        if (_requirements.text.trim().isNotEmpty) 'requirements': _requirements.text.trim(),
        if (_salary.text.trim().isNotEmpty) 'salaryHint': _salary.text.trim(),
        'slots': int.parse(_slots.text),
        'skills': _skills.text.split(',').map((skill) => skill.trim()).where((skill) => skill.length >= 2).take(10).toList(),
      });
      ref.invalidate(companyProvider(widget.companyId));
      if (mounted) {
        showSuccessSnackBar(context, 'Offre publiée.');
        context.pop();
      }
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Publier une offre')),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
          const FieldLabel('Intitulé du poste'),
          TextFormField(controller: _title, maxLength: 120, validator: (v) => (v ?? '').trim().length < 3 ? '3 caractères minimum.' : null),
          const FieldLabel('Secteur'),
          TextFormField(controller: _sector, maxLength: 80, validator: (v) => (v ?? '').trim().length < 2 ? 'Secteur requis.' : null),
          const FieldLabel('Lieu de travail'),
          TextFormField(controller: _location, maxLength: 120, validator: (v) => (v ?? '').trim().length < 2 ? 'Lieu requis.' : null),
          const FieldLabel('Description du poste'),
          TextFormField(
            controller: _description,
            minLines: 4,
            maxLines: 8,
            maxLength: 3000,
            validator: (v) => (v ?? '').trim().length < 20 ? '20 caractères minimum.' : null,
          ),
          const FieldLabel('Prérequis (facultatif)'),
          TextFormField(controller: _requirements, minLines: 2, maxLines: 4, maxLength: 1000),
          const FieldLabel('Rémunération indicative (facultatif)'),
          TextFormField(controller: _salary, maxLength: 80, decoration: const InputDecoration(hintText: 'Ex. 80 000 FCFA / mois')),
          const FieldLabel('Nombre de postes'),
          TextFormField(
            controller: _slots,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(3)],
            validator: (v) {
              final slots = int.tryParse(v ?? '') ?? 0;
              return slots < 1 || slots > 100 ? 'Entre 1 et 100.' : null;
            },
          ),
          const FieldLabel('Compétences (séparées par des virgules, facultatif)'),
          TextFormField(controller: _skills, decoration: const InputDecoration(hintText: 'Ex. Permis A, mécanique moto')),
          const SizedBox(height: BSpace.x4),
          if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x4)],
          LoadingButton(label: 'Publier l’offre', loading: _saving, onPressed: _submit),
        ]),
      ),
    );
  }
}

/// Candidatures reçues pour une offre ; le numéro du candidat n'apparaît qu'une fois la prise de contact décidée.
class JobApplicationsScreen extends ConsumerWidget {
  const JobApplicationsScreen({super.key, required this.companyId, required this.jobId});
  final String companyId;
  final String jobId;

  Future<void> _update(BuildContext context, WidgetRef ref, JobApplicant applicant, String status) async {
    try {
      await ref.read(companiesRepositoryProvider).updateApplication(companyId, applicant.id, status);
      ref
        ..invalidate(jobApplicationsProvider((companyId, jobId)))
        ..invalidate(companyProvider(companyId));
    } on AppFailure catch (failure) {
      if (context.mounted) showFailureSnackBar(context, failure);
    }
  }

  Future<void> _closeJob(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Fermer l’offre ?'),
        content: const Text('Plus personne ne pourra postuler. Les candidatures reçues restent consultables.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, BSize.touchTarget)), onPressed: () => Navigator.pop(ctx, true), child: const Text('Fermer')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(companiesRepositoryProvider).closeJob(companyId, jobId);
      ref
        ..invalidate(jobApplicationsProvider((companyId, jobId)))
        ..invalidate(companyProvider(companyId));
    } on AppFailure catch (failure) {
      if (context.mounted) showFailureSnackBar(context, failure);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final applications = ref.watch(jobApplicationsProvider((companyId, jobId)));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Candidatures'),
        actions: [
          if (applications.valueOrNull?.isActive ?? false)
            TextButton(style: TextButton.styleFrom(foregroundColor: Colors.white), onPressed: () => _closeJob(context, ref), child: const Text('Fermer l’offre')),
        ],
      ),
      body: applications.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 3)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(jobApplicationsProvider((companyId, jobId)))),
        data: (data) => ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
          Text(data.jobTitle, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: BSpace.x3),
          if (data.items.isEmpty)
            const Card(child: EmptyState(icon: Icons.inbox_outlined, title: 'Aucune candidature', message: 'Les candidatures reçues apparaîtront ici.')),
          for (final applicant in data.items)
            Card(
              margin: const EdgeInsets.only(bottom: BSpace.x3),
              child: Padding(
                padding: const EdgeInsets.all(BSpace.x4),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(applicant.fullName.isEmpty ? 'Candidat' : applicant.fullName, style: const TextStyle(fontWeight: FontWeight.w800))),
                    StatusBadge(label: applicationStatusLabel(applicant.status), tone: applicationStatusTone(applicant.status)),
                  ]),
                  Text(
                    '${applicant.city ?? ''}${applicant.identityVerified ? ' · identité vérifiée' : ''} · reçue le ${formatDate(applicant.createdAt)}',
                    style: const TextStyle(color: BColors.textMuted, fontSize: 13),
                  ),
                  if (applicant.message != null) ...[const SizedBox(height: BSpace.x2), Text('« ${applicant.message} »')],
                  if (applicant.phone != null)
                    TextButton.icon(
                      onPressed: () => launchUrl(Uri(scheme: 'tel', path: applicant.phone)),
                      icon: const Icon(Icons.call_outlined),
                      label: Text('+237 ${CameroonPhone.pretty(applicant.phone!)}'),
                    ),
                  if (applicant.allowedTransitions.isNotEmpty) ...[
                    const SizedBox(height: BSpace.x2),
                    Wrap(spacing: BSpace.x2, runSpacing: BSpace.x2, children: [
                      for (final status in applicant.allowedTransitions)
                        OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(0, BSize.touchTarget),
                            foregroundColor: status == 'REJECTED' ? BColors.danger500 : null,
                            side: status == 'REJECTED' ? const BorderSide(color: BColors.danger500) : null,
                          ),
                          onPressed: () => _update(context, ref, applicant, status),
                          child: Text(applicationActionLabel(status)),
                        ),
                    ]),
                  ],
                ]),
              ),
            ),
        ]),
      ),
    );
  }
}
