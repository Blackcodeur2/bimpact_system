import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../../core/format/money_format.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/states.dart';
import '../application/contributions_providers.dart';
import '../domain/contribution_models.dart';

/// Contribution quotidienne (cahier §7.10) : contribution du jour, calendrier, rattrapage, prélèvement automatique.
class ContributionsScreen extends ConsumerWidget {
  const ContributionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(contributionOverviewProvider);
    return Scaffold(
      backgroundColor: BColors.background,
      appBar: AppBar(title: const Text('Contribution', style: TextStyle(fontWeight: FontWeight.w800))),
      body: overview.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 5)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(contributionOverviewProvider)),
        data: (data) => _ContributionBody(overview: data),
      ),
    );
  }
}

class _ContributionBody extends ConsumerStatefulWidget {
  const _ContributionBody({required this.overview});
  final ContributionOverview overview;

  @override
  ConsumerState<_ContributionBody> createState() => _ContributionBodyState();
}

class _ContributionBodyState extends ConsumerState<_ContributionBody> {
  /// Une clé par jour payé, conservée pour qu'un nouvel essai après coupure réseau ne débite pas deux fois.
  final _keys = <String, String>{};
  String? _payingDate;
  bool _savingAutoDebit = false;

  static final _dayFormat = DateFormat('EEE d MMM', 'fr');

  String _label(String isoDate) => _dayFormat.format(DateTime.parse(isoDate));

  Future<void> _pay(String date) async {
    setState(() => _payingDate = date);
    try {
      final key = _keys.putIfAbsent(date, () => const Uuid().v4());
      await ref.read(contributionsRepositoryProvider).pay(
            idempotencyKey: key,
            periodDate: date == widget.overview.todayDate ? null : date,
          );
      _keys.remove(date);
      refreshAfterContribution(ref);
      if (mounted) showSuccessSnackBar(context, 'Contribution du ${_label(date)} enregistrée.');
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      if (failure.code == 'INSUFFICIENT_FUNDS') {
        _keys.remove(date);
        await _insufficientFunds(failure.message);
      } else {
        showFailureSnackBar(context, failure);
      }
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
    } finally {
      if (mounted) setState(() => _payingDate = null);
    }
  }

