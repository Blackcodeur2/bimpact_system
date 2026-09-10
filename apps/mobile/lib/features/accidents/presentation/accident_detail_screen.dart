import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/formatters.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../application/accidents_providers.dart';

class AccidentDetailScreen extends ConsumerWidget {
  const AccidentDetailScreen({super.key, required this.claimId});
  final String claimId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final claimAsync = ref.watch(accidentClaimDetailProvider(claimId));

    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Dossier d\'assistance'),
      ),
      body: claimAsync.when(
        data: (claim) {
          final statusColor = switch (claim.status) {
            'APPROVED' || 'DISBURSED' => BColors.brandGreen,
            'REJECTED' => Colors.red,
            'INVESTIGATING' => BColors.brandOrange,
            _ => BColors.brandOrange,
          };

          return ListView(
            padding: const EdgeInsets.all(BSpace.x4),
            children: [
              // ── Status card ──
              Container(
                padding: const EdgeInsets.all(BSpace.x5),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(BRadius.xl),
                  border: Border.all(color: BColors.border),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.03),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: statusColor.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(BRadius.sm),
                          ),
                          child: Text(
                            claim.statusLabel,
                            style: TextStyle(color: statusColor, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const Spacer(),
                        Text(
                          claim.reference,
                          style: const TextStyle(color: Colors.grey, fontWeight: FontWeight.bold, fontSize: 12),
                        ),
                      ],
                    ),
                    const SizedBox(height: BSpace.x3),
                    Text(
                      claim.location,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BColors.textPrimary),
                    ),
                    if (claim.hospitalName != null) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.local_hospital, size: 14, color: Colors.red),
                          const SizedBox(width: 4),
                          Text(claim.hospitalName!, style: const TextStyle(fontSize: 13, color: Colors.grey)),
                        ],
                      ),
                    ],
                    const Divider(height: 32),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _buildStat('Gravité', claim.severityLabel),
                        _buildStat('Montant demandé', formatXaf(claim.requestedAmount)),
                        if (claim.approvedAmount != null)
                          _buildStat('Prise en charge', formatXaf(claim.approvedAmount!), color: BColors.brandGreen),
                      ],
                    ),
                  ],
                ),
              ),

              // ── Solidarity community banner (DISBURSED only) ──
              if (claim.status == 'DISBURSED') ...[
                const SizedBox(height: BSpace.x4),
                Container(
                  padding: const EdgeInsets.all(BSpace.x4),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF0F5132), Color(0xFF198754)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(BRadius.lg),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.volunteer_activism, color: Colors.white, size: 20),
                          SizedBox(width: BSpace.x2),
                          Text(
                            'Solidarité communautaire activée',
                            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                          ),
                        ],
                      ),
                      const SizedBox(height: BSpace.x2),
                      const Text(
                        'L\'ensemble de la communauté BENSKIN IMPACT a participé à votre prise en charge. '
                        'Un montant a été prélevé sur chaque portefeuille actif pour financer votre assistance.',
                        style: TextStyle(color: Colors.white70, fontSize: 12, height: 1.5),
                      ),
                      const SizedBox(height: BSpace.x3),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: BSpace.x3, vertical: BSpace.x2),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(BRadius.sm),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.account_balance_wallet, color: Colors.white, size: 16),
                            const SizedBox(width: 6),
                            Text(
                              'Fonds versés : ${formatXaf(claim.approvedAmount ?? claim.requestedAmount)}',
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              // ── Review notes ──
              if (claim.reviewNotes != null) ...[
                const SizedBox(height: BSpace.x4),
                Container(
                  padding: const EdgeInsets.all(BSpace.x4),
                  decoration: BoxDecoration(
                    color: claim.status == 'REJECTED'
                        ? Colors.red.withValues(alpha: 0.07)
                        : BColors.brandGreen.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(BRadius.lg),
                    border: Border.all(
                      color: claim.status == 'REJECTED'
                          ? Colors.red.withValues(alpha: 0.3)
                          : BColors.brandGreen.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        claim.status == 'REJECTED' ? Icons.cancel_outlined : Icons.check_circle_outline,
                        color: claim.status == 'REJECTED' ? Colors.red : BColors.brandGreen,
                      ),
                      const SizedBox(width: BSpace.x3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Décision de la commission de solidarité',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                            const SizedBox(height: 4),
                            Text(claim.reviewNotes!, style: const TextStyle(fontSize: 13, height: 1.4)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              // ── Circumstances ──
              const SizedBox(height: BSpace.x6),
              const Text('Détails des circonstances', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: BSpace.x2),
              Container(
                padding: const EdgeInsets.all(BSpace.x4),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(BRadius.lg),
                  border: Border.all(color: BColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(claim.description, style: const TextStyle(fontSize: 14, height: 1.5)),
                    if (claim.thirdPartyInvolved) ...[
                      const SizedBox(height: BSpace.x3),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.orange.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.directions_car, size: 14, color: Colors.orange),
                            SizedBox(width: 4),
                            Text(
                              'Tiers impliqué',
                              style: TextStyle(fontSize: 12, color: Colors.orange, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              const SizedBox(height: BSpace.x6),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: AppErrorState(
            message: 'Impossible d\'ouvrir le dossier.',
            onRetry: () => ref.refresh(accidentClaimDetailProvider(claimId)),
          ),
        ),
      ),
    );
  }

  Widget _buildStat(String label, String value, {Color? color}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey)),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: color ?? BColors.textPrimary),
        ),
      ],
    );
  }
}
