import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/money_format.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/sync/sync_queue.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../core/widgets/sync_status.dart';
import '../../companies/companies_data.dart';
import '../application/recruitment_providers.dart';
import '../domain/job_models.dart';

/// Opportunités d'emploi (cahier §7.20) : recherche, candidature et suivi.
class RecruitmentScreen extends StatelessWidget {
  const RecruitmentScreen({super.key, this.initialTab = 0});
  final int initialTab;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      initialIndex: initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Emploi'),
          bottom: const TabBar(
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white70,
            indicatorColor: BColors.accent500,
            tabs: [Tab(text: 'Offres'), Tab(text: 'Mes candidatures')],
          ),
        ),
        body: const Column(children: [
          SyncStatusBanner(),
          Expanded(child: TabBarView(children: [_OffersTab(), _ApplicationsTab()])),
        ]),
      ),
    );
  }
}

class _OffersTab extends ConsumerStatefulWidget {
  const _OffersTab();

  @override
  ConsumerState<_OffersTab> createState() => _OffersTabState();
}

class _OffersTabState extends ConsumerState<_OffersTab> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _query = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => setState(() => _query = value.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final offers = ref.watch(jobOffersProvider(_query));
    return Column(children: [
      Padding(
        padding: const EdgeInsets.all(BSpace.x4),
        child: TextField(
          controller: _search,
          onChanged: _onSearch,
          textInputAction: TextInputAction.search,
          decoration: const InputDecoration(hintText: 'Rechercher un poste, un employeur…', prefixIcon: Icon(Icons.search_rounded)),
        ),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(jobOffersProvider(_query));
            try {
              await ref.read(jobOffersProvider(_query).future);
            } catch (_) {}
          },
          child: offers.when(
            loading: () => const Padding(padding: EdgeInsets.symmetric(horizontal: BSpace.x4), child: SkeletonList(count: 3)),
            error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(jobOffersProvider(_query))),
            data: (state) {
              if (state.items.isEmpty) {
                return ListView(children: [
                  EmptyState(
                    icon: Icons.work_outline_rounded,
                    title: _query.isEmpty ? 'Aucune offre pour le moment' : 'Aucune offre ne correspond',
                    message: 'Les offres publiées par les entreprises du programme apparaîtront ici.',
                  ),
                ]);
              }
              return NotificationListener<ScrollNotification>(
                onNotification: (notification) {
                  if (notification.metrics.extentAfter < 300) ref.read(jobOffersProvider(_query).notifier).loadMore();
                  return false;
                },
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(BSpace.x4, 0, BSpace.x4, BSpace.x4),
                  itemCount: state.items.length + (state.loadingMore ? 1 : 0),
                  itemBuilder: (context, index) => index >= state.items.length
                      ? const Padding(padding: EdgeInsets.all(BSpace.x4), child: Center(child: CircularProgressIndicator()))
                      : _OfferCard(offer: state.items[index]),
                ),
              );
            },
          ),
        ),
      ),
    ]);
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({required this.offer});
  final JobOfferItem offer;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: BSpace.x3),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (_) => _OfferSheet(offer: offer),
        ),
        child: Padding(
          padding: const EdgeInsets.all(BSpace.x4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(offer.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5))),
              if (offer.hasApplied)
                StatusBadge(label: applicationStatusLabel(offer.application!.status), tone: applicationStatusTone(offer.application!.status)),
            ]),
            const SizedBox(height: BSpace.x1),
            Text('${offer.company} · ${offer.location}', style: const TextStyle(color: BColors.textMuted)),
            if (offer.salaryHint != null) ...[
              const SizedBox(height: BSpace.x1),
              Text(offer.salaryHint!, style: const TextStyle(color: BColors.growth700, fontWeight: FontWeight.w700)),
            ],
            const SizedBox(height: BSpace.x2),
            Text(offer.description, maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: BSpace.x2),
            Text('Publiée le ${formatDate(offer.createdAt)} · ${offer.slots} poste${offer.slots > 1 ? 's' : ''}',
                style: const TextStyle(color: BColors.textMuted, fontSize: 12)),
          ]),
        ),
      ),
    );
  }
}

class _OfferSheet extends ConsumerStatefulWidget {
  const _OfferSheet({required this.offer});
  final JobOfferItem offer;

  @override
  ConsumerState<_OfferSheet> createState() => _OfferSheetState();
}

