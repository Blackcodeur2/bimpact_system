import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format/money_format.dart';
import '../../core/network/app_failure.dart';
import '../../core/sync/sync_queue.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/feedback.dart';
import '../../core/widgets/states.dart';
import '../../core/widgets/status_badge.dart';
import '../../core/widgets/sync_status.dart';
import 'support_data.dart';

/// Échanges d'une demande avec l'équipe.
class TicketDetailScreen extends ConsumerStatefulWidget {
  const TicketDetailScreen({super.key, required this.ticketId});
  final String ticketId;

  @override
  ConsumerState<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends ConsumerState<TicketDetailScreen> {
  final _reply = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _send(SupportTicket ticket) async {
    final body = _reply.text.trim();
    if (body.length < 2) return;
    setState(() => _sending = true);
    try {
      final outcome = await ref.read(syncQueueProvider.notifier).submit(
            kind: 'support',
            label: 'Message pour la demande ${ticket.reference}',
            method: 'POST',
            path: '/support/tickets/${ticket.id}/messages',
            body: {'body': body},
          );
      _reply.clear();
      if (outcome is SubmitQueued && mounted) {
        showInfoSnackBar(context, 'Pas de réseau : votre message sera envoyé automatiquement.');
      }
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _close(SupportTicket ticket) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Clôturer la demande ?'),
        content: const Text('Vous ne pourrez plus y répondre. Vous pourrez toujours créer une nouvelle demande.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(0, BSize.touchTarget)), onPressed: () => Navigator.pop(ctx, true), child: const Text('Clôturer')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(supportRepositoryProvider).close(ticket.id);
      ref
        ..invalidate(ticketProvider(ticket.id))
        ..invalidate(ticketsProvider);
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ticket = ref.watch(ticketProvider(widget.ticketId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ma demande'),
        actions: [
          if (ticket.valueOrNull?.canReply ?? false)
            TextButton(
              style: TextButton.styleFrom(foregroundColor: Colors.white),
              onPressed: () => _close(ticket.value!),
              child: const Text('Clôturer'),
            ),
        ],
      ),
      body: ticket.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 4)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(ticketProvider(widget.ticketId))),
        data: (t) => Column(children: [
          const SyncStatusBanner(),
          Container(
            width: double.infinity,
            color: BColors.surface,
            padding: const EdgeInsets.all(BSpace.x4),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t.subject, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: BSpace.x1),
              Row(children: [
                Expanded(child: Text('${t.reference} · ${t.categoryLabel}', style: const TextStyle(color: BColors.textMuted, fontSize: 13))),
                StatusBadge(label: supportStatusLabel(t.status), tone: t.status == 'PENDING' ? BadgeTone.warning : BadgeTone.info),
              ]),
            ]),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(BSpace.x4),
              itemCount: t.messages.length,
              itemBuilder: (context, index) => _Bubble(message: t.messages[index]),
            ),
          ),
          if (t.canReply)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(BSpace.x3),
                child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Expanded(
                    child: TextField(
                      controller: _reply,
                      minLines: 1,
                      maxLines: 5,
                      maxLength: 2000,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(hintText: 'Votre réponse…', counterText: ''),
                    ),
                  ),
                  const SizedBox(width: BSpace.x2),
                  IconButton.filled(
                    tooltip: 'Envoyer',
                    onPressed: _sending ? null : () => _send(t),
                    icon: const Icon(Icons.send_rounded),
                  ),
                ]),
              ),
            ),
        ]),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});
  final SupportMessage message;

  @override
  Widget build(BuildContext context) {
    final mine = message.fromMember;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
        margin: const EdgeInsets.only(bottom: BSpace.x3),
        padding: const EdgeInsets.all(BSpace.x3),
        decoration: BoxDecoration(
          color: mine ? BColors.primary500 : BColors.surface,
          borderRadius: BorderRadius.circular(BRadius.lg),
          border: mine ? null : Border.all(color: BColors.border),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            mine ? 'Vous' : 'Équipe BENSKIN IMPACT',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: mine ? Colors.white70 : BColors.primary600),
          ),
          const SizedBox(height: BSpace.x1),
          Text(message.body, style: TextStyle(color: mine ? Colors.white : BColors.text, height: 1.4)),
          const SizedBox(height: BSpace.x1),
          Text(formatDateTime(message.createdAt), style: TextStyle(fontSize: 11, color: mine ? Colors.white70 : BColors.textMuted)),
        ]),
      ),
    );
  }
}
