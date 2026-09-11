import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/money_format.dart';
import '../../../core/network/api_url.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/sync/sync_queue.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/document_picker.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../core/widgets/sync_status.dart';
import '../application/accidents_providers.dart';
import '../domain/accident_models.dart';

/// Suivi transparent d'un dossier (cahier §7.22) : décision, justificatifs, échanges et chronologie.
class AccidentDetailScreen extends ConsumerStatefulWidget {
  const AccidentDetailScreen({super.key, required this.claimId});
  final String claimId;

  @override
  ConsumerState<AccidentDetailScreen> createState() => _AccidentDetailScreenState();
}

class _AccidentDetailScreenState extends ConsumerState<AccidentDetailScreen> {
  final _message = TextEditingController();
  bool _uploading = false;
  bool _sending = false;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _addDocument() async {
    final type = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          for (final entry in accidentDocumentTypes.entries)
            ListTile(title: Text(entry.value), onTap: () => Navigator.pop(ctx, entry.key)),
        ]),
      ),
    );
    if (type == null || !mounted) return;
    final picked = await pickDocumentPhoto(context);
    if (picked == null) return;
    setState(() => _uploading = true);
    try {
      await ref
          .read(accidentsRepositoryProvider)
          .uploadDocument(claimId: widget.claimId, type: type, bytes: picked.bytes, filename: picked.filename);
      ref
        ..invalidate(accidentClaimDetailProvider(widget.claimId))
        ..invalidate(accidentClaimsProvider);
      if (mounted) showSuccessSnackBar(context, 'Justificatif envoyé.');
    } on NetworkFailure {
      if (mounted) showErrorSnackBar(context, 'L’envoi d’un justificatif nécessite le réseau. Réessayez dès que possible.');
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _send(AccidentDetail claim) async {
    final text = _message.text.trim();
    if (text.length < 2) return;
    setState(() => _sending = true);
    try {
      final outcome = await ref.read(syncQueueProvider.notifier).submit(
            kind: 'accident',
            label: 'Message pour le dossier ${claim.summary.reference}',
            method: 'POST',
            path: '/accidents/${claim.summary.id}/messages',
            body: {'message': text},
          );
      _message.clear();
      if (outcome is SubmitQueued && mounted) showInfoSnackBar(context, 'Pas de réseau : votre message sera envoyé automatiquement.');
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(accidentClaimDetailProvider(widget.claimId));
    return Scaffold(
      appBar: AppBar(title: const Text('Dossier accident')),
      body: detail.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 4)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(accidentClaimDetailProvider(widget.claimId))),
        data: (claim) {
          final s = claim.summary;
          return Column(children: [
            const SyncStatusBanner(),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(accidentClaimDetailProvider(widget.claimId));
                  try {
                    await ref.read(accidentClaimDetailProvider(widget.claimId).future);
                  } catch (_) {}
                },
                child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(BSpace.x4),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(s.reference, style: const TextStyle(color: BColors.textMuted, fontWeight: FontWeight.w700))),
                          StatusBadge(label: accidentStatusLabel(s.status), tone: accidentStatusTone(s.status)),
                        ]),
                        const SizedBox(height: BSpace.x2),
                        Text(s.location, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                        Text('${formatDateTime(s.date)} · ${s.severityLabel}${claim.thirdPartyInvolved ? ' · tiers impliqué' : ''}',
                            style: const TextStyle(color: BColors.textMuted)),
                        if (claim.hospitalName != null)
                          Text('Soins : ${claim.hospitalName}', style: const TextStyle(color: BColors.textMuted)),
                        const Divider(height: BSpace.x6),
                        _AmountRow('Frais estimés', s.requestedAmount.formatted),
                        if (s.approvedAmount != null) _AmountRow('Aide accordée', s.approvedAmount!.formatted, color: BColors.growth600),
                        if (s.disbursedAmount != null) _AmountRow('Aide versée sur votre portefeuille', s.disbursedAmount!.formatted, color: BColors.growth700),
                      ]),
                    ),
                  ),
                  if (claim.decisionReason != null) ...[
                    const SizedBox(height: BSpace.x3),
                    Container(
                      padding: const EdgeInsets.all(BSpace.x3),
                      decoration: BoxDecoration(
                        color: s.status == 'REJECTED' ? BColors.danger50 : BColors.warning50,
                        borderRadius: BorderRadius.circular(BRadius.md),
                      ),
                      child: Text('Message du comité : ${claim.decisionReason}', style: const TextStyle(fontWeight: FontWeight.w600)),
                    ),
                  ],
                  const SizedBox(height: BSpace.x3),
                  Text(
                    claim.solidarityEligible
                        ? 'Vous étiez adhérent couvert à la date de l’accident : une aide éventuelle peut être versée par le fonds de solidarité.'
                        : 'Vous n’étiez pas couvert par le fonds de solidarité à la date de l’accident. Le comité examine tout de même votre dossier.',
                    style: const TextStyle(color: BColors.textMuted, fontSize: 13),
                  ),
                  const SizedBox(height: BSpace.x6),
                  Row(children: [
                    Expanded(child: Text('Justificatifs', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
                    if (claim.canAddDocuments)
                      TextButton.icon(
                        onPressed: _uploading ? null : _addDocument,
                        icon: _uploading
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.add_a_photo_outlined),
                        label: const Text('Ajouter'),
                      ),
                  ]),
                  const SizedBox(height: BSpace.x2),
                  if (claim.documents.isEmpty)
                    const Text('Aucun justificatif pour le moment.', style: TextStyle(color: BColors.textMuted))
                  else
                    SizedBox(
                      height: 120,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: claim.documents.length,
                        separatorBuilder: (_, _) => const SizedBox(width: BSpace.x2),
                        itemBuilder: (_, index) => _DocumentTile(document: claim.documents[index]),
                      ),
                    ),
                  const SizedBox(height: BSpace.x6),
                  Text('Suivi du dossier', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: BSpace.x3),
                  for (final (index, event) in claim.timeline.reversed.indexed)
                    _TimelineTile(event: event, isLast: index == claim.timeline.length - 1),
                  const SizedBox(height: BSpace.x4),
                  Text('Description', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: BSpace.x1),
                  Text(claim.description, style: const TextStyle(height: 1.45)),
                ]),
              ),
            ),
            if (claim.canAddDocuments)
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(BSpace.x3),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Expanded(
                      child: TextField(
                        controller: _message,
                        minLines: 1,
                        maxLines: 4,
                        maxLength: 1000,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(hintText: 'Répondre au comité…', counterText: ''),
                      ),
                    ),
                    const SizedBox(width: BSpace.x2),
                    IconButton.filled(tooltip: 'Envoyer', onPressed: _sending ? null : () => _send(claim), icon: const Icon(Icons.send_rounded)),
                  ]),
                ),
              ),
          ]);
        },
      ),
    );
  }
}

