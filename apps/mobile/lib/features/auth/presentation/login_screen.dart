import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/format/phone_format.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/providers.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/brand.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/fields.dart';
import '../application/session_controller.dart';

/// Connexion par téléphone + code PIN (cahier §7.4).
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _pin = TextEditingController();
  bool _submitting = false;
  String? _phoneError;
  String? _pinError;
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
    });
  }

  @override
  void dispose() {
    _phone.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _phoneError = _pinError = _formError = null);
    if (!_form.currentState!.validate()) return;

    setState(() => _submitting = true);
    try {
      final result = await ref
          .read(authRepositoryProvider)
          .login(phone: CameroonPhone.toE164(_phone.text), pin: _pin.text);
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
            ? 'Numéro ou code PIN incorrect. $remaining ${plural(remaining, 'tentative')} ${plural(remaining, 'restante')}.'
            : failure.message;
      case 'ACCOUNT_LOCKED':
        final until = DateTime.tryParse('${failure.details['lockedUntil']}');
        _formError = until == null
            ? failure.message
            : 'Trop de tentatives. Réessayez après ${DateFormat.Hm('fr').format(until.toLocal())}.';
      case 'VALIDATION_FAILED':
        _phoneError = failure.fieldError('phone');
        _pinError = failure.fieldError('pin');
        if (_phoneError == null && _pinError == null) _formError = failure.message;
      default:
        _formError = failure.message;
    }
  }

  void _forgotPin() {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Code PIN oublié'),
        content: const Text(
          'La réinitialisation du code PIN par SMS arrive dans une prochaine version. '
          'En attendant, contactez le support BENSKIN IMPACT.',
        ),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Compris'))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
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
              child: Form(
                key: _form,
                child: AutofillGroup(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text('Connexion', style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: BSpace.x1),
                    Text('Entrez votre numéro et votre code PIN.', style: text.bodyMedium?.copyWith(color: BColors.textMuted)),
                    const SizedBox(height: BSpace.x6),
                    const FieldLabel('Numéro de téléphone'),
                    PhoneField(controller: _phone, errorText: _phoneError),
                    const SizedBox(height: BSpace.x4),
                    const FieldLabel('Code PIN'),
                    PinField(
                      controller: _pin,
                      errorText: _pinError,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _submit(),
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(onPressed: _forgotPin, child: const Text('Code PIN oublié ?')),
                    ),
                    if (_formError != null) ...[FormErrorBanner(_formError!), const SizedBox(height: BSpace.x4)],
                    LoadingButton(label: 'Se connecter', loading: _submitting, onPressed: _submit),
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
