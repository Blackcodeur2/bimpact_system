import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/money_format.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/states.dart';
import '../application/accidents_providers.dart';
import '../domain/accident_models.dart';

/// Règlement et adhésion VOLONTAIRE au fonds de solidarité : consentement explicite, résiliation libre.
class SolidarityScreen extends ConsumerStatefulWidget {
  const SolidarityScreen({super.key});

  @override
  ConsumerState<SolidarityScreen> createState() => _SolidarityScreenState();
}

class _SolidarityScreenState extends ConsumerState<SolidarityScreen> {
  bool _accepted = false;
  bool _busy = false;

  Future<void> _join(SolidarityStatus status) async {
    setState(() => _busy = true);
    try {
      await ref.read(accidentsRepositoryProvider).join(status.rules.rulesVersion);
      ref.invalidate(solidarityStatusProvider);
      if (mounted) showSuccessSnackBar(context, 'Adhésion enregistrée.');
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
      ref.invalidate(solidarityStatusProvider);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _leave() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Mettre fin à l’adhésion ?'),
        content: const Text(
          'Vous ne participerez plus aux collectes et vos futurs accidents ne pourront plus être aidés par le fonds. '
          'Si vous adhérez de nouveau, le délai de carence recommencera.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: BColors.danger500, minimumSize: const Size(0, BSize.touchTarget)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Mettre fin'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _busy = true);
    try {
      await ref.read(accidentsRepositoryProvider).leave();
      ref.invalidate(solidarityStatusProvider);
      if (mounted) showSuccessSnackBar(context, 'Votre adhésion a pris fin.');
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(solidarityStatusProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Fonds de solidarité')),
      body: status.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 4)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(solidarityStatusProvider)),
        data: (s) {
          final membership = s.membership;
          final needsNewRules = membership != null && membership.isActive && !membership.rulesUpToDate;
          return ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(BSpace.x4),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Règlement (version ${s.rules.rulesVersion})', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: BSpace.x3),
                  for (final line in s.rulesText)
                    Padding(
                      padding: const EdgeInsets.only(bottom: BSpace.x2),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Padding(padding: EdgeInsets.only(top: 6), child: Icon(Icons.circle, size: 6, color: BColors.primary500)),
                        const SizedBox(width: BSpace.x2),
                        Expanded(child: Text(line, style: const TextStyle(height: 1.4))),
                      ]),
                    ),
                ]),
              ),
            ),
            const SizedBox(height: BSpace.x4),
            Card(
              child: Column(children: [
                ListTile(
                  leading: const Icon(Icons.account_balance_outlined, color: BColors.primary500),
                  title: const Text('Solde du fonds'),
                  trailing: Text(s.fundBalance.formatted, style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
                const Divider(indent: 56),
                ListTile(
                  leading: const Icon(Icons.groups_outlined, color: BColors.primary500),
                  title: const Text('Adhérents actifs'),
                  trailing: Text('${s.activeMembers}', style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
                if (membership != null) ...[
                  const Divider(indent: 56),
                  ListTile(
                    leading: Icon(membership.isActive ? Icons.verified_rounded : Icons.history_rounded, color: BColors.growth600),
                    title: Text(membership.isActive ? 'Adhérent depuis le ${formatDate(membership.joinedAt)}' : 'Adhésion terminée'),
                    subtitle: membership.isActive && s.coveredFrom != null
                        ? Text(s.covered ? 'Vous êtes couvert.' : 'Couvert à partir du ${formatDate(s.coveredFrom!)}.')
                        : membership.leftAt != null
                            ? Text('Le ${formatDate(membership.leftAt!)}')
                            : null,
                  ),
                ],
              ]),
            ),
            const SizedBox(height: BSpace.x6),
            if (s.kycRequired) ...[
              const FormErrorBanner('Votre identité doit être vérifiée avant d’adhérer au fonds de solidarité.'),
              const SizedBox(height: BSpace.x3),
              OutlinedButton(onPressed: () => context.push(Routes.kyc), child: const Text('Vérifier mon identité')),
            ] else if (!s.isMember || needsNewRules) ...[
              CheckboxListTile(
                value: _accepted,
                onChanged: (value) => setState(() => _accepted = value ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                title: Text(
                  'J’ai lu le règlement (version ${s.rules.rulesVersion}) et j’accepte, de façon volontaire, de participer au fonds de solidarité.',
                ),
              ),
              const SizedBox(height: BSpace.x3),
              LoadingButton(
                label: needsNewRules ? 'Accepter le nouveau règlement' : 'Adhérer au fonds',
                loading: _busy,
                onPressed: _accepted && s.canJoin ? () => _join(s) : null,
              ),
            ],
            if (s.isMember) ...[
              const SizedBox(height: BSpace.x3),
              OutlinedButton(
                style: OutlinedButton.styleFrom(foregroundColor: BColors.danger500, side: const BorderSide(color: BColors.danger500)),
                onPressed: _busy ? null : _leave,
                child: const Text('Mettre fin à mon adhésion'),
              ),
            ],
          ]);
        },
      ),
    );
  }
}
