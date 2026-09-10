import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/app_failure.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../application/kyc_providers.dart';
import '../data/kyc_repository.dart';
import '../domain/kyc_labels.dart';
import '../domain/kyc_models.dart';

/// Envoi des pièces justificatives. Les images sont réduites avant envoi pour limiter la consommation de données.
class KycDocumentsScreen extends ConsumerStatefulWidget {
  const KycDocumentsScreen({super.key});

  @override
  ConsumerState<KycDocumentsScreen> createState() => _KycDocumentsScreenState();
}

class _KycDocumentsScreenState extends ConsumerState<KycDocumentsScreen> {
  final _picker = ImagePicker();
  final _uploading = <String>{};

  Future<void> _pick(String type, ImageSource source) async {
    XFile? file;
    try {
      file = await _picker.pickImage(
        source: source,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 80,
        preferredCameraDevice: type == 'SELFIE' ? CameraDevice.front : CameraDevice.rear,
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Impossible d’ouvrir l’appareil photo ou la galerie. Vérifiez les autorisations.')),
        );
      }
      return;
    }
    if (file == null) return;

    setState(() => _uploading.add(type));
    try {
      final bytes = await file.readAsBytes();
      await ref.read(kycRepositoryProvider).upload(
            type: type,
            bytes: bytes,
            filename: file.name.isEmpty ? '${type.toLowerCase()}.jpg' : file.name,
          );
      await refreshAfterKycChange(ref);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${KycLabels.document(type)} envoyé.')));
      }
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
    } finally {
      if (mounted) setState(() => _uploading.remove(type));
    }
  }

  @override
  Widget build(BuildContext context) {
    final dossier = ref.watch(kycDossierProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Documents')),
      body: dossier.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 3)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(kycDossierProvider)),
        data: (loaded) {
          final d = loaded.data;
          Widget card(String type) => _DocumentCard(
                type: type,
                document: d.documentOf(type),
                editable: d.editable,
                uploading: _uploading.contains(type),
                onPick: (source) => _pick(type, source),
              );
          return ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
            if (!d.editable) ...[
              const FormErrorBanner('Dossier en cours de vérification ou validé : les documents ne peuvent plus être changés.'),
              const SizedBox(height: BSpace.x4),
            ],
            const _SectionTitle('Pièces obligatoires'),
            for (final type in d.requiredDocuments) ...[card(type), const SizedBox(height: BSpace.x3)],
            const SizedBox(height: BSpace.x3),
            const _SectionTitle('Pièces facultatives'),
            for (final type in KycLabels.optionalDocuments) ...[card(type), const SizedBox(height: BSpace.x3)],
          ]);
        },
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BSpace.x3),
      child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
    );
  }
}

class _DocumentCard extends StatelessWidget {
  const _DocumentCard({
    required this.type,
    required this.document,
    required this.editable,
    required this.uploading,
    required this.onPick,
  });

  final String type;
  final KycDocument? document;
  final bool editable;
  final bool uploading;
  final ValueChanged<ImageSource> onPick;

  @override
  Widget build(BuildContext context) {
    final doc = document;
    final badge = switch (doc?.status) {
      null => const StatusBadge(label: 'Manquant', tone: BadgeTone.warning),
      'ACCEPTED' => const StatusBadge(label: 'Accepté', tone: BadgeTone.success, icon: Icons.check_rounded),
      'REJECTED' => const StatusBadge(label: 'Refusé', tone: BadgeTone.danger),
      _ => const StatusBadge(label: 'Envoyé', tone: BadgeTone.info),
    };

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(BSpace.x4),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text(KycLabels.document(type), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
            badge,
          ]),
          const SizedBox(height: BSpace.x1),
          Text(KycLabels.documentHint(type), style: const TextStyle(color: BColors.textMuted, fontSize: 13)),
          if (doc != null && doc.isRejected && doc.rejectionReason != null) ...[
            const SizedBox(height: BSpace.x3),
            FormErrorBanner('Motif : ${doc.rejectionReason}'),
          ],
          if (doc != null) ...[const SizedBox(height: BSpace.x3), _Preview(document: doc)],
          if (uploading) ...[
            const SizedBox(height: BSpace.x3),
            const LinearProgressIndicator(),
            const SizedBox(height: BSpace.x1),
            const Text('Envoi en cours…', style: TextStyle(color: BColors.textMuted, fontSize: 12.5)),
          ] else if (editable) ...[
            const SizedBox(height: BSpace.x3),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => onPick(ImageSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: Text(doc == null ? 'Photo' : 'Reprendre'),
                ),
              ),
              if (type != 'SELFIE') ...[
                const SizedBox(width: BSpace.x3),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => onPick(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library_outlined),
                    label: const Text('Galerie'),
                  ),
                ),
              ],
            ]),
          ],
        ]),
      ),
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({required this.document});
  final KycDocument document;

  @override
  Widget build(BuildContext context) {
    if (!document.isImage) {
      return const Row(children: [
        Icon(Icons.picture_as_pdf_rounded, color: BColors.danger500),
        SizedBox(width: BSpace.x2),
        Text('Document PDF envoyé'),
      ]);
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(BRadius.md),
      child: Image.network(
        resolveApiUrl(document.url),
        height: 150,
        width: double.infinity,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Container(
          height: 72,
          color: BColors.neutral100,
          alignment: Alignment.center,
          child: const Text('Aperçu indisponible — tirez pour actualiser', style: TextStyle(color: BColors.textMuted)),
        ),
      ),
    );
  }
}
