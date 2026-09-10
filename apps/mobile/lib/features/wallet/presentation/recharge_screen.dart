import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/money_format.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';

/// Méthode de paiement disponible
enum PaymentProvider {
  mtn('MTN Mobile Money', 'Paiement instantané par prompt USSD (*126#)', Color(0xFFFFCC00), Colors.black87),
  orange('Orange Money', 'Paiement instantané par code secret (*150#)', Color(0xFFFF6600), Colors.white);

  const PaymentProvider(this.label, this.description, this.badgeColor, this.badgeTextColor);
  final String label;
  final String description;
  final Color badgeColor;
  final Color badgeTextColor;
}

/// Écran de rechargement (cahier §7.8 et design-board).
class RechargeScreen extends ConsumerStatefulWidget {
  const RechargeScreen({super.key});

  @override
  ConsumerState<RechargeScreen> createState() => _RechargeScreenState();
}

class _RechargeScreenState extends ConsumerState<RechargeScreen> {
  static const _presetAmounts = [1000, 2000, 5000, 10000];

  int? _selectedPreset = 5000;
  final _amountController = TextEditingController();
  PaymentProvider _selectedProvider = PaymentProvider.mtn;

  @override
  void initState() {
    super.initState();
    _amountController.text = _selectedPreset.toString();
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  int get _currentAmount {
    return int.tryParse(_amountController.text.replaceAll(RegExp(r'\s+'), '')) ?? 0;
  }

  void _onPresetTapped(int amount) {
    setState(() {
      _selectedPreset = amount;
      _amountController.text = amount.toString();
    });
  }

  void _onAmountChanged(String val) {
    final parsed = int.tryParse(val.replaceAll(RegExp(r'\s+'), ''));
    setState(() {
      _selectedPreset = _presetAmounts.contains(parsed) ? parsed : null;
    });
  }

  Future<void> _submit() async {
    final amount = _currentAmount;
    if (amount < 500) {
      showErrorSnackBar(context, 'Le montant minimum de rechargement est de 500 FCFA.');
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmer le rechargement', style: TextStyle(fontWeight: FontWeight.w800)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Vous allez initier un débit de ${formatMoney(amount.toString())} via ${_selectedProvider.label}.'),
            const SizedBox(height: BSpace.x3),
            Container(
              padding: const EdgeInsets.all(BSpace.x3),
              decoration: BoxDecoration(
                color: BColors.neutral50,
                borderRadius: BorderRadius.circular(BRadius.md),
              ),
              child: const Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Frais de transaction', style: TextStyle(color: BColors.textMuted)),
                      Text('0 FCFA (Offerts)', style: TextStyle(color: BColors.growth600, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Confirmer')),
        ],
      ),
    );

    if (confirm != true || !mounted) return;

    // Aucun paiement n'est simulé : le module Paiements (intent → pending → success/failed,
    // confirmé par le serveur) n'existe pas encore. On ne présente jamais un débit comme initié.
    showInfoSnackBar(context, 'Aperçu : le rechargement par Mobile Money n’est pas encore disponible. Aucun débit n’a été initié.');
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final amount = _currentAmount;

    return Scaffold(
      backgroundColor: BColors.background,
      appBar: AppBar(
        title: const Text('Recharger mon compte', style: TextStyle(fontWeight: FontWeight.w800)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BSpace.x4),
          children: [
            Text('Montants rapides', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: BSpace.x3),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: BSpace.x3,
              crossAxisSpacing: BSpace.x3,
              childAspectRatio: 2.2,
              children: _presetAmounts.map((preset) {
                final isSelected = _selectedPreset == preset;
                return InkWell(
                  onTap: () => _onPresetTapped(preset),
                  borderRadius: BorderRadius.circular(BRadius.lg),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    decoration: BoxDecoration(
                      color: isSelected ? BColors.primary500 : Colors.white,
                      borderRadius: BorderRadius.circular(BRadius.lg),
                      border: Border.all(
                        color: isSelected ? BColors.primary500 : BColors.border,
                        width: isSelected ? 2 : 1,
                      ),
                      boxShadow: isSelected ? BShadow.raised : BShadow.card,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      formatMoney(preset.toString()),
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: isSelected ? Colors.white : BColors.text,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: BSpace.x6),
            Text('Autre montant', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: BSpace.x3),
            TextField(
              controller: _amountController,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onChanged: _onAmountChanged,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              decoration: InputDecoration(
                hintText: 'Ex: 15 000',
                suffixText: 'FCFA',
                suffixStyle: const TextStyle(fontWeight: FontWeight.w800, color: BColors.primary600),
                prefixIcon: const Icon(Icons.account_balance_wallet_outlined, color: BColors.primary500),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(BRadius.lg)),
                filled: true,
                fillColor: Colors.white,
              ),
            ),
            const SizedBox(height: BSpace.x6),
            Text('Méthode de paiement', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: BSpace.x3),
            ...PaymentProvider.values.map((provider) {
              final isSelected = _selectedProvider == provider;
              return Padding(
                padding: const EdgeInsets.only(bottom: BSpace.x3),
                child: InkWell(
                  onTap: () => setState(() => _selectedProvider = provider),
                  borderRadius: BorderRadius.circular(BRadius.lg),
                  child: Container(
                    padding: const EdgeInsets.all(BSpace.x4),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(BRadius.lg),
                      border: Border.all(
                        color: isSelected ? BColors.primary500 : BColors.border,
                        width: isSelected ? 2 : 1,
                      ),
                      boxShadow: BShadow.card,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: provider.badgeColor,
                            borderRadius: BorderRadius.circular(BRadius.md),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            provider == PaymentProvider.mtn ? 'MoMo' : 'OM',
                            style: TextStyle(
                              color: provider.badgeTextColor,
                              fontWeight: FontWeight.w900,
                              fontSize: 14,
                            ),
                          ),
                        ),
                        const SizedBox(width: BSpace.x3),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(provider.label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                              const SizedBox(height: 2),
                              Text(provider.description, style: const TextStyle(color: BColors.textMuted, fontSize: 12.5)),
                            ],
                          ),
                        ),
                        Icon(
                          isSelected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                          color: isSelected ? BColors.primary500 : BColors.neutral400,
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
            const SizedBox(height: BSpace.x4),
            // Récapitulatif
            Container(
              padding: const EdgeInsets.all(BSpace.x4),
              decoration: BoxDecoration(
                color: BColors.primary50,
                borderRadius: BorderRadius.circular(BRadius.lg),
                border: Border.all(color: BColors.primary100),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Montant sélectionné', style: TextStyle(color: BColors.textMuted)),
                      Text(formatMoney(amount.toString()), style: const TextStyle(fontWeight: FontWeight.w800)),
                    ],
                  ),
                  const SizedBox(height: BSpace.x2),
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Frais opérateur', style: TextStyle(color: BColors.textMuted)),
                      Text('0 FCFA', style: TextStyle(color: BColors.growth600, fontWeight: FontWeight.w800)),
                    ],
                  ),
                  const Divider(height: BSpace.x4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Total à débiter', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                      Text(
                        formatMoney(amount.toString()),
                        style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: BColors.primary700),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: BSpace.x6),
            FilledButton(
              onPressed: amount < 500 ? null : _submit,
              child: Text('Recharger ${formatMoney(amount.toString())}'),
            ),
          ],
        ),
      ),
    );
  }
}
