import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

import '../../../core/format/money_format.dart';
import '../../../core/format/phone_format.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/fields.dart';
import '../../../core/widgets/states.dart';
import '../../auth/application/session_controller.dart';
import '../../payments/application/payments_providers.dart';
import '../../payments/domain/payment_models.dart';
import '../../payments/presentation/payment_status_screen.dart';

/// Écran de rechargement (cahier §7.8) : montant, moyen de paiement, récapitulatif, confirmation.
/// La demande n'est jamais présentée comme réussie : l'écran de suivi attend la confirmation du serveur.
class RechargeScreen extends ConsumerWidget {
  const RechargeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final methods = ref.watch(paymentMethodsProvider);
    return Scaffold(
      backgroundColor: BColors.background,
      appBar: AppBar(title: const Text('Recharger mon compte', style: TextStyle(fontWeight: FontWeight.w800))),
      body: methods.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 4)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(paymentMethodsProvider)),
        data: (methods) => _RechargeForm(methods: methods),
      ),
    );
  }
}

class _RechargeForm extends ConsumerStatefulWidget {
  const _RechargeForm({required this.methods});
  final PaymentMethods methods;

  @override
  ConsumerState<_RechargeForm> createState() => _RechargeFormState();
}

class _RechargeFormState extends ConsumerState<_RechargeForm> {
  static const _presetAmounts = [1000, 2000, 5000, 10000];

  final _amountController = TextEditingController(text: '5000');
  final _phoneController = TextEditingController();
  late String _channel = widget.methods.channels.first.code;
  bool _submitting = false;
  String? _error;

  /// Clé conservée tant que la demande (montant, moyen, numéro) ne change pas : un nouvel essai ne double pas le débit.
  String? _idempotencyKey;
  String? _keyFingerprint;

  @override
  void initState() {
    super.initState();
    final session = ref.read(sessionControllerProvider);
    if (session is SignedIn) _phoneController.text = CameroonPhone.pretty(session.user.phone);
  }

  @override
  void dispose() {
    _amountController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  int get _amount => int.tryParse(_amountController.text) ?? 0;

  String? get _amountError {
    if (_amountController.text.isEmpty) return null;
    if (_amount < widget.methods.minAmountValue) return 'Minimum ${widget.methods.minAmount.formatted}.';
    if (_amount > widget.methods.maxAmountValue) return 'Maximum ${widget.methods.maxAmount.formatted}.';
    return null;
  }

  bool get _canSubmit =>
      !_submitting && _amountError == null && _amount > 0 && CameroonPhone.isValid(_phoneController.text);

  String get _channelLabel => widget.methods.channels.firstWhere((c) => c.code == _channel).label;

  Future<void> _submit() async {
    final phone = CameroonPhone.toE164(_phoneController.text);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmer le rechargement', style: TextStyle(fontWeight: FontWeight.w800)),
        content: Text(
          'Une demande de ${formatMoney('$_amount')} va être envoyée à $_channelLabel '
          'pour le +237 ${CameroonPhone.pretty(phone)}. Frais : ${widget.methods.fee.formatted}.\n\n'
          'Vous devrez la valider sur votre téléphone.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, BSize.touchTarget)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirmer'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final fingerprint = '$_amount|$_channel|$phone';
    if (_keyFingerprint != fingerprint) {
      _idempotencyKey = const Uuid().v4();
      _keyFingerprint = fingerprint;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final intent = await ref.read(paymentsRepositoryProvider).createIntent(
            amount: '$_amount',
            channel: _channel,
            payerPhone: phone,
            idempotencyKey: _idempotencyKey!,
          );
      if (mounted) context.pushReplacement('/wallet/payments/${intent.id}');
    } on NetworkFailure {
      setState(() => _error = 'Connexion interrompue. Réessayez : la même demande sera reprise, sans double débit.');
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final methods = widget.methods;

    return SafeArea(
      child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
        if (methods.testMode) ...[const TestModeBanner(), const SizedBox(height: BSpace.x4)],
        Text('Montants rapides', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: BSpace.x3),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: BSpace.x3,
          crossAxisSpacing: BSpace.x3,
          childAspectRatio: 2.2,
          children: [
            for (final preset in _presetAmounts)
              _PresetTile(
                label: formatMoney('$preset'),
                selected: _amount == preset,
                onTap: () => setState(() => _amountController.text = '$preset'),
              ),
          ],
        ),
        const SizedBox(height: BSpace.x6),
        Text('Autre montant', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: BSpace.x3),
        TextField(
          controller: _amountController,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9)],
          onChanged: (_) => setState(() {}),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          decoration: InputDecoration(
            hintText: 'Ex : 15000',
            suffixText: 'FCFA',
            errorText: _amountError,
            prefixIcon: const Icon(Icons.account_balance_wallet_outlined, color: BColors.primary500),
          ),
        ),
        const SizedBox(height: BSpace.x6),
        Text('Moyen de paiement', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: BSpace.x3),
        for (final channel in methods.channels)
          Padding(
            padding: const EdgeInsets.only(bottom: BSpace.x3),
            child: _ChannelTile(
              channel: channel,
              selected: channel.code == _channel,
              onTap: () => setState(() => _channel = channel.code),
            ),
          ),
        const SizedBox(height: BSpace.x3),
        const FieldLabel('Numéro Mobile Money à débiter'),
        PhoneField(controller: _phoneController, textInputAction: TextInputAction.done),
        const SizedBox(height: BSpace.x6),
        Container(
          padding: const EdgeInsets.all(BSpace.x4),
          decoration: BoxDecoration(
            color: BColors.primary50,
            borderRadius: BorderRadius.circular(BRadius.lg),
            border: Border.all(color: BColors.primary100),
          ),
          child: Column(children: [
            _SummaryRow('Montant', formatMoney('$_amount')),
            const SizedBox(height: BSpace.x2),
            _SummaryRow('Frais', methods.fee.formatted),
            const Divider(height: BSpace.x4),
            _SummaryRow('Total à valider', formatMoney('$_amount'), strong: true),
          ]),
        ),
        const SizedBox(height: BSpace.x6),
        if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x4)],
        ListenableBuilder(
          listenable: _phoneController,
          builder: (_, _) => LoadingButton(
            label: 'Recharger ${formatMoney('$_amount')}',
            loading: _submitting,
            onPressed: _canSubmit ? _submit : null,
          ),
        ),
      ]),
    );
  }
}

