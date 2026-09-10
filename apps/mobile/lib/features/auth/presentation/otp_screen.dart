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

/// Inscription — étape 2 sur 2 : vérification du numéro par code SMS.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key, required this.pending});
  final PendingRegistration pending;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _code = TextEditingController();
  late OtpChallenge _challenge = widget.pending.otp;
  Timer? _timer;
  Duration _untilResend = Duration.zero;
  bool _verifying = false;
  bool _resending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  void _startCountdown() {
    void tick() {
      final left = _challenge.resendAvailableAt.difference(DateTime.now());
      setState(() => _untilResend = left.isNegative ? Duration.zero : left);
      if (left.isNegative) _timer?.cancel();
    }

    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => tick());
    WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? tick() : null);
  }

  Future<void> _verify() async {
    if (_code.text.length != 6 || _verifying) return;
    setState(() {
      _verifying = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(authRepositoryProvider)
          .verifyOtp(challengeId: _challenge.challengeId, code: _code.text);
      await ref.read(sessionControllerProvider.notifier).signIn(result);
    } on ApiFailure catch (failure) {
      final remaining = failure.details['remainingAttempts'];
      setState(() {
        _error = failure.code == 'OTP_INVALID' && remaining is int
            ? 'Code incorrect. $remaining ${plural(remaining, 'tentative')} ${plural(remaining, 'restante')}.'
            : failure.message;
        _code.clear();
      });
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  Future<void> _resend() async {
    setState(() {
      _resending = true;
      _error = null;
    });
    try {
      final challenge = await ref.read(authRepositoryProvider).resendOtp(widget.pending.phone);
      setState(() {
        _challenge = challenge;
        _code.clear();
      });
      _startCountdown();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Un nouveau code vous a été envoyé.')));
      }
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final seconds = _untilResend.inSeconds;
    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(backgroundColor: BColors.surface, foregroundColor: BColors.text),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(BSpace.x6), children: [
          Center(
            child: Container(
              padding: const EdgeInsets.all(BSpace.x6),
              decoration: const BoxDecoration(color: BColors.primary50, shape: BoxShape.circle),
              child: const Icon(Icons.sms_outlined, size: 40, color: BColors.primary500),
            ),
          ),
          const SizedBox(height: BSpace.x6),
          Text('ÉTAPE 2 SUR 2',
              textAlign: TextAlign.center,
              style: text.labelMedium?.copyWith(color: BColors.primary500, fontWeight: FontWeight.w800)),
          const SizedBox(height: BSpace.x1),
          Text('Vérifiez votre numéro',
              textAlign: TextAlign.center, style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: BSpace.x2),
          Text(
            'Entrez le code à 6 chiffres envoyé par SMS au +237 ${CameroonPhone.pretty(widget.pending.phone)}.',
            textAlign: TextAlign.center,
            style: text.bodyMedium?.copyWith(color: BColors.textMuted),
          ),
          const SizedBox(height: BSpace.x8),
          OtpField(controller: _code, onCompleted: (_) => _verify()),
          const SizedBox(height: BSpace.x4),
          if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x4)],
          ListenableBuilder(
            listenable: _code,
            builder: (_, _) => LoadingButton(
              label: 'Valider',
              loading: _verifying,
              onPressed: _code.text.length == 6 ? _verify : null,
            ),
          ),
          const SizedBox(height: BSpace.x3),
          Center(
            child: seconds > 0
                ? Text('Renvoyer le code dans ${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}',
                    style: text.bodyMedium?.copyWith(color: BColors.textMuted))
                : TextButton(
                    onPressed: _resending ? null : _resend,
                    child: Text(_resending ? 'Envoi…' : 'Renvoyer le code'),
                  ),
          ),
        ]),
      ),
    );
  }
}
