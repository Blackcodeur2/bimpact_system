import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatters.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../application/accidents_providers.dart';
import '../domain/accident_models.dart';

class AccidentsScreen extends ConsumerWidget {
  const AccidentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coverageAsync = ref.watch(coverageStatusProvider);
    final claimsAsync = ref.watch(accidentClaimsProvider);

    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Solidarité & Accidents'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(coverageStatusProvider);
          ref.invalidate(accidentClaimsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(BSpace.x4),
          children: [
            // SOS Emergency Hero Card
            coverageAsync.when(
              data: (cov) => _buildCoverageHero(context, cov),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => const SizedBox.shrink(),
            ),

            const SizedBox(height: BSpace.x6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Mes dossiers d’assistance',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: BColors.textPrimary),
                ),
                TextButton.icon(
                  onPressed: () => context.push('/accidents/report'),
                  icon: const Icon(Icons.add_alert, size: 18, color: Colors.red),
                  label: const Text('Déclarer un sinistre', style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
            const SizedBox(height: BSpace.x3),

            claimsAsync.when(
              data: (claims) {
                if (claims.isEmpty) {
                  return Container(
                    padding: const EdgeInsets.all(BSpace.x6),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(BRadius.lg),
                      border: Border.all(color: BColors.border),
                    ),
                    child: const Column(
                      children: [
                        Icon(Icons.shield_outlined, size: 48, color: BColors.brandGreen),
                        SizedBox(height: BSpace.x3),
                        Text('Aucun sinistre déclaré', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        SizedBox(height: 4),
                        Text(
                          'En cas de chute ou d’accident sur la route, déclarez-le ici pour activer la prise en charge immédiate.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: BColors.textSecondary, fontSize: 13),
                        ),
                      ],
                    ),
                  );
                }

                return Column(
                  children: claims.map((c) => _buildClaimCard(context, c)).toList(),
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => AppErrorState(
                message: 'Impossible de charger vos déclarations.',
                onRetry: () => ref.refresh(accidentClaimsProvider),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCoverageHero(BuildContext context, CoverageStatus cov) {
    return Container(
      padding: const EdgeInsets.all(BSpace.x5),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: cov.isCovered ? [const Color(0xFF0F5132), const Color(0xFF198754)] : [const Color(0xFF842029), const Color(0xFFDC3545)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(BRadius.xl),
        boxShadow: [
          BoxShadow(
            color: (cov.isCovered ? Colors.green : Colors.red).withValues(alpha: 0.3),
            blurRadius: 12,
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
                padding: const EdgeInsets.all(BSpace.x2),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(BRadius.md),
                ),
                child: Icon(cov.isCovered ? Icons.verified_user : Icons.warning_amber, color: Colors.white, size: 24),
              ),
              const SizedBox(width: BSpace.x3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      cov.isCovered ? 'COUVERTURE SOLIDARITÉ ACTIVE' : 'COUVERTURE NON ACTIVE',
                      style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                    ),
                    Text(
                      cov.isCovered ? 'Vos 200 FCFA/jour vous protègent en cas d’accident' : 'Cotisez régulièrement pour activer la protection',
                      style: const TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: BSpace.x4),
          Container(
            padding: const EdgeInsets.all(BSpace.x3),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(BRadius.md),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Plafond d’urgence garanti', style: TextStyle(color: Colors.white70, fontSize: 11)),
                    Text(formatXaf(cov.maxCoverageAmount), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text('Régularité (30 jours)', style: TextStyle(color: Colors.white70, fontSize: 11)),
                    Text('${cov.paidDaysLast30Days} jours cotisés', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: BSpace.x4),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: const Color(0xFF0F5132),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  onPressed: () => context.push('/accidents/report'),
                  icon: const Icon(Icons.add_circle, color: Colors.red),
                  label: const Text('Déclarer un accident', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.red)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildClaimCard(BuildContext context, AccidentClaimItem claim) {
    final statusColor = switch (claim.status) {
      'APPROVED' || 'DISBURSED' => BColors.brandGreen,
      'REJECTED' => Colors.red,
      _ => BColors.brandOrange,
    };

    return Container(
      margin: const EdgeInsets.only(bottom: BSpace.x4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(BRadius.lg),
        border: Border.all(color: BColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(BRadius.lg),
        child: InkWell(
          borderRadius: BorderRadius.circular(BRadius.lg),
          onTap: () => context.push('/accidents/${claim.id}'),
          child: Padding(
            padding: const EdgeInsets.all(BSpace.x4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        claim.statusLabel,
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: statusColor),
                      ),
                    ),
                    const Spacer(),
                    Text(claim.reference, style: const TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: BSpace.x2),
                Text(
                  claim.location,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: BColors.textPrimary),
                ),
                const SizedBox(height: 4),
                Text(
                  claim.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, color: BColors.textSecondary, height: 1.3),
                ),
                const SizedBox(height: BSpace.x3),
                Row(
                  children: [
                    Text(
                      'Montant : ${formatXaf(claim.requestedAmount)}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: BColors.primaryNavy),
                    ),
                    const Spacer(),
                    const Text('Détails →', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: BColors.brandBlue)),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
