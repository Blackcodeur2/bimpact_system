import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/app_failure.dart';
import '../../../core/providers.dart';
import '../../../core/security/app_lock.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/brand.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/fields.dart';
import '../application/session_controller.dart';

/// Application verrouillée : déverrouillage biométrique, ou code PIN vérifié par le serveur.
class LockScreen extends ConsumerStatefulWidget {
  const LockScreen({super.key});

  @override
  ConsumerState<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends ConsumerState<LockScreen> {
  final _pin = TextEditingController();
  bool _usePin = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _biometric());
  }

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _biometric() async {
    final ok = await ref.read(biometricAuthenticatorProvider).authenticate('Déverrouillez BENSKIN IMPACT');
    if (ok) {
      ref.read(appLockProvider.notifier).unlock();
    } else if (mounted) {
      setState(() => _usePin = true);
    }
  }

  Future<void> _withPin() async {
    final session = ref.read(sessionControllerProvider);
    if (session is! SignedIn || _pin.text.length != 6) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref.read(authRepositoryProvider).login(phone: session.user.phone, pin: _pin.text);
      await ref.read(sessionControllerProvider.notifier).signIn(result);
    } on AppFailure catch (failure) {
      setState(() {
        _error = failure is NetworkFailure ? 'Pas de réseau : utilisez votre empreinte ou réessayez plus tard.' : failure.message;
        _pin.clear();
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider);
    final firstName = session is SignedIn ? session.user.profile.firstName : '';
    return Scaffold(
      backgroundColor: BColors.navy800,
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(BSpace.x6), children: [
          const SizedBox(height: BSpace.x8),
          const BrandLockup(markSize: 64),
          const SizedBox(height: BSpace.x8),
          Text(
            'Bonjour $firstName',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: BSpace.x2),
          const Text('Déverrouillez l’application pour continuer.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white70)),
          const SizedBox(height: BSpace.x8),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: BColors.accent500),
            onPressed: _busy ? null : _biometric,
            icon: const Icon(Icons.fingerprint_rounded),
            label: const Text('Déverrouiller'),
          ),
          const SizedBox(height: BSpace.x4),
          if (!_usePin)
            TextButton(
              style: TextButton.styleFrom(foregroundColor: Colors.white),
              onPressed: () => setState(() => _usePin = true),
              child: const Text('Utiliser mon code PIN'),
            )
          else
            Container(
              padding: const EdgeInsets.all(BSpace.x4),
              decoration: BoxDecoration(color: BColors.surface, borderRadius: BorderRadius.circular(BRadius.lg)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const FieldLabel('Code PIN'),
                PinField(controller: _pin, textInputAction: TextInputAction.done, onSubmitted: (_) => _withPin()),
                const SizedBox(height: BSpace.x3),
                if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x3)],
                LoadingButton(label: 'Valider', loading: _busy, onPressed: _withPin),
              ]),
            ),
          const SizedBox(height: BSpace.x4),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: Colors.white70),
            onPressed: () => ref.read(sessionControllerProvider.notifier).logout(),
            child: const Text('Se déconnecter'),
          ),
        ]),
      ),
    );
  }
}
