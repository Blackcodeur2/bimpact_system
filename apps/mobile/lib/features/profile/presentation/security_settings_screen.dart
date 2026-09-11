import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/money_format.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/security/app_lock.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/fields.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../data/security_repository.dart';

/// Profil & sécurité (cahier §7.24) : code PIN, déverrouillage biométrique, appareils connectés.
class SecuritySettingsScreen extends ConsumerWidget {
  const SecuritySettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sécurité')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(devicesProvider);
          try {
            await ref.read(devicesProvider.future);
          } catch (_) {}
        },
        child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: const [
          _ChangePinCard(),
          SizedBox(height: BSpace.x4),
          _BiometricCard(),
          SizedBox(height: BSpace.x6),
          _DevicesSection(),
        ]),
      ),
    );
  }
}

class _ChangePinCard extends ConsumerStatefulWidget {
  const _ChangePinCard();

  @override
  ConsumerState<_ChangePinCard> createState() => _ChangePinCardState();
}

class _ChangePinCardState extends ConsumerState<_ChangePinCard> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _saving = false;
  String? _currentError;
  String? _nextError;
  String? _formError;

  @override
  void dispose() {
    for (final controller in [_current, _next, _confirm]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _currentError = _nextError = _formError = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final revoked = await ref.read(securityRepositoryProvider).changePin(currentPin: _current.text, newPin: _next.text);
      for (final controller in [_current, _next, _confirm]) {
        controller.clear();
      }
      ref.invalidate(devicesProvider);
      if (mounted) {
        showSuccessSnackBar(
          context,
          revoked > 0 ? 'Code PIN modifié. $revoked autre${revoked > 1 ? 's sessions fermées' : ' session fermée'}.' : 'Code PIN modifié.',
        );
      }
    } on ApiFailure catch (failure) {
      setState(() {
        switch (failure.code) {
          case 'CURRENT_PIN_INVALID':
            final remaining = failure.details['remainingAttempts'];
            _currentError =
                remaining is int ? 'Code PIN incorrect. $remaining ${plural(remaining, 'tentative')} ${plural(remaining, 'restante')}.' : failure.message;
          case 'PIN_TOO_WEAK':
          case 'PIN_UNCHANGED':
            _nextError = failure.message;
          case 'ACCOUNT_LOCKED':
            final until = DateTime.tryParse('${failure.details['lockedUntil']}');
            _formError = until == null ? failure.message : 'Trop de tentatives. Réessayez après le ${formatDateTime(until)}.';
          default:
            _formError = failure.message;
        }
      });
    } on AppFailure catch (failure) {
      setState(() => _formError = failure.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(BSpace.x4),
        child: Form(
          key: _form,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Row(children: [
              Icon(Icons.pin_outlined, color: BColors.primary500),
              SizedBox(width: BSpace.x2),
              Text('Modifier mon code PIN', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            ]),
            const SizedBox(height: BSpace.x2),
            const Text('Vos autres appareils seront déconnectés après le changement.', style: TextStyle(color: BColors.textMuted, fontSize: 13)),
            const SizedBox(height: BSpace.x4),
            const FieldLabel('Code PIN actuel'),
            PinField(controller: _current, errorText: _currentError),
            const SizedBox(height: BSpace.x3),
            const FieldLabel('Nouveau code PIN'),
            PinField(controller: _next, errorText: _nextError),
            const SizedBox(height: BSpace.x3),
            const FieldLabel('Confirmez le nouveau code PIN'),
            PinField(
              controller: _confirm,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
              validator: (value) => value != _next.text ? 'Les deux codes PIN ne correspondent pas.' : null,
            ),
            const SizedBox(height: BSpace.x4),
            if (_formError != null) ...[FormErrorBanner(_formError!), const SizedBox(height: BSpace.x3)],
            LoadingButton(label: 'Mettre à jour mon code PIN', loading: _saving, onPressed: _submit),
          ]),
        ),
      ),
    );
  }
}

class _BiometricCard extends ConsumerWidget {
  const _BiometricCard();

  Future<void> _toggle(BuildContext context, WidgetRef ref, bool enable) async {
    if (!enable) {
      await ref.read(biometricPreferenceProvider.notifier).set(false);
      return;
    }
    final authenticator = ref.read(biometricAuthenticatorProvider);
    if (!await authenticator.isAvailable()) {
      if (context.mounted) showErrorSnackBar(context, 'Aucune empreinte ou reconnaissance faciale n’est configurée sur ce téléphone.');
      return;
    }
    final confirmed = await authenticator.authenticate('Confirmez pour activer le déverrouillage biométrique');
    if (confirmed) {
      await ref.read(biometricPreferenceProvider.notifier).set(true);
      if (context.mounted) showSuccessSnackBar(context, 'Déverrouillage biométrique activé sur cet appareil.');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final enabled = ref.watch(biometricPreferenceProvider);
    return Card(
      child: FutureBuilder<bool>(
        future: ref.read(biometricAuthenticatorProvider).isAvailable(),
        builder: (context, snapshot) {
          final available = snapshot.data ?? false;
          return SwitchListTile(
            secondary: const Icon(Icons.fingerprint_rounded, color: BColors.primary500),
            title: const Text('Déverrouillage biométrique', style: TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(
              available
                  ? 'Ouvrir l’application avec votre empreinte ou votre visage. Le code PIN reste demandé à la connexion.'
                  : 'Non disponible sur cet appareil.',
            ),
            value: enabled && available,
            onChanged: available ? (value) => _toggle(context, ref, value) : null,
          );
        },
      ),
    );
  }
}

class _DevicesSection extends ConsumerWidget {
  const _DevicesSection();

  Future<void> _revoke(BuildContext context, WidgetRef ref, DeviceSession device) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Déconnecter cet appareil ?'),
        content: Text('${device.displayName} sera déconnecté et ne pourra plus accéder à votre compte.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: BColors.danger500, minimumSize: const Size(0, BSize.touchTarget)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Déconnecter'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(securityRepositoryProvider).revoke(device.id);
      ref.invalidate(devicesProvider);
      if (context.mounted) showSuccessSnackBar(context, 'Appareil déconnecté.');
    } on AppFailure catch (failure) {
      if (context.mounted) showFailureSnackBar(context, failure);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final devices = ref.watch(devicesProvider);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Appareils connectés', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: BSpace.x3),
      devices.when(
        loading: () => const SkeletonList(count: 2),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(devicesProvider)),
        data: (items) => Card(
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            for (final (index, device) in items.indexed) ...[
              if (index > 0) const Divider(indent: 56),
              ListTile(
                minTileHeight: 64,
                leading: Icon(
                  device.platform == 'web' ? Icons.language_rounded : Icons.phone_android_rounded,
                  color: device.isRevoked ? BColors.neutral400 : BColors.primary500,
                ),
                title: Text(device.displayName, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(
                  device.isRevoked
                      ? 'Déconnecté le ${formatDate(device.revokedAt!)}'
                      : 'Dernière activité le ${formatDateTime(device.lastSeenAt)}${device.appVersion == null ? '' : ' · v${device.appVersion}'}',
                ),
                trailing: device.current
                    ? const StatusBadge(label: 'Cet appareil', tone: BadgeTone.success)
                    : device.isRevoked
                        ? null
                        : TextButton(
                            style: TextButton.styleFrom(foregroundColor: BColors.danger500),
                            onPressed: () => _revoke(context, ref, device),
                            child: const Text('Déconnecter'),
                          ),
              ),
            ],
          ]),
        ),
      ),
    ]);
  }
}