class _AmountRow extends StatelessWidget {
  const _AmountRow(this.label, this.value, {this.color});
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(children: [
        Expanded(child: Text(label, style: const TextStyle(color: BColors.textMuted))),
        Text(value, style: TextStyle(fontWeight: FontWeight.w800, color: color ?? BColors.text)),
      ]),
    );
  }
}

class _DocumentTile extends StatelessWidget {
  const _DocumentTile({required this.document});
  final ClaimDocument document;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 110,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(BRadius.md),
          child: document.isImage
              ? Image.network(
                  resolveApiUrl(document.url),
                  width: 110,
                  height: 80,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => _placeholder(Icons.image_not_supported_outlined),
                )
              : _placeholder(Icons.picture_as_pdf_rounded),
        ),
        const SizedBox(height: BSpace.x1),
        Text(document.typeLabel, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5)),
      ]),
    );
  }

  Widget _placeholder(IconData icon) =>
      Container(width: 110, height: 80, color: BColors.neutral100, alignment: Alignment.center, child: Icon(icon, color: BColors.textMuted));
}

class _TimelineTile extends StatelessWidget {
  const _TimelineTile({required this.event, required this.isLast});
  final ClaimEvent event;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final color = switch (event.type) {
      'REJECTED' => BColors.danger500,
      'APPROVED' || 'DISBURSED' => BColors.growth500,
      'DOCUMENTS_REQUESTED' => BColors.warning500,
      _ => BColors.primary500,
    };
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          width: 24,
          child: Column(children: [
            Container(width: 12, height: 12, margin: const EdgeInsets.only(top: 4), decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
            if (!isLast) Expanded(child: Container(width: 2, color: BColors.border)),
          ]),
        ),
        const SizedBox(width: BSpace.x2),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: BSpace.x4),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(event.title, style: const TextStyle(fontWeight: FontWeight.w700)),
              if (event.message != null) Text(event.message!, style: const TextStyle(height: 1.35)),
              Text(formatDateTime(event.createdAt), style: const TextStyle(color: BColors.textMuted, fontSize: 12)),
            ]),
          ),
        ),
      ]),
    );
  }
}
