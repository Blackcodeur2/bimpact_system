import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../application/recruitment_providers.dart';
import '../domain/job_models.dart';

class RecruitmentScreen extends ConsumerWidget {
  const RecruitmentScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final jobsAsync = ref.watch(jobOffersProvider);

    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Bourse d’Opportunités'),
      ),
      body: jobsAsync.when(
        data: (offers) => RefreshIndicator(
          onRefresh: () async => ref.refresh(jobOffersProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(BSpace.x4),
            children: [
              Container(
                padding: const EdgeInsets.all(BSpace.x5),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [BColors.primaryNavy, BColors.brandBlue],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(BRadius.xl),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(BSpace.x2),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(BRadius.md),
                      ),
                      child: const Icon(Icons.work, color: Colors.white, size: 24),
                    ),
                    const SizedBox(width: BSpace.x3),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Opportunités Partenaires Certifiées',
                            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Flottes logistiques, livreurs e-commerce et postes de chefs d’équipe.',
                            style: TextStyle(color: Colors.white70, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: BSpace.x6),
              const Text(
                'Offres disponibles',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: BColors.textPrimary),
              ),
              const SizedBox(height: BSpace.x3),

              if (offers.isEmpty)
                const Center(child: Text('Aucune offre pour le moment.'))
              else
                ...offers.map((o) => _buildOfferCard(context, ref, o)),
            ],
          ),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: AppErrorState(message: 'Impossible de charger les offres.', onRetry: () => ref.refresh(jobOffersProvider))),
      ),
    );
  }

  Widget _buildOfferCard(BuildContext context, WidgetRef ref, JobOfferItem o) {
    return Container(
      margin: const EdgeInsets.only(bottom: BSpace.x4),
      padding: const EdgeInsets.all(BSpace.x4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(BRadius.lg),
        border: Border.all(color: o.hasApplied ? BColors.brandGreen.withValues(alpha: 0.3) : BColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: BColors.brandBlue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  o.sector,
                  style: const TextStyle(color: BColors.brandBlue, fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ),
              const Spacer(),
              if (o.hasApplied)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: BColors.brandGreen.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'Candidature envoyée',
                    style: TextStyle(color: BColors.brandGreen, fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ),
            ],
          ),
          const SizedBox(height: BSpace.x2),
          Text(
            o.title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BColors.textPrimary),
          ),
          Text(
            '${o.company} • ${o.location}',
            style: const TextStyle(fontSize: 13, color: BColors.textSecondary),
          ),
          if (o.salaryHint != null) ...[
            const SizedBox(height: BSpace.x2),
            Row(
              children: [
                const Icon(Icons.payments_outlined, size: 16, color: BColors.brandGreen),
                const SizedBox(width: 4),
                Text(
                  o.salaryHint!,
                  style: const TextStyle(color: BColors.brandGreen, fontWeight: FontWeight.bold, fontSize: 13),
                ),
              ],
            ),
          ],
          const SizedBox(height: BSpace.x3),
          Text(
            o.description,
            style: const TextStyle(fontSize: 13, color: BColors.textPrimary, height: 1.3),
          ),
          if (o.requirements != null) ...[
            const SizedBox(height: BSpace.x2),
            Text(
              'Prérequis : ${o.requirements}',
              style: const TextStyle(fontSize: 12, color: Colors.grey, fontStyle: FontStyle.italic),
            ),
          ],
          const SizedBox(height: BSpace.x4),

          SizedBox(
            width: double.infinity,
            height: 40,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: o.hasApplied ? Colors.grey.shade200 : BColors.primaryNavy,
                foregroundColor: o.hasApplied ? Colors.grey.shade600 : Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
              ),
              onPressed: o.hasApplied
                  ? null
                  : () => _apply(context, ref, o),
              child: Text(
                o.hasApplied ? 'Déjà postulé' : 'Postuler en 1 clic avec mon profil',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _apply(BuildContext context, WidgetRef ref, JobOfferItem o) async {
    try {
      await ref.read(recruitmentRepositoryProvider).apply(o.id, 'Candidature spontanée via Benskin Impact.');
      ref.invalidate(jobOffersProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('🎉 Candidature transmise à l’employeur partenaire !'),
            backgroundColor: BColors.brandGreen,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur: $e')),
        );
      }
    }
  }
}
