import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/security/biometric_controller.dart';
import '../../../core/widgets/biometric_button.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/providers.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/brand.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/fields.dart';
import '../application/session_controller.dart';

/// Connexion par e-mail / nom d'utilisateur + mot de passe ou empreinte digitale.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  bool _submitting = false;
  bool _showManualForm = false;
  String? _identifierError;
  String? _passwordError;
  String? _formError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final session = ref.read(sessionControllerProvider);
      if (session is SignedOut && session.reason == SignedOutReason.expired && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Votre session a expiré. Reconnectez-vous.')),
        );
      }
      ref.read(biometricControllerProvider.notifier).refresh().then((_) {
        if (!mounted) return;
        final bio = ref.read(biometricControllerProvider);
        if (bio.enrolledPhone != null && _identifier.text.isEmpty) {
          _identifier.text = bio.enrolledPhone!;
        }
      });
    });
  }

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _loginWithBiometrics() async {
    setState(() => _formError = null);
    final success = await ref.read(biometricControllerProvider.notifier).loginWithBiometrics();
    if (!success && mounted) {
      final bioState = ref.read(biometricControllerProvider);
      if (bioState.lastError != null) {
        setState(() => _formError = bioState.lastError);
      }
    }
  }

  Future<void> _promptBiometricEnrollment({
    required BuildContext context,
    required String identifier,
    required String password,
    required String firstName,
  }) async {
    final shouldEnroll = await showModalBottomSheet<bool>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(BSpace.x6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(
                child: Icon(Icons.fingerprint_rounded, size: 56, color: BColors.growth600),
              ),
              const SizedBox(height: BSpace.x4),
              Text(
                'Activer l’empreinte digitale ?',
                textAlign: TextAlign.center,
                style: Theme.of(ctx).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: BSpace.x2),
              Text(
                'Connectez-vous en un instant lors de vos prochaines visites sans avoir à retaper votre mot de passe.',
                textAlign: TextAlign.center,
                style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(color: BColors.textMuted),
              ),
              const SizedBox(height: BSpace.x6),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: BColors.growth600,
                  minimumSize: const Size.fromHeight(48),
                ),
                onPressed: () => Navigator.of(ctx).pop(true),
                icon: const Icon(Icons.fingerprint_rounded),
                label: const Text('Activer maintenant'),
              ),
              const SizedBox(height: BSpace.x2),
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('Plus tard'),
              ),
            ],
          ),
        ),
      ),
    );

    if (shouldEnroll == true && mounted) {
      await ref.read(biometricControllerProvider.notifier).enroll(
            identifier: identifier,
            password: password,
            firstName: firstName,
          );
    }
  }

  Future<void> _submit() async {
    setState(() => _identifierError = _passwordError = _formError = null);
    if (!_form.currentState!.validate()) return;

    setState(() => _submitting = true);
    try {
      final identifier = _identifier.text.trim();
      final password = _password.text;
      final result = await ref
          .read(authRepositoryProvider)
          .login(identifier: identifier, password: password);

      final bioState = ref.read(biometricControllerProvider);
      if (bioState.isAvailable && !bioState.isEnrolled && mounted) {
        await _promptBiometricEnrollment(
          context: context,
          identifier: identifier,
          password: password,
          firstName: result.user.profile.firstName,
        );
      }

      await ref.read(sessionControllerProvider.notifier).signIn(result);
    } on ApiFailure catch (failure) {
      setState(() => _applyFailure(failure));
    } on AppFailure catch (failure) {
      setState(() => _formError = failure is NetworkFailure
          ? 'Connexion impossible hors ligne. Vérifiez votre réseau puis réessayez.'
          : failure.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _applyFailure(ApiFailure failure) {
    switch (failure.code) {
      case 'INVALID_CREDENTIALS':
        final remaining = failure.details['remainingAttempts'];
        _formError = remaining is int
            ? 'Identifiant ou mot de passe incorrect. $remaining ${plural(remaining, 'tentative')} ${plural(remaining, 'restante')}.'
            : failure.message;
      case 'ACCOUNT_LOCKED':
        final until = DateTime.tryParse('${failure.details['lockedUntil']}');
        _formError = until == null
            ? failure.message
            : 'Trop de tentatives. Réessayez après ${DateFormat.Hm('fr').format(until.toLocal())}.';
      case 'VALIDATION_FAILED':
        _identifierError = failure.fieldError('identifier');
        _passwordError = failure.fieldError('password');
        if (_identifierError == null && _passwordError == null) _formError = failure.message;
      default:
        _formError = failure.message;
    }
  }

  void _forgotPassword() => context.push(Routes.pinReset);

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final bioState = ref.watch(biometricControllerProvider);
    final canUseBiometrics = bioState.canLoginWithBiometrics;
    final inBiometricMode = canUseBiometrics && !_showManualForm;

    return Scaffold(
      backgroundColor: BColors.navy800,
      body: SafeArea(
        bottom: false,
        child: SingleChildScrollView(
          child: Column(children: [
            const SizedBox(height: BSpace.x8),
            const BrandLockup(markSize: 60),
            const SizedBox(height: BSpace.x4),
            const Tagline(),
            const SizedBox(height: BSpace.x8),
            Container(
              constraints: BoxConstraints(minHeight: MediaQuery.sizeOf(context).height * 0.62),
              decoration: const BoxDecoration(
                color: BColors.surface,
                borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
              ),
              padding: const EdgeInsets.fromLTRB(BSpace.x6, BSpace.x8, BSpace.x6, BSpace.x6),
              child: inBiometricMode
                  ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Text('Connexion', style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                      const SizedBox(height: BSpace.x1),
                      Text('Bienvenue ${bioState.enrolledFirstName ?? 'sur BENSKIN IMPACT'}.',
                          style: text.bodyMedium?.copyWith(color: BColors.textMuted)),
                      const SizedBox(height: BSpace.x6),
                      Container(
                        padding: const EdgeInsets.all(BSpace.x4),
                        decoration: BoxDecoration(
                          color: BColors.neutral50,
                          borderRadius: BorderRadius.circular(BRadius.md),
                          border: Border.all(color: BColors.border),
                        ),
                        child: Row(children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: const BoxDecoration(
                              color: BColors.primary50,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.person_rounded, color: BColors.primary600),
                          ),
                          const SizedBox(width: BSpace.x3),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(
                                bioState.enrolledFirstName ?? 'Membre',
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                              ),
                              Text(
                                bioState.enrolledPhone ?? '',
                                style: const TextStyle(color: BColors.textMuted, fontSize: 13),
                              ),
                            ]),
                          ),
                          const Icon(Icons.fingerprint_rounded, color: BColors.growth600, size: 28),
                        ]),
                      ),
                      const SizedBox(height: BSpace.x6),
                      if (_formError != null) ...[FormErrorBanner(_formError!), const SizedBox(height: BSpace.x4)],
                      BiometricButton(
                        loading: bioState.isAuthenticating,
                        onPressed: _loginWithBiometrics,
                      ),
                      const SizedBox(height: BSpace.x4),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(48),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                        ),
                        onPressed: () => setState(() => _showManualForm = true),
                        icon: const Icon(Icons.lock_outline_rounded),
                        label: const Text('Se connecter avec le mot de passe'),
                      ),
                      const SizedBox(height: BSpace.x3),
                      TextButton(
                        onPressed: () {
                          setState(() {
                            _showManualForm = true;
                            _identifier.clear();
                            _password.clear();
                          });
                        },
                        child: const Text('Se connecter avec un autre compte'),
                      ),
                      const SizedBox(height: BSpace.x4),
                      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Text('Pas encore de compte ?', style: text.bodyMedium),
                        TextButton(onPressed: () => context.go(Routes.register), child: const Text('Créer un compte')),
                      ]),
                    ])
                  : Form(
                      key: _form,
                      child: AutofillGroup(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          Text('Connexion', style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                          const SizedBox(height: BSpace.x1),
                          Text('Entrez votre identifiant et votre mot de passe.',
                              style: text.bodyMedium?.copyWith(color: BColors.textMuted)),
                          const SizedBox(height: BSpace.x6),
                          const FieldLabel("E-mail ou nom d'utilisateur"),
                          TextFormField(
                            controller: _identifier,
                            keyboardType: TextInputType.emailAddress,
                            textInputAction: TextInputAction.next,
                            autofillHints: const [AutofillHints.username, AutofillHints.email],
                            decoration: InputDecoration(
                              hintText: 'ex. nom@exemple.cm ou mon_pseudo',
                              errorText: _identifierError,
                              prefixIcon: const Icon(Icons.person_outline_rounded),
                            ),
                            validator: (v) =>
                                (v == null || v.trim().length < 3) ? "Entrez un e-mail ou nom d'utilisateur valide." : null,
                          ),
                          const SizedBox(height: BSpace.x4),
                          const FieldLabel('Mot de passe'),
                          PasswordField(
                            controller: _password,
                            errorText: _passwordError,
                            textInputAction: TextInputAction.done,
                            onSubmitted: (_) => _submit(),
                          ),
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(onPressed: _forgotPassword, child: const Text('Mot de passe oublié ?')),
                          ),
                          if (_formError != null) ...[FormErrorBanner(_formError!), const SizedBox(height: BSpace.x4)],
                          LoadingButton(label: 'Se connecter', loading: _submitting, onPressed: _submit),
                          if (canUseBiometrics) ...[
                            const SizedBox(height: BSpace.x3),
                            BiometricButton(
                              outlined: true,
                              label: 'Revenir à la connexion par empreinte',
                              loading: bioState.isAuthenticating,
                              onPressed: () => setState(() => _showManualForm = false),
                            ),
                          ],
                          const SizedBox(height: BSpace.x4),
                          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                            Text('Pas encore de compte ?', style: text.bodyMedium),
                            TextButton(onPressed: () => context.go(Routes.register), child: const Text('Créer un compte')),
                          ]),
                        ]),
                      ),
                    ),
            ),
          ]),
        ),
      ),
    );
  }
}
