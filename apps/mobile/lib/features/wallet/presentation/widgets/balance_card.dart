import 'package:flutter/material.dart';

import '../../../../core/data/money.dart';
import '../../../../core/format/money_format.dart';
import '../../../../core/theme/tokens.dart';

/// Carte de solde (WalletCard / BalanceCard — cahier §6). Le montant affiché vient du ledger serveur.
class BalanceCard extends StatelessWidget {
  const BalanceCard({
    super.key,
    required this.available,
    required this.reserved,
    required this.paymentsEnabled,
    required this.onRecharge,
    required this.onHistory,
    this.gradient = BColors.growthGradient,
  });

  final Money available;
  final Money reserved;
  final bool paymentsEnabled;
  final VoidCallback onRecharge;
  final VoidCallback onHistory;
  final Gradient gradient;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BSpace.x6),
      decoration: BoxDecoration(gradient: gradient, borderRadius: BorderRadius.circular(BRadius.xl), boxShadow: BShadow.raised),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Row(children: [
          Text('Solde disponible', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w600)),
          Spacer(),
          Icon(Icons.account_balance_wallet_rounded, color: Colors.white70),
        ]),
        const SizedBox(height: BSpace.x2),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text.rich(TextSpan(children: [
            TextSpan(
              text: formatMoney(available.amount, currency: available.currency, withSymbol: false),
              style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800, height: 1.1),
            ),
            TextSpan(
              text: ' ${currencySymbol(available.currency)}',
              style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
            ),
          ])),
        ),
        const SizedBox(height: BSpace.x1),
        Text('Réservé : ${reserved.formatted}', style: const TextStyle(color: Colors.white70, fontSize: 13)),
        const SizedBox(height: BSpace.x4),
        Row(children: [
          Expanded(
            child: _CardAction(
              icon: Icons.add_rounded,
              label: 'Recharger',
              comingSoon: !paymentsEnabled,
              onTap: onRecharge,
            ),
          ),
          const SizedBox(width: BSpace.x3),
          Expanded(child: _CardAction(icon: Icons.receipt_long_rounded, label: 'Historique', onTap: onHistory)),
        ]),
      ]),
    );
  }
}

class _CardAction extends StatelessWidget {
  const _CardAction({required this.icon, required this.label, required this.onTap, this.comingSoon = false});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool comingSoon;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: comingSoon ? 0.12 : 0.2),
      borderRadius: BorderRadius.circular(BRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(BRadius.md),
        onTap: onTap,
        child: SizedBox(
          height: BSize.touchTarget + 4,
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, color: Colors.white.withValues(alpha: comingSoon ? 0.7 : 1), size: 20),
            const SizedBox(width: BSpace.x2),
            Text(label,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: comingSoon ? 0.7 : 1),
                  fontWeight: FontWeight.w700,
                )),
            if (comingSoon) ...[
              const SizedBox(width: BSpace.x1),
              const Text('· bientôt', style: TextStyle(color: Colors.white70, fontSize: 11)),
            ],
          ]),
        ),
      ),
    );
  }
}