class _PresetTile extends StatelessWidget {
  const _PresetTile({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(BRadius.lg),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? BColors.primary500 : Colors.white,
          borderRadius: BorderRadius.circular(BRadius.lg),
          border: Border.all(color: selected ? BColors.primary500 : BColors.border, width: selected ? 2 : 1),
          boxShadow: selected ? BShadow.raised : BShadow.card,
        ),
        child: Text(
          label,
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: selected ? Colors.white : BColors.text),
        ),
      ),
    );
  }
}

class _ChannelTile extends StatelessWidget {
  const _ChannelTile({required this.channel, required this.selected, required this.onTap});
  final PaymentChannelInfo channel;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isMtn = channel.code == 'MTN_MOMO';
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(BRadius.lg),
      child: Container(
        padding: const EdgeInsets.all(BSpace.x4),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(BRadius.lg),
          border: Border.all(color: selected ? BColors.primary500 : BColors.border, width: selected ? 2 : 1),
          boxShadow: BShadow.card,
        ),
        child: Row(children: [
          Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: isMtn ? const Color(0xFFFFCC00) : const Color(0xFFFF6600),
              borderRadius: BorderRadius.circular(BRadius.md),
            ),
            child: Text(
              isMtn ? 'MoMo' : 'OM',
              style: TextStyle(color: isMtn ? Colors.black87 : Colors.white, fontWeight: FontWeight.w900, fontSize: 14),
            ),
          ),
          const SizedBox(width: BSpace.x3),
          Expanded(child: Text(channel.label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
          Icon(
            selected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
            color: selected ? BColors.primary500 : BColors.neutral400,
          ),
        ]),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow(this.label, this.value, {this.strong = false});
  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Text(label, style: TextStyle(color: strong ? BColors.text : BColors.textMuted, fontWeight: strong ? FontWeight.w800 : null)),
      Text(
        value,
        style: TextStyle(
          fontWeight: strong ? FontWeight.w900 : FontWeight.w700,
          fontSize: strong ? 18 : 14,
          color: strong ? BColors.primary700 : BColors.text,
        ),
      ),
    ]);
  }
}
