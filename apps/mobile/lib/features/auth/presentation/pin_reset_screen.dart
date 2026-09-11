import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/phone_format.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/fields.dart';
import '../application/session_controller.dart';
import '../domain/auth_models.dart';

/// Code PIN oublié : code reçu par SMS puis nouveau PIN. Toutes les sessions ouvertes sont fermées par le serveur.
class PinResetScreen extends ConsumerStatefulWidget {
  const PinResetScreen({super.key});

  @override
  ConsumerState<PinResetScreen> createState() => _PinResetScreenState();
}

class _PinResetScreenState extends ConsumerState<PinResetScreen> {
  final _phoneForm = GlobalKey<FormState>();
  final _resetForm = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _pin = TextEditingController();
  final _pinConfirm = TextEditingController();

  PendingRegistration? _pending;
  Timer? _timer;
  Duration _untilResend = Duration.zero;
  bool _busy = false;
  String? _error;
  String? _pinError;

  @override
  void dispose() {
    _timer?.cancel();
    for (final controller in [_phone, _code, _pin, _pinConfirm]) {
      controller.dispose();
    }
    super.dispose();
  }

  void _startCountdown() {
    void tick() {
      final left = _pending!.otp.resendAvailableAt.difference(DateTime.now());
      if (mounted) setState(() => _untilResend = left.isNegative ? Duration.zero : left);
      if (left.isNegative) _timer?.cancel();
    }

    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => tick());
    tick();
  }

  Future<void> _request() async {
    setState(() => _error = null);
    if (_pending == null && !_phoneForm.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final phone = _pending?.phone ?? CameroonPhone.toE164(_phone.text);
      final pending = await ref.read(authRepositoryProvider).requestPinReset(phone);
      setState(() {
        _pending = pending;
        _code.clear();
      });
      _startCountdown();
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm() async {
    setState(() => _error = _pinError = null);
    if (!_resetForm.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final result = await ref.read(authRepositoryProvider).confirmPinReset(
            challengeId: _pending!.otp.challengeId,
            code: _code.text,
            newPin: _pin.text,
          );
      await ref.read(sessionControllerProvider.notifier).signIn(result);
    } on ApiFailure catch (failure) {
      setState(() {
        if (failure.code == 'PIN_TOO_WEAK') {
          _pinError = failure.message;
        } else if (failure.code == 'OTP_INVALID' && failure.details['remainingAttempts'] is int) {
          final remaining = failure.details['remainingAttempts'] as int;
          _error = 'Code incorrect. $remaining ${plural(remaining, 'tentative')} ${plural(remaining, 'restante')}.';
        } else {
          _error = failure.message;
        }
      });
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final pending = _pending;
    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(backgroundColor: BColors.surface, foregroundColor: BColors.text, title: const Text('Code PIN oublié')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(BSpace.x6), children: [
          Center(
            child: Container(
              padding: const EdgeInsets.all(BSpace.x6),
              decoration: const BoxDecoration(color: BColors.primary50, shape: BoxShape.circle),
              child: const Icon(Icons.lock_reset_rounded, size: 40, color: BColors.primary500),
            ),
          ),
          const SizedBox(height: BSpace.x6),
          if (pending == null)
            Form(
              key: _phoneForm,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Recevoir un code', textAlign: TextAlign.center, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: BSpace.x2),
                Text(
                  'Entrez le numéro de votre compte. Si ce numéro est inscrit, vous recevrez un code par SMS.',
                  textAlign: TextAlign.center,
                  style: text.bodyMedium?.copyWith(color: BColors.textMuted),
                ),
                const SizedBox(height: BSpace.x6),
                const FieldLabel('Numéro de téléphone'),
                PhoneField(controller: _phone, textInputAction: TextInputAction.done, onSubmitted: (_) => _request()),
                const SizedBox(height: BSpace.x4),
                if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x4)],
                LoadingButton(label: 'Recevoir le code', loading: _busy, onPressed: _request),
              ]),
            )
          else
            Form(
              key: _resetForm,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Nouveau code PIN', textAlign: TextAlign.center, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: BSpace.x2),
                Text(
                  'Saisissez le code reçu au +237 ${CameroonPhone.pretty(pending.phone)} puis choisissez un nouveau code PIN.',
                  textAlign: TextAlign.center,
                  style: text.bodyMedium?.copyWith(color: BColors.textMuted),
                ),
                const SizedBox(height: BSpace.x6),
                const FieldLabel('Code reçu par SMS'),
                OtpField(controller: _code),
                const SizedBox(height: BSpace.x4),
                const FieldLabel('Nouveau code PIN'),
                PinField(controller: _pin, errorText: _pinError),
                const SizedBox(height: BSpace.x4),
                const FieldLabel('Confirmez le nouveau code PIN'),
                PinField(
                  controller: _pinConfirm,
                  textInputAction: TextInputAction.done,
                  validator: (value) => value != _pin.text ? 'Les deux codes PIN ne correspondent pas.' : null,
                ),
                const SizedBox(height: BSpace.x4),
                if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x4)],
                LoadingButton(label: 'Enregistrer et me connecter', loading: _busy, onPressed: _confirm),
                const SizedBox(height: BSpace.x3),
                Center(
                  child: _untilResend > Duration.zero
                      ? Text('Renvoyer le code dans ${_untilResend.inSeconds} s', style: text.bodyMedium?.copyWith(color: BColors.textMuted))
                      : TextButton(onPressed: _busy ? null : _request, child: const Text('Renvoyer le code')),
                ),
              ]),
            ),
        ]),
      ),
    );
  }
}
