import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/format/money_format.dart';
import '../../../core/network/api_url.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/states.dart';
import '../application/training_providers.dart';
import '../domain/training_models.dart';

/// Certificat (cahier §7.16) : informations délivrées par le serveur et preuve vérifiable publiquement (QR code).
class CertificateScreen extends ConsumerWidget {
  const CertificateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final certificates = ref.watch(certificatesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Mon certificat')),
      body: certificates.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 3)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(certificatesProvider)),
        data: (items) {
          if (items.isEmpty) {
            return Center(
              child: SingleChildScrollView(
                child: EmptyState(
                  icon: Icons.workspace_premium_outlined,
                  title: 'Pas encore de certificat',
                  message: 'Le certificat est délivré automatiquement quand vous avez validé le quiz de tous les modules.',
                  action: OutlinedButton(onPressed: () => context.push('/training'), child: const Text('Continuer la formation')),
                ),
              ),
            );
          }
          final certificate = items.firstWhere((c) => !c.revoked, orElse: () => items.first);
          return ListView(padding: const EdgeInsets.all(BSpace.x4), children: [_CertificateCard(certificate: certificate)]);
        },
      ),
    );
  }
}

class _CertificateCard extends StatelessWidget {
  const _CertificateCard({required this.certificate});
  final CertificateItem certificate;

  @override
  Widget build(BuildContext context) {
    final verificationUrl = resolveApiUrl(certificate.verificationPath);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.all(BSpace.x6),
        decoration: BoxDecoration(
          color: BColors.surface,
          borderRadius: BorderRadius.circular(BRadius.xl),
          border: Border.all(color: certificate.revoked ? BColors.danger500 : BColors.accent500, width: 2),
          boxShadow: BShadow.card,
        ),
        child: Column(children: [
          const Icon(Icons.workspace_premium_rounded, size: 48, color: BColors.accent500),
          const SizedBox(height: BSpace.x2),
          const Text('BENSKIN IMPACT', style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: 1.5, color: BColors.navy800)),
          const SizedBox(height: BSpace.x2),
          Text(certificate.title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: BColors.navy800)),
          const Divider(height: BSpace.x8),
          const Text('Délivré à', style: TextStyle(color: BColors.textMuted)),
          Text(certificate.holderName, textAlign: TextAlign.center, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: BSpace.x2),
          Text('le ${formatDate(certificate.issuedAt)}', style: const TextStyle(color: BColors.textMuted)),
          const SizedBox(height: BSpace.x4),
          if (certificate.revoked)
            const Text('Ce certificat a été révoqué.', style: TextStyle(color: BColors.danger500, fontWeight: FontWeight.w800))
          else
            QrImageView(data: verificationUrl, size: 160, backgroundColor: Colors.white),
          const SizedBox(height: BSpace.x2),
          SelectableText('N° ${certificate.certificateNumber}', style: const TextStyle(fontWeight: FontWeight.w700)),
          SelectableText('Code de vérification : ${certificate.verificationCode}', style: const TextStyle(color: BColors.textMuted, fontSize: 12.5)),
        ]),
      ),
      const SizedBox(height: BSpace.x4),
      if (!certificate.revoked)
        FilledButton.icon(
          onPressed: () => SharePlus.instance.share(
            ShareParams(
              subject: certificate.title,
              text: '${certificate.title} — ${certificate.holderName}, délivré le ${formatDate(certificate.issuedAt)}.\n'
                  'N° ${certificate.certificateNumber}. Vérification : $verificationUrl',
            ),
          ),
          icon: const Icon(Icons.share_rounded),
          label: const Text('Partager'),
        ),
      const SizedBox(height: BSpace.x2),
      const Text(
        'Toute personne peut vérifier l’authenticité de ce certificat en scannant le QR code ou avec le code de vérification.',
        textAlign: TextAlign.center,
        style: TextStyle(color: BColors.textMuted, fontSize: 12.5),
      ),
    ]);
  }
}
