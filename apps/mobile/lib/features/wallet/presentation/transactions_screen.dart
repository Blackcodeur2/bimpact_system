import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/tokens.dart';
import '../../../core/widgets/states.dart';
import '../application/wallet_providers.dart';
import 'widgets/transaction_row.dart';

/// Historique paginé (cahier §7.9) avec filtre entrées / sorties.
class TransactionsScreen extends ConsumerStatefulWidget {
  const TransactionsScreen({super.key});

  @override
  ConsumerState<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends ConsumerState<TransactionsScreen> {
  String _filter = 'ALL';

  String? get _direction => _filter == 'ALL' ? null : _filter;

  @override
  Widget build(BuildContext context) {
    final provider = transactionsProvider(_direction);
    final transactions = ref.watch(provider);

    return Scaffold(
      appBar: AppBar(title: const Text('Historique')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(BSpace.x4),
          child: SizedBox(
            width: double.infinity,
            child: SegmentedButton<String>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: 'ALL', label: Text('Tout')),
                ButtonSegment(value: 'IN', label: Text('Entrées')),
                ButtonSegment(value: 'OUT', label: Text('Sorties')),
              ],
              selected: {_filter},
              onSelectionChanged: (selection) => setState(() => _filter = selection.first),
            ),
          ),
        ),
        Expanded(
          child: transactions.when(
            loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 6)),
            error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(provider)),
            data: (state) {
              Future<void> refresh() async {
                ref.invalidate(provider);
                try {
                  await ref.read(provider.future);
                } catch (_) {}
              }

              if (state.items.isEmpty) {
                return RefreshIndicator(
                  onRefresh: refresh,
                  child: ListView(children: const [
                    SizedBox(height: BSpace.x8),
                    EmptyState(
                      icon: Icons.receipt_long_rounded,
                      title: 'Aucune opération',
                      message: 'Aucune opération ne correspond à ce filtre.',
                    ),
                  ]),
                );
              }

              return RefreshIndicator(
                onRefresh: refresh,
                child: NotificationListener<ScrollNotification>(
                  onNotification: (notification) {
                    if (notification.metrics.extentAfter < 400) ref.read(provider.notifier).loadMore();
                    return false;
                  },
                  child: ListView.separated(
                    itemCount: state.items.length + 2,
                    separatorBuilder: (_, index) => index == 0 || index >= state.items.length
                        ? const SizedBox.shrink()
                        : const Divider(indent: BSpace.x4, endIndent: BSpace.x4),
                    itemBuilder: (context, index) {
                      if (index == 0) {
                        return state.cachedAt == null
                            ? const SizedBox.shrink()
                            : Padding(
                                padding: const EdgeInsets.fromLTRB(BSpace.x4, 0, BSpace.x4, BSpace.x2),
                                child: CachedDataNotice(cachedAt: state.cachedAt!),
                              );
                      }
                      if (index == state.items.length + 1) return _Footer(state: state, onRetry: ref.read(provider.notifier).loadMore);
                      final transaction = state.items[index - 1];
                      return TransactionRow(transaction: transaction, onTap: () => showTransactionDetail(context, transaction));
                    },
                  ),
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer({required this.state, required this.onRetry});
  final TransactionsState state;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (state.loadingMore) {
      return const Padding(
        padding: EdgeInsets.all(BSpace.x4),
        child: Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5))),
      );
    }
    if (state.loadMoreError != null) {
      return Padding(
        padding: const EdgeInsets.all(BSpace.x4),
        child: Column(children: [
          Text(state.loadMoreError!.message, textAlign: TextAlign.center, style: const TextStyle(color: BColors.textMuted)),
          TextButton(onPressed: onRetry, child: const Text('Réessayer')),
        ]),
      );
    }
    if (!state.hasMore) {
      return const Padding(
        padding: EdgeInsets.all(BSpace.x6),
        child: Center(child: Text('Fin de l’historique', style: TextStyle(color: BColors.textMuted, fontSize: 12.5))),
      );
    }
    return const SizedBox(height: BSpace.x12);
  }
}
