import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/states.dart';
import '../../payments/application/payments_providers.dart';
import '../application/wallet_providers.dart';
import 'widgets/balance_card.dart';
import 'widgets/transaction_row.dart';

/// Portefeuille (cahier §7.7) : solde disponible, solde réservé et derniers mouvements.
class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wallet = ref.watch(walletProvider);
    final recent = ref.watch(transactionsProvider(null));

    Future<void> refresh() async {
      ref
        ..invalidate(walletProvider)
        ..invalidate(transactionsProvider(null))
        ..invalidate(pendingPaymentsProvider);
      try {
        await ref.read(walletProvider.future);
      } catch (_) {}
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Mon portefeuille')),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
          wallet.when(
            data: (loaded) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (loaded.isFromCache) ...[CachedDataNotice(cachedAt: loaded.cachedAt!), const SizedBox(height: BSpace.x3)],
              BalanceCard(
                gradient: BColors.brandGradient,
                available: loaded.data.availableBalance,
                reserved: loaded.data.reservedBalance,
                paymentsEnabled: ref.watch(dashboardProvider).valueOrNull?.data.isEnabled('payments') ?? false,
                onRecharge: () => context.push(Routes.recharge),
                onHistory: () => context.go(Routes.transactions),
              ),
              const SizedBox(height: BSpace.x4),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _WalletActionButton(
                    icon: Icons.add_rounded,
                    label: 'Recharger',
                    onTap: () => context.push(Routes.recharge),
                  ),
                  _WalletActionButton(
                    icon: Icons.savings_rounded,
                    label: 'Contribuer',
                    onTap: () => context.push(Routes.contributions),
                  ),
                  _WalletActionButton(
                    icon: Icons.receipt_long_rounded,
                    label: 'Historique',
                    onTap: () => context.go(Routes.transactions),
                  ),
                ],
              ),
              const _PendingPayments(),
              if (loaded.data.status != 'ACTIVE') ...[
                const SizedBox(height: BSpace.x3),
                const FormErrorBanner('Portefeuille gelé : les opérations sont suspendues. Contactez le support.'),
              ],
            ]),
            loading: () => const SkeletonBox(height: 176, radius: BRadius.xl),
            error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(walletProvider)),
          ),
          const SizedBox(height: BSpace.x6),
          Row(children: [
            Text('Dernières opérations',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const Spacer(),
            TextButton(onPressed: () => context.go(Routes.transactions), child: const Text('Voir tout')),
          ]),
          const SizedBox(height: BSpace.x2),
          Card(
            clipBehavior: Clip.antiAlias,
            child: recent.when(
              data: (state) => state.items.isEmpty
                  ? const EmptyState(
                      icon: Icons.receipt_long_rounded,
                      title: 'Aucune opération pour l’instant',
                      message: 'Vos rechargements, contributions et aides apparaîtront ici.',
                    )
                  : Column(children: [
                      for (final (index, transaction) in state.items.take(5).indexed) ...[
                        if (index > 0) const Divider(indent: BSpace.x4, endIndent: BSpace.x4),
                        TransactionRow(
                          transaction: transaction,
                          onTap: () => showTransactionDetail(context, transaction),
                        ),
                      ],
                    ]),
              loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 3)),
              error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(transactionsProvider(null))),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Rechargements initiés mais pas encore confirmés : jamais comptés dans le solde.
class _PendingPayments extends ConsumerWidget {
  const _PendingPayments();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingPaymentsProvider).valueOrNull ?? const [];
    if (pending.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: BSpace.x4),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(BSpace.x4, BSpace.x3, BSpace.x4, 0),
            child: Text('En attente de confirmation', style: TextStyle(fontWeight: FontWeight.w800)),
          ),
          for (final payment in pending)
            ListTile(
              onTap: () => context.push(Routes.payment(payment.id)),
              leading: const CircleAvatar(
                backgroundColor: BColors.primary50,
                child: Icon(Icons.hourglass_top_rounded, color: BColors.primary500),
              ),
              title: Text('Rechargement ${payment.amount.formatted}', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('${payment.channelLabel} · non crédité tant que non confirmé'),
              trailing: const Icon(Icons.chevron_right_rounded),
            ),
        ]),
      ),
    );
  }
}

class _WalletActionButton extends StatelessWidget {
  const _WalletActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(BRadius.lg),
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(BRadius.lg),
              border: Border.all(color: BColors.border),
              boxShadow: BShadow.card,
            ),
            child: Icon(icon, color: BColors.primary500, size: 24),
          ),
          const SizedBox(height: BSpace.x2),
          Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: BColors.text),
          ),
        ],
      ),
    );
  }
}
