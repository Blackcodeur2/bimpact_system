import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/money_format.dart';
import '../../../core/format/phone_format.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/states.dart';
import '../application/payments_providers.dart';
import '../domain/payment_models.dart';

/// Suivi d'un rechargement (cahier §7.8) : l'écran n'annonce un succès qu'après confirmation du serveur.
class PaymentStatusScreen extends ConsumerWidget {
  const PaymentStatusScreen({super.key, required this.intentId});
  final String intentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final intent = ref.watch(paymentStatusProvider(intentId));
    return Scaffold(
      appBar: AppBar(title: const Text('Rechargement')),
      body: intent.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(paymentStatusProvider(intentId))),
        data: (payment) => _StatusBody(payment: payment),
      ),
    );
  }
}

class _StatusBody extends ConsumerStatefulWidget {
  const _StatusBody({required this.payment});
  final PaymentIntent payment;

  @override
  ConsumerState<_StatusBody> createState() => _StatusBodyState();
}

class _StatusBodyState extends ConsumerState<_StatusBody> {
  bool _cancelling = false;

  Future<void> _cancel() async {
    setState(() => _cancelling = true);
    try {
      await ref.read(paymentStatusProvider(widget.payment.id).notifier).cancel();
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final payment = widget.payment;
    final text = Theme.of(context).textTheme;
    final (color, background, icon, title, message) = switch (payment.status) {
      'SUCCEEDED' => (
          BColors.growth600,
          BColors.growth50,
          Icons.check_circle_rounded,
          'Rechargement confirmé',
          '${payment.amount.formatted} ont été crédités sur votre portefeuille.',
        ),
      'FAILED' => (
          BColors.danger500,
          BColors.danger50,
          Icons.cancel_rounded,
          'Rechargement échoué',
          payment.failure?.message ?? 'L’opérateur a refusé le paiement. Aucun montant n’a été crédité.',
        ),
      'CANCELLED' => (
          BColors.textMuted,
          BColors.neutral100,
          Icons.block_rounded,
          'Rechargement annulé',
          'Cette demande a été annulée. Aucun montant n’a été crédité.',
        ),
      'EXPIRED' => (
          BColors.warning700,
          BColors.warning50,
          Icons.timer_off_rounded,
          'Demande expirée',
          'La demande n’a pas été validée à temps. Aucun montant n’a été crédité.',
        ),
      _ => (
          BColors.primary600,
          BColors.primary50,
          Icons.phone_iphone_rounded,
          'En attente de validation',
          'Validez la demande de ${payment.amount.formatted} sur votre téléphone ${payment.channelLabel}.',
        ),
    };

    return ListView(padding: const EdgeInsets.all(BSpace.x6), children: [
      if (payment.testMode) ...[const TestModeBanner(), const SizedBox(height: BSpace.x4)],
      Center(
        child: Container(
          width: 96,
          height: 96,
          decoration: BoxDecoration(color: background, shape: BoxShape.circle),
          child: payment.isOpen
              ? Padding(
                  padding: const EdgeInsets.all(BSpace.x6),
                  child: CircularProgressIndicator(strokeWidth: 4, color: color),
                )
              : Icon(icon, size: 56, color: color),
        ),
      ),
      const SizedBox(height: BSpace.x4),
      Text(title, textAlign: TextAlign.center, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: color)),
      const SizedBox(height: BSpace.x2),
      Text(message, textAlign: TextAlign.center, style: text.bodyLarge),
      if (payment.isOpen && payment.payerInstructions != null) ...[
        const SizedBox(height: BSpace.x3),
        Text(payment.payerInstructions!, textAlign: TextAlign.center, style: const TextStyle(color: BColors.textMuted)),
      ],
      const SizedBox(height: BSpace.x6),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(BSpace.x4),
          child: Column(children: [
            _Line('Montant', payment.amount.formatted, strong: true),
            _Line('Frais', payment.fee.formatted),
            _Line('Moyen de paiement', payment.channelLabel),
            _Line('Numéro débité', '+237 ${CameroonPhone.pretty(payment.payerPhone)}'),
            _Line('Date', formatDateTime(payment.createdAt)),
            if (payment.externalReference != null) _Line('Référence', payment.externalReference!),
          ]),
        ),
      ),
      const SizedBox(height: BSpace.x6),
      if (payment.isOpen)
        OutlinedButton(
          onPressed: _cancelling ? null : _cancel,
          child: Text(_cancelling ? 'Annulation…' : 'Annuler la demande'),
        )
      else ...[
        FilledButton(onPressed: () => context.go(Routes.wallet), child: const Text('Voir mon portefeuille')),
        if (!payment.isSucceeded) ...[
          const SizedBox(height: BSpace.x3),
          OutlinedButton(onPressed: () => context.pushReplacement(Routes.recharge), child: const Text('Nouveau rechargement')),
        ],
      ],
    ]);
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value, {this.strong = false});
  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BSpace.x2),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 130, child: Text(label, style: const TextStyle(color: BColors.textMuted))),
        Expanded(
          child: SelectableText(
            value,
            textAlign: TextAlign.right,
            style: TextStyle(fontWeight: strong ? FontWeight.w800 : FontWeight.w600),
          ),
        ),
      ]),
    );
  }
}

/// Bandeau obligatoire tant que le fournisseur est le bac à sable : aucun argent réel ne circule.
class TestModeBanner extends StatelessWidget {
  const TestModeBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BSpace.x3),
      decoration: BoxDecoration(color: BColors.warning50, borderRadius: BorderRadius.circular(BRadius.md)),
      child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.science_outlined, color: BColors.warning700, size: 20),
        SizedBox(width: BSpace.x2),
        Expanded(
          child: Text(
            'Mode test : aucun argent réel n’est débité. Un numéro finissant par 0000 simule un refus de l’opérateur.',
            style: TextStyle(color: BColors.warning700, fontWeight: FontWeight.w600, fontSize: 13),
          ),
        ),
      ]),
    );
  }
}