class _OfferSheetState extends ConsumerState<_OfferSheet> {
  final _message = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final outcome = await ref.read(syncQueueProvider.notifier).submit(
            kind: 'jobs',
            label: 'Candidature « ${widget.offer.title} »',
            method: 'POST',
            path: '/jobs/${widget.offer.id}/apply',
            body: {if (_message.text.trim().isNotEmpty) 'message': _message.text.trim()},
          );
      if (!mounted) return;
      Navigator.pop(context);
      if (outcome is SubmitSent) {
        showSuccessSnackBar(context, 'Candidature envoyée à ${widget.offer.company}.');
      } else {
        showInfoSnackBar(context, 'Pas de réseau : votre candidature sera envoyée automatiquement.');
      }
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final offer = widget.offer;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(BSpace.x4, 0, BSpace.x4, BSpace.x4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(offer.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            Text('${offer.company} · ${offer.location} · ${offer.sector}', style: const TextStyle(color: BColors.textMuted)),
            if (offer.salaryHint != null) Text(offer.salaryHint!, style: const TextStyle(color: BColors.growth700, fontWeight: FontWeight.w700)),
            const SizedBox(height: BSpace.x3),
            Text(offer.description, style: const TextStyle(height: 1.45)),
            if (offer.requirements != null) ...[
              const SizedBox(height: BSpace.x3),
              const Text('Prérequis', style: TextStyle(fontWeight: FontWeight.w800)),
              Text(offer.requirements!),
            ],
            if (offer.skills.isNotEmpty) ...[
              const SizedBox(height: BSpace.x3),
              Wrap(spacing: BSpace.x2, runSpacing: BSpace.x2, children: [for (final skill in offer.skills) Chip(label: Text(skill))]),
            ],
            const SizedBox(height: BSpace.x4),
            if (offer.isOwnCompany)
              const Text('Cette offre est publiée par votre entreprise.', style: TextStyle(color: BColors.textMuted))
            else if (offer.hasApplied)
              Text('Candidature ${applicationStatusLabel(offer.application!.status).toLowerCase()} le ${formatDate(offer.application!.createdAt)}.',
                  style: const TextStyle(fontWeight: FontWeight.w700))
            else ...[
              TextField(
                controller: _message,
                minLines: 2,
                maxLines: 4,
                maxLength: 500,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Message pour l’employeur (facultatif)'),
              ),
              const Text(
                'L’employeur verra votre nom, votre ville et ce message. Votre numéro ne lui est communiqué que s’il décide de vous contacter.',
                style: TextStyle(color: BColors.textMuted, fontSize: 12.5),
              ),
              const SizedBox(height: BSpace.x3),
              if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x3)],
              LoadingButton(label: 'Postuler', loading: _sending, onPressed: _apply),
            ],
          ]),
        ),
      ),
    );
  }
}

class _ApplicationsTab extends ConsumerWidget {
  const _ApplicationsTab();

  Future<void> _withdraw(BuildContext context, WidgetRef ref, MyJobApplication application) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Retirer la candidature ?'),
        content: Text('Votre candidature pour « ${application.offerTitle} » ne sera plus examinée.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, BSize.touchTarget)), onPressed: () => Navigator.pop(ctx, true), child: const Text('Retirer')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(recruitmentRepositoryProvider).withdraw(application.id);
      ref.invalidate(myApplicationsProvider);
    } on AppFailure catch (failure) {
      if (context.mounted) showFailureSnackBar(context, failure);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final applications = ref.watch(myApplicationsProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(myApplicationsProvider);
        try {
          await ref.read(myApplicationsProvider.future);
        } catch (_) {}
      },
      child: applications.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 3)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(myApplicationsProvider)),
        data: (items) => items.isEmpty
            ? ListView(children: const [
                EmptyState(icon: Icons.assignment_outlined, title: 'Aucune candidature', message: 'Vos candidatures et leur suivi apparaîtront ici.'),
              ])
            : ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
                for (final application in items)
                  Card(
                    margin: const EdgeInsets.only(bottom: BSpace.x3),
                    child: Padding(
                      padding: const EdgeInsets.all(BSpace.x4),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(application.offerTitle, style: const TextStyle(fontWeight: FontWeight.w800))),
                          StatusBadge(label: applicationStatusLabel(application.status), tone: applicationStatusTone(application.status)),
                        ]),
                        Text('${application.company} · ${application.location}', style: const TextStyle(color: BColors.textMuted)),
                        Text('Mise à jour le ${formatDate(application.updatedAt)}', style: const TextStyle(color: BColors.textMuted, fontSize: 12)),
                        if (application.canWithdraw)
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(onPressed: () => _withdraw(context, ref, application), child: const Text('Retirer')),
                          ),
                      ]),
                    ),
                  ),
              ]),
      ),
    );
  }
}
