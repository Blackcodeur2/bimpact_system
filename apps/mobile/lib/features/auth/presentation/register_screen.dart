import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/phone_format.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/providers.dart';
import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/brand.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/fields.dart';

/// Inscription conducteur — étape 1 sur 2 (cahier §7.3). L'étape 2 est la vérification OTP.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _city = TextEditingController();
  final _pin = TextEditingController();
  final _pinConfirm = TextEditingController();
  bool _acceptTerms = false;
  bool _acceptPrivacy = false;
  bool _submitting = false;
  bool _showConsentError = false;
  Map<String, String> _fieldErrors = {};
  String? _formError;

  @override
  void dispose() {
    for (final c in [_phone, _firstName, _lastName, _city, _pin, _pinConfirm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _fieldErrors = {};
      _formError = null;
      _showConsentError = !(_acceptTerms && _acceptPrivacy);
    });
    final valid = _form.currentState!.validate();
    if (!valid || _showConsentError) return;

    setState(() => _submitting = true);
    try {
      final pending = await ref.read(authRepositoryProvider).register(
            phone: CameroonPhone.toE164(_phone.text),
            firstName: _firstName.text.trim(),
            lastName: _lastName.text.trim(),
            city: _city.text.trim(),
            pin: _pin.text,
            acceptTerms: _acceptTerms,
            acceptPrivacy: _acceptPrivacy,
          );
      if (mounted) context.push(Routes.otp, extra: pending);
    } on ApiFailure catch (failure) {
      setState(() {
        switch (failure.code) {
          case 'VALIDATION_FAILED':
            _fieldErrors = failure.fieldErrors.map((field, messages) => MapEntry(field, messages.first));
            if (_fieldErrors.isEmpty) _formError = failure.message;
          case 'PIN_TOO_WEAK':
            _fieldErrors = {'pin': failure.message};
          case 'PHONE_ALREADY_REGISTERED':
            _fieldErrors = {'phone': failure.message};
          default:
            _formError = failure.message;
        }
      });
    } on AppFailure catch (failure) {
      setState(() => _formError = failure.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String? _required(String? value, String label) =>
      (value ?? '').trim().length < 2 ? '$label : 2 caractères minimum.' : null;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        backgroundColor: BColors.surface,
        foregroundColor: BColors.text,
        title: const BrandLockup(markSize: 32, onDark: false, vertical: false),
      ),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(padding: const EdgeInsets.fromLTRB(BSpace.x6, BSpace.x2, BSpace.x6, BSpace.x8), children: [
            Text('ÉTAPE 1 SUR 2', style: text.labelMedium?.copyWith(color: BColors.primary500, fontWeight: FontWeight.w800)),
            const SizedBox(height: BSpace.x1),
            Text('Inscription', style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: BSpace.x1),
            Text('Créez votre compte conducteur. Un code de vérification vous sera envoyé par SMS.',
                style: text.bodyMedium?.copyWith(color: BColors.textMuted)),
            const SizedBox(height: BSpace.x6),
            const FieldLabel('Numéro de téléphone'),
            PhoneField(controller: _phone, errorText: _fieldErrors['phone']),
            const SizedBox(height: BSpace.x4),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const FieldLabel('Prénom'),
                  TextFormField(
                    controller: _firstName,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.givenName],
                    decoration: InputDecoration(errorText: _fieldErrors['firstName']),
                    validator: (v) => _required(v, 'Prénom'),
                  ),
                ]),
              ),
              const SizedBox(width: BSpace.x3),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const FieldLabel('Nom'),
                  TextFormField(
                    controller: _lastName,
                    textCapitalization: TextCapitalization.words,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.familyName],
                    decoration: InputDecoration(errorText: _fieldErrors['lastName']),
                    validator: (v) => _required(v, 'Nom'),
                  ),
                ]),
              ),
            ]),
            const SizedBox(height: BSpace.x4),
            const FieldLabel('Ville'),
            TextFormField(
              controller: _city,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              decoration: InputDecoration(
                hintText: 'Ex. Douala, Yaoundé, Bafoussam…',
                prefixIcon: const Icon(Icons.location_on_outlined),
                errorText: _fieldErrors['city'],
              ),
              validator: (v) => _required(v, 'Ville'),
            ),
            const SizedBox(height: BSpace.x4),
            const FieldLabel('Code PIN (6 chiffres)'),
            PinField(controller: _pin, errorText: _fieldErrors['pin']),
            const SizedBox(height: BSpace.x2),
            Text('Évitez les codes simples comme 123456 ou votre date de naissance.',
                style: text.bodySmall?.copyWith(color: BColors.textMuted)),
            const SizedBox(height: BSpace.x4),
            const FieldLabel('Confirmez le code PIN'),
            PinField(
              controller: _pinConfirm,
              textInputAction: TextInputAction.done,
              validator: (v) => v != _pin.text ? 'Les deux codes PIN ne correspondent pas.' : null,
            ),
            const SizedBox(height: BSpace.x4),
            _ConsentTile(
              value: _acceptTerms,
              label: 'J’accepte les conditions d’utilisation de BENSKIN IMPACT.',
              onChanged: (v) => setState(() => _acceptTerms = v),
            ),
            _ConsentTile(
              value: _acceptPrivacy,
              label: 'J’accepte la politique de confidentialité et le traitement de mes données.',
              onChanged: (v) => setState(() => _acceptPrivacy = v),
            ),
            if (_showConsentError)
              const Padding(
                padding: EdgeInsets.only(left: BSpace.x3, bottom: BSpace.x2),
                child: Text('Vous devez accepter les deux conditions pour continuer.',
                    style: TextStyle(color: BColors.danger500, fontSize: 12.5)),
              ),
            const SizedBox(height: BSpace.x4),
            if (_formError != null) ...[FormErrorBanner(_formError!), const SizedBox(height: BSpace.x4)],
            LoadingButton(label: 'Continuer', loading: _submitting, onPressed: _submit),
            const SizedBox(height: BSpace.x3),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text('Vous avez déjà un compte ?', style: text.bodyMedium),
              TextButton(onPressed: () => context.go(Routes.login), child: const Text('Se connecter')),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _ConsentTile extends StatelessWidget {
  const _ConsentTile({required this.value, required this.label, required this.onChanged});
  final bool value;
  final String label;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return CheckboxListTile(
      value: value,
      onChanged: (v) => onChanged(v ?? false),
      controlAffinity: ListTileControlAffinity.leading,
      contentPadding: EdgeInsets.zero,
      dense: true,
      title: Text(label, style: Theme.of(context).textTheme.bodyMedium),
    );
  }
}
