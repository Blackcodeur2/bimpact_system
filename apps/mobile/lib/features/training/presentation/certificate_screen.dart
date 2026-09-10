import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../application/training_providers.dart';

class CertificateScreen extends ConsumerWidget {
  const CertificateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final certsAsync = ref.watch(certificatesProvider);

    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Attestation & Certification'),
      ),
      body: certsAsync.when(
        data: (certs) {
          if (certs.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(BSpace.x6),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.school_outlined, size: 64, color: Colors.grey),
                    const SizedBox(height: BSpace.x4),
                    const Text(
                      'Aucun certificat délivré pour le moment',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: BSpace.x2),
                    const Text(
                      'Complétez les 6 modules de formation et validez les quiz pour obtenir votre Certificat d’Entrepreneur officiel.',
                      style: TextStyle(fontSize: 13, color: BColors.textSecondary, height: 1.4),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            );
          }

          final cert = certs.first;

          return ListView(
            padding: const EdgeInsets.all(BSpace.x4),
            children: [
              Container(
                padding: const EdgeInsets.all(BSpace.x6),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(BRadius.xl),
                  border: Border.all(color: BColors.brandOrange, width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: BColors.brandOrange.withValues(alpha: 0.15),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: BColors.brandOrange.withValues(alpha: 0.1),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.verified, color: BColors.brandOrange, size: 36),
                        ),
                      ],
                    ),
                    const SizedBox(height: BSpace.x4),
                    const Text(
                      'BENSKIN IMPACT ACADEMY',
                      style: TextStyle(
                        color: BColors.primaryNavy,
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.5,
                      ),
                    ),
                    const SizedBox(height: BSpace.x2),
                    const Text(
                      'CERTIFICAT DE FORMATION ENTREPRENEURIALE',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                        color: BColors.primaryNavy,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const Divider(height: 32),
                    const Text(
                      'Décerné à :',
                      style: TextStyle(fontSize: 13, color: BColors.textSecondary),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'KOUAM TEST',
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: BColors.primaryNavy),
                    ),
                    const Text('Conducteur de moto-taxi — Yaoundé, Cameroun', style: TextStyle(fontSize: 12, color: BColors.textSecondary)),
                    const SizedBox(height: BSpace.x4),
                    const Text(
                      'Pour avoir validé avec succès l’intégralité des 6 modules du programme : Esprit d’entreprise, Étude de marché, Modèle économique, Trésorerie, Marketing et Management.',
                      style: TextStyle(fontSize: 13, height: 1.4, color: BColors.textPrimary),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: BSpace.x5),
                    Container(
                      padding: const EdgeInsets.all(BSpace.x3),
                      decoration: BoxDecoration(
                        color: BColors.surface,
                        borderRadius: BorderRadius.circular(BRadius.md),
                        border: Border.all(color: BColors.border),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.qr_code_2, size: 40, color: BColors.primaryNavy),
                          const SizedBox(width: BSpace.x3),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('N° : ${cert.certificateNumber}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                                Text('Empreinte : ${cert.verificationHash.substring(0, 16)}...', style: const TextStyle(fontSize: 10, color: Colors.grey)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: BSpace.x6),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: BColors.primaryNavy,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                  ),
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Attestation officielle prête à être partagée ou imprimée.')),
                    );
                  },
                  icon: const Icon(Icons.share),
                  label: const Text('Partager mon certificat', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: AppErrorState(message: 'Impossible de charger l’attestation.', onRetry: () => ref.refresh(certificatesProvider))),
      ),
    );
  }
}