  Future<void> _insufficientFunds(String message) async {
    final recharge = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Solde insuffisant'),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Plus tard')),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, BSize.touchTarget)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Recharger'),
          ),
        ],
      ),
    );
    if (recharge == true && mounted) context.push(Routes.recharge);
  }

  Future<void> _setAutoDebit(bool enabled) async {
    setState(() => _savingAutoDebit = true);
    try {
      await ref.read(contributionsRepositoryProvider).setAutoDebit(enabled);
      ref.invalidate(contributionOverviewProvider);
      if (mounted) {
        showSuccessSnackBar(
          context,
          enabled
              ? 'Prélèvement automatique activé : chaque jour à ${widget.overview.autoDebitHour} h.'
              : 'Prélèvement automatique désactivé.',
        );
      }
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
    } finally {
      if (mounted) setState(() => _savingAutoDebit = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.overview;
    final text = Theme.of(context).textTheme;

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(contributionOverviewProvider);
        try {
          await ref.read(contributionOverviewProvider.future);
        } catch (_) {}
      },
      child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
        if (!o.eligible) ...[_IneligibleCard(needsKyc: o.needsKyc), const SizedBox(height: BSpace.x4)],
        _MainCard(overview: o),
        const SizedBox(height: BSpace.x4),
        if (o.eligible && !o.todayPaid)
          LoadingButton(
            label: 'Payer ma contribution du jour (${o.dailyAmount.formatted})',
            loading: _payingDate == o.todayDate,
            onPressed: _payingDate == null ? () => _pay(o.todayDate) : null,
          ),
        if (o.eligible && o.catchUpDates.isNotEmpty) ...[
          const SizedBox(height: BSpace.x6),
          Text('Jours à rattraper', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: BSpace.x1),
          const Text('Vous pouvez encore payer les jours manqués des 7 derniers jours.',
              style: TextStyle(color: BColors.textMuted, fontSize: 13)),
          const SizedBox(height: BSpace.x2),
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(children: [
              for (final date in o.catchUpDates)
                ListTile(
                  leading: const Icon(Icons.event_busy_rounded, color: BColors.warning700),
                  title: Text(_label(date), style: const TextStyle(fontWeight: FontWeight.w700)),
                  trailing: TextButton(
                    onPressed: _payingDate == null ? () => _pay(date) : null,
                    child: Text(_payingDate == date ? 'Paiement…' : 'Payer ${o.dailyAmount.formatted}'),
                  ),
                ),
            ]),
          ),
        ],
        const SizedBox(height: BSpace.x6),
        _AttendanceCard(overview: o),
        const SizedBox(height: BSpace.x6),
        Text('30 derniers jours', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: BSpace.x3),
        _CalendarGrid(days: o.calendar),
        const SizedBox(height: BSpace.x6),
        Card(
          child: SwitchListTile(
            value: o.plan?.autoDebit ?? false,
            activeThumbColor: BColors.growth500,
            onChanged: o.plan == null || !o.eligible || _savingAutoDebit ? null : _setAutoDebit,
            title: const Text('Prélèvement automatique', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            subtitle: Text(
              o.plan == null
                  ? 'Disponible après votre première contribution.'
                  : 'Débit de ${o.dailyAmount.formatted} depuis votre portefeuille chaque jour à ${o.autoDebitHour} h.',
              style: const TextStyle(color: BColors.textMuted, fontSize: 12.5),
            ),
          ),
        ),
        const SizedBox(height: BSpace.x6),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('Historique récent', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          TextButton(onPressed: () => context.push(Routes.transactions), child: const Text('Tout voir')),
        ]),
        const SizedBox(height: BSpace.x2),
        if (o.recent.isEmpty)
          const Card(
            child: EmptyState(
              icon: Icons.savings_outlined,
              title: 'Aucune contribution',
              message: 'Vos contributions quotidiennes apparaîtront ici.',
            ),
          )
        else
          for (final item in o.recent)
            Card(
              margin: const EdgeInsets.only(bottom: BSpace.x2),
              child: ListTile(
                leading: const CircleAvatar(
                  backgroundColor: BColors.primary50,
                  child: Icon(Icons.savings_rounded, color: BColors.primary500, size: 22),
                ),
                title: Text('Contribution du ${_label(item.date)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                subtitle: Text(
                  '${item.source == 'AUTO' ? 'Prélèvement automatique' : 'Paiement manuel'} · ${formatDateTime(item.paidAt)}',
                  style: const TextStyle(color: BColors.textMuted, fontSize: 12),
                ),
                trailing: Text('-${item.amount.formatted}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
              ),
            ),
      ]),
    );
  }
}

class _MainCard extends StatelessWidget {
  const _MainCard({required this.overview});
  final ContributionOverview overview;

  @override
  Widget build(BuildContext context) {
    final o = overview;
    final (badgeLabel, badgeColor) = switch ((o.plan?.status, o.todayPaid)) {
      (null, _) => ('Pas encore commencée', BColors.neutral400),
      ('PAUSED', _) => ('En pause', BColors.warning500),
      (_, true) => ('Payée aujourd’hui', BColors.growth500),
      _ => ('À payer aujourd’hui', BColors.accent500),
    };
    return Container(
      padding: const EdgeInsets.all(BSpace.x6),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [BColors.navy800, BColors.primary600],
        ),
        borderRadius: BorderRadius.circular(BRadius.xl),
        boxShadow: BShadow.raised,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Expanded(
            child: Text(
              'Ma contribution',
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(width: BSpace.x2),
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: BSpace.x3, vertical: BSpace.x1),
              decoration: BoxDecoration(color: badgeColor, borderRadius: BorderRadius.circular(BRadius.pill)),
              child: Text(
                badgeLabel,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12),
              ),
            ),
          ),
        ]),
        const SizedBox(height: BSpace.x4),
        Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Text(
            formatMoney(o.dailyAmount.amount, currency: o.dailyAmount.currency, withSymbol: false),
            style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: -0.5),
          ),
          const SizedBox(width: BSpace.x2),
          const Text('FCFA / jour', style: TextStyle(color: Colors.white70, fontSize: 16, fontWeight: FontWeight.w600)),
        ]),
        const SizedBox(height: BSpace.x2),
        const Text('Contribution communautaire programmée', style: TextStyle(color: Colors.white70, fontSize: 13)),
        const Divider(color: Colors.white24, height: BSpace.x6),
        Row(children: [
          Expanded(
            child: _Metric(label: 'Série en cours', value: '${o.streak} jour${o.streak > 1 ? 's' : ''}'),
          ),
          Expanded(
            child: _Metric(label: 'Total versé', value: o.totalPaid.formatted, alignEnd: true),
          ),
        ]),
      ]),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value, this.alignEnd = false});
  final String label;
  final String value;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(color: Colors.white60, fontSize: 12)),
      const SizedBox(height: 2),
      Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
    ]);
  }
}

