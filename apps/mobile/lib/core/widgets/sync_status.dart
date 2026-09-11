import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../format/money_format.dart';
import '../sync/sync_queue.dart';
import '../theme/tokens.dart';

/// Indique clairement ce qui n'est pas encore confirmé par le serveur (cahier §12) :
/// « En attente de synchronisation » ou « Échec de synchronisation », avec reprise ou abandon.
class SyncStatusBanner extends ConsumerWidget {
  const SyncStatusBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sync = ref.watch(syncQueueProvider);
    if (sync.actions.isEmpty) return const SizedBox.shrink();
    final failed = sync.failedCount;
    final pending = sync.pendingCount;
    final (color, icon, label) = failed > 0
        ? (BColors.danger500, Icons.sync_problem_rounded, '$failed action${failed > 1 ? 's' : ''} non envoyée${failed > 1 ? 's' : ''} — toucher pour voir')
        : (
            BColors.warning500,
            sync.syncing ? Icons.sync_rounded : Icons.cloud_upload_outlined,
            '$pending action${pending > 1 ? 's' : ''} en attente de synchronisation',
          );
    return Material(
      color: color,
      child: InkWell(
        onTap: () => showModalBottomSheet<void>(context: context, showDragHandle: true, builder: (_) => const _PendingActionsSheet()),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: BSpace.x4, vertical: BSpace.x2),
          child: Row(children: [
            Icon(icon, color: Colors.white, size: 18),
            const SizedBox(width: BSpace.x2),
            Expanded(child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13))),
            const Icon(Icons.chevron_right_rounded, color: Colors.white),
          ]),
        ),
      ),
    );
  }
}

class _PendingActionsSheet extends ConsumerWidget {
  const _PendingActionsSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sync = ref.watch(syncQueueProvider);
    return SafeArea(
      child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(BSpace.x4, 0, BSpace.x4, BSpace.x4), children: [
        Text('Actions enregistrées sur le téléphone', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: BSpace.x2),
        const Text(
          'Elles sont envoyées automatiquement dès que le réseau revient. Rien n’est pris en compte tant que le serveur ne l’a pas confirmé.',
          style: TextStyle(color: BColors.textMuted, fontSize: 13),
        ),
        const SizedBox(height: BSpace.x3),
        if (sync.actions.isEmpty)
          const Padding(padding: EdgeInsets.all(BSpace.x4), child: Text('Tout est synchronisé.', textAlign: TextAlign.center)),
        for (final action in sync.actions)
          Card(
            margin: const EdgeInsets.only(bottom: BSpace.x2),
            child: ListTile(
              leading: Icon(
                action.status == PendingActionStatus.failed ? Icons.error_outline_rounded : Icons.schedule_rounded,
                color: action.status == PendingActionStatus.failed ? BColors.danger500 : BColors.warning700,
              ),
              title: Text(action.label, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(
                action.status == PendingActionStatus.failed
                    ? 'Échec : ${action.lastError ?? 'refusé par le serveur'}'
                    : 'Enregistrée le ${formatDateTime(action.createdAt)} · nouvel essai automatique',
              ),
              isThreeLine: action.status == PendingActionStatus.failed,
              trailing: PopupMenuButton<String>(
                onSelected: (choice) => choice == 'retry'
                    ? ref.read(syncQueueProvider.notifier).retry(action.id)
                    : ref.read(syncQueueProvider.notifier).discard(action.id),
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'retry', child: Text('Réessayer maintenant')),
                  PopupMenuItem(value: 'discard', child: Text('Abandonner cette action')),
                ],
              ),
            ),
          ),
      ]),
    );
  }
}
