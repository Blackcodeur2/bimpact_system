import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/money_format.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/states.dart';
import '../application/kyc_providers.dart';
import '../domain/kyc_labels.dart';
import '../domain/kyc_models.dart';

/// Vérification d'identité — vue d'ensemble du dossier et envoi (cahier §7.5).
class KycScreen extends ConsumerWidget {
  const KycScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dossier = ref.watch(kycDossierProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Vérification d’identité')),
      body: dossier.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 5)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(kycDossierProvider)),
        data: (loaded) => _Overview(dossier: loaded.data, cachedAt: loaded.cachedAt),
      ),
    );
  }
}

class _Overview extends ConsumerStatefulWidget {
  const _Overview({required this.dossier, required this.cachedAt});
  final KycDossier dossier;
  final DateTime? cachedAt;

  @override
  ConsumerState<_Overview> createState() => _OverviewState();
}

class _OverviewState extends ConsumerState<_Overview> {
  bool _submitting = false;

  Future<void> _submit() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Envoyer mon dossier ?'),
        content: const Text(
          'Vérifiez que vos informations sont exactes. Pendant la vérification, votre dossier ne pourra plus être modifié.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Relire')),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, BSize.touchTarget)),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Envoyer'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _submitting = true);
    try {
      await ref.read(kycRepositoryProvider).submit();
      await refreshAfterKycChange(ref);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Dossier envoyé. Vous serez informé de la décision.')),
        );
      }
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      final missing = (failure.details['missing'] as List?)?.map((code) => KycLabels.missing('$code')).join(', ');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(missing == null ? failure.message : '${failure.message} À compléter : $missing.')),
      );
    } on AppFailure catch (failure) {
      if (mounted) showFailureSnackBar(context, failure);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dossier = widget.dossier;
    final requirements = dossier.requirements;
    final identity = dossier.identity;

    Future<void> refresh() async {
      ref.invalidate(kycDossierProvider);
      try {
        await ref.read(kycDossierProvider.future);
      } catch (_) {}
    }

    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
        if (widget.cachedAt != null) ...[CachedDataNotice(cachedAt: widget.cachedAt!), const SizedBox(height: BSpace.x3)],
        _StatusBanner(dossier: dossier),
        const SizedBox(height: BSpace.x4),
        _ProgressCard(completion: requirements.completion),
        const SizedBox(height: BSpace.x4),
        Card(
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            const _StepTile(icon: Icons.phone_iphone_rounded, title: 'Téléphone', subtitle: 'Numéro vérifié par SMS', done: true),
            const Divider(indent: 72),
            _StepTile(
              icon: Icons.badge_outlined,
              title: 'Identité',
              subtitle: requirements.identity
                  ? '${identity.firstName} ${identity.lastName} · ${KycLabels.idDocumentTypes[identity.idDocumentType] ?? ''}'
                  : 'Nom, date de naissance et pièce d’identité',
              done: requirements.identity,
              onTap: () => context.push(Routes.kycIdentity),
            ),
            const Divider(indent: 72),
            _StepTile(
              icon: Icons.home_outlined,
              title: 'Adresse',
              subtitle: requirements.location
                  ? '${dossier.location.district}, ${dossier.location.city}'
                  : 'Ville et quartier où vous vivez',
              done: requirements.location,
              onTap: () => context.push(Routes.kycLocation),
            ),
            const Divider(indent: 72),
            _StepTile(
              icon: Icons.two_wheeler_rounded,
              title: 'Moto',
              subtitle: requirements.vehicle ? 'Immatriculation ${dossier.vehicle.plate}' : 'Immatriculation et statut de la moto',
              done: requirements.vehicle,
              onTap: () => context.push(Routes.kycVehicle),
            ),
            const Divider(indent: 72),
            _StepTile(
              icon: Icons.photo_camera_outlined,
              title: 'Documents',
              subtitle: '${dossier.usableRequiredDocuments} sur ${dossier.requiredDocuments.length} pièces obligatoires',
              done: requirements.documents,
              onTap: () => context.push(Routes.kycDocuments),
            ),
          ]),
        ),
        const SizedBox(height: BSpace.x6),
        if (dossier.editable) ...[
          if (!dossier.canSubmit && requirements.missing.isNotEmpty) ...[
            Text(
              'À compléter : ${requirements.missing.map(KycLabels.missing).join(', ')}.',
              style: const TextStyle(color: BColors.textMuted),
            ),
            const SizedBox(height: BSpace.x3),
          ],
          LoadingButton(
            label: 'Envoyer mon dossier',
            loading: _submitting,
            onPressed: dossier.canSubmit ? _submit : null,
          ),
          const SizedBox(height: BSpace.x4),
        ],
        const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.lock_outline_rounded, size: 16, color: BColors.textMuted),
          SizedBox(width: BSpace.x1),
          Flexible(
            child: Text(
              'Vos documents sont chiffrés et consultés uniquement par l’équipe conformité.',
              textAlign: TextAlign.center,
              style: TextStyle(color: BColors.textMuted, fontSize: 12.5),
            ),
          ),
        ]),
      ]),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.dossier});
  final KycDossier dossier;

  @override
  Widget build(BuildContext context) {
    final reason = dossier.submission.decisionReason;
    final submittedAt = dossier.submission.submittedAt;
    final (background, foreground, icon, title, message) = switch (dossier.status) {
      'APPROVED' => (
          BColors.growth50,
          BColors.growth700,
          Icons.verified_rounded,
          'Identité vérifiée',
          'Votre dossier a été validé. Merci !',
        ),
      'SUBMITTED' || 'UNDER_REVIEW' => (
          BColors.primary50,
          BColors.primary700,
          Icons.hourglass_top_rounded,
          'Vérification en cours',
          submittedAt == null
              ? 'Votre dossier est en cours de vérification.'
              : 'Dossier envoyé le ${formatDateTime(submittedAt)}. Vous serez informé de la décision.',
        ),
      'REJECTED' => (
          BColors.danger50,
          BColors.danger500,
          Icons.error_rounded,
          'Dossier refusé',
          '${reason ?? 'Consultez les documents signalés.'} Corrigez votre dossier puis renvoyez-le.',
        ),
      _ when reason != null => (
          BColors.warning50,
          BColors.warning700,
          Icons.edit_note_rounded,
          'Complément demandé',
          reason,
        ),
      _ => (
          BColors.warning50,
          BColors.warning700,
          Icons.shield_outlined,
          'Vérifiez votre identité',
          'Complétez les étapes ci-dessous puis envoyez votre dossier. Chaque dossier est vérifié par notre équipe.',
        ),
    };

    return Container(
      padding: const EdgeInsets.all(BSpace.x4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(BRadius.lg)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, color: foreground),
        const SizedBox(width: BSpace.x3),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: TextStyle(color: foreground, fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(height: BSpace.x1),
            Text(message, style: const TextStyle(color: BColors.text, fontSize: 13.5)),
          ]),
        ),
      ]),
    );
  }
}

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({required this.completion});
  final int completion;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(BSpace.x4),
        child: Row(children: [
          SizedBox(
            width: 68,
            height: 68,
            child: Stack(fit: StackFit.expand, children: [
              CircularProgressIndicator(
                value: completion / 100,
                strokeWidth: 7,
                backgroundColor: BColors.neutral100,
                color: BColors.growth500,
              ),
              Center(child: Text('$completion %', style: const TextStyle(fontWeight: FontWeight.w800))),
            ]),
          ),
          const SizedBox(width: BSpace.x4),
          const Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Avancement du dossier', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              SizedBox(height: BSpace.x1),
              Text('Complétez chaque étape. Vos informations sont enregistrées au fur et à mesure.',
                  style: TextStyle(color: BColors.textMuted, fontSize: 13)),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _StepTile extends StatelessWidget {
  const _StepTile({required this.icon, required this.title, required this.subtitle, required this.done, this.onTap});
  final IconData icon;
  final String title;
  final String subtitle;
  final bool done;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 64,
      onTap: onTap,
      leading: CircleAvatar(
        backgroundColor: done ? BColors.growth50 : BColors.primary50,
        child: Icon(icon, color: done ? BColors.growth600 : BColors.primary500),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis),
      trailing: Icon(
        done ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
        color: done ? BColors.growth500 : BColors.warning500,
      ),
    );
  }
}
