import 'package:flutter/material.dart';

import '../../../../core/format/money_format.dart';
import '../../../../core/theme/tokens.dart';
import '../../../../core/widgets/status_badge.dart';
import '../../domain/wallet_models.dart';

class TransactionRow extends StatelessWidget {
  const TransactionRow({super.key, required this.transaction, this.onTap});
  final WalletTransaction transaction;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final incoming = transaction.isIncoming;
    final color = incoming ? BColors.growth600 : BColors.text;
    final icon = transaction.isReversal
        ? Icons.undo_rounded
        : (incoming ? Icons.south_west_rounded : Icons.north_east_rounded);
    final sign = incoming ? '+' : '-';

    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 64),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: BSpace.x4, vertical: BSpace.x3),
          child: Row(children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: incoming ? BColors.growth50 : BColors.neutral100, shape: BoxShape.circle),
              child: Icon(icon, size: 20, color: incoming ? BColors.growth600 : BColors.textMuted),
            ),
            const SizedBox(width: BSpace.x3),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(transaction.label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 2),
                Text(formatDateTime(transaction.createdAt), style: const TextStyle(color: BColors.textMuted, fontSize: 12.5)),
              ]),
            ),
            Text('$sign${transaction.amount.formatted}',
                style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 15)),
          ]),
        ),
      ),
    );
  }
}

/// Détail d'une opération avec sa référence, pour pouvoir la citer au support.
Future<void> showTransactionDetail(BuildContext context, WalletTransaction transaction) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    backgroundColor: BColors.surface,
    builder: (context) {
      final text = Theme.of(context).textTheme;
      Widget line(String label, String value) => Padding(
            padding: const EdgeInsets.symmetric(vertical: BSpace.x2),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(width: 120, child: Text(label, style: text.bodyMedium?.copyWith(color: BColors.textMuted))),
              Expanded(child: SelectableText(value, style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600))),
            ]),
          );
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(BSpace.x6, 0, BSpace.x6, BSpace.x6),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(transaction.label, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: BSpace.x1),
            Text('${transaction.isIncoming ? '+' : '-'}${transaction.amount.formatted}',
                style: text.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: transaction.isIncoming ? BColors.growth600 : BColors.text,
                )),
            const SizedBox(height: BSpace.x3),
            const StatusBadge(label: 'Confirmée', tone: BadgeTone.success, icon: Icons.check_circle_rounded),
            const SizedBox(height: BSpace.x4),
            line('Date', formatDateTime(transaction.createdAt)),
            line('Solde après', transaction.balanceAfter.formatted),
            line('Compte', transaction.bucket == 'RESERVED' ? 'Solde réservé' : 'Solde disponible'),
            if (transaction.description != null) line('Libellé', transaction.description!),
            line('Référence', transaction.reference),
          ]),
        ),
      );
    },
  );
}