class _AttendanceCard extends StatelessWidget {
  const _AttendanceCard({required this.overview});
  final ContributionOverview overview;

  @override
  Widget build(BuildContext context) {
    final o = overview;
    final ratio = o.monthExpectedDays == 0 ? 0.0 : (o.monthPaidDays / o.monthExpectedDays).clamp(0.0, 1.0);
    return Container(
      padding: const EdgeInsets.all(BSpace.x4),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(BRadius.lg), boxShadow: BShadow.card),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('Assiduité ce mois', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          Text('${o.monthPaidDays} / ${o.monthExpectedDays} jours',
              style: const TextStyle(color: BColors.growth600, fontWeight: FontWeight.w800)),
        ]),
        const SizedBox(height: BSpace.x2),
        ClipRRect(
          borderRadius: BorderRadius.circular(BRadius.pill),
          child: LinearProgressIndicator(
            value: ratio,
            minHeight: 8,
            backgroundColor: BColors.neutral100,
            valueColor: const AlwaysStoppedAnimation<Color>(BColors.growth500),
          ),
        ),
        const SizedBox(height: BSpace.x3),
        Text(
          o.plan == null
              ? 'Votre assiduité sera suivie dès votre première contribution.'
              : 'Versé ce mois : ${o.monthTotal.formatted}.',
          style: const TextStyle(color: BColors.textMuted, fontSize: 13),
        ),
      ]),
    );
  }
}

class _CalendarGrid extends StatelessWidget {
  const _CalendarGrid({required this.days});
  final List<ContributionDay> days;

  @override
  Widget build(BuildContext context) {
    Color colorOf(String status) => switch (status) {
          'PAID' => BColors.growth500,
          'DUE' => BColors.accent500,
          'MISSED' => BColors.danger500,
          _ => BColors.neutral100,
        };
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Wrap(spacing: 6, runSpacing: 6, children: [
        for (final day in days)
          Tooltip(
            message: '${DateFormat('d MMM', 'fr').format(DateTime.parse(day.date))} : ${_statusLabel(day.status)}',
            child: Container(
              width: 28,
              height: 28,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: colorOf(day.status), borderRadius: BorderRadius.circular(6)),
              child: Text(
                '${DateTime.parse(day.date).day}',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: day.status == 'NOT_STARTED' ? BColors.textMuted : Colors.white,
                ),
              ),
            ),
          ),
      ]),
      const SizedBox(height: BSpace.x3),
      Wrap(spacing: BSpace.x4, runSpacing: BSpace.x2, children: [
        for (final status in const ['PAID', 'DUE', 'MISSED'])
          Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 12, height: 12, decoration: BoxDecoration(color: colorOf(status), borderRadius: BorderRadius.circular(3))),
            const SizedBox(width: BSpace.x1),
            Text(_statusLabel(status), style: const TextStyle(fontSize: 12, color: BColors.textMuted)),
          ]),
      ]),
    ]);
  }

  static String _statusLabel(String status) => switch (status) {
        'PAID' => 'Payé',
        'DUE' => 'À payer',
        'MISSED' => 'Manqué',
        _ => 'Hors plan',
      };
}

class _IneligibleCard extends StatelessWidget {
  const _IneligibleCard({required this.needsKyc});
  final bool needsKyc;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BSpace.x4),
      decoration: BoxDecoration(color: BColors.warning50, borderRadius: BorderRadius.circular(BRadius.lg)),
      child: Row(children: [
        const Icon(Icons.shield_outlined, color: BColors.warning700),
        const SizedBox(width: BSpace.x3),
        Expanded(
          child: Text(
            needsKyc
                ? 'Votre identité doit être vérifiée avant de pouvoir contribuer.'
                : 'Votre portefeuille doit être actif pour contribuer. Contactez le support.',
            style: const TextStyle(color: BColors.warning700, fontWeight: FontWeight.w600),
          ),
        ),
        if (needsKyc) TextButton(onPressed: () => context.push(Routes.kyc), child: const Text('Vérifier')),
      ]),
    );
  }
}
