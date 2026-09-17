import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../format/phone_format.dart';
import '../theme/tokens.dart';

/// Libellé au-dessus d'un champ, comme sur la maquette.
class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BSpace.x2),
      child: Text(text, style: Theme.of(context).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600)),
    );
  }
}

/// Téléphone camerounais : indicatif +237 fixe, saisie groupée « 6 12 34 56 78 ».
class PhoneField extends StatelessWidget {
  const PhoneField({super.key, required this.controller, this.errorText, this.onSubmitted, this.textInputAction});

  final TextEditingController controller;
  final String? errorText;
  final ValueChanged<String>? onSubmitted;
  final TextInputAction? textInputAction;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: TextInputType.phone,
      textInputAction: textInputAction ?? TextInputAction.next,
      autofillHints: const [AutofillHints.telephoneNumberNational],
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9), _PhoneGroupingFormatter()],
      onFieldSubmitted: onSubmitted,
      decoration: InputDecoration(
        hintText: '6 12 34 56 78',
        errorText: errorText,
        prefixIcon: const Padding(
          padding: EdgeInsets.only(left: BSpace.x4, right: BSpace.x2),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text('🇨🇲', style: TextStyle(fontSize: 18)),
            SizedBox(width: BSpace.x2),
            Text('+237', style: TextStyle(fontWeight: FontWeight.w600, color: BColors.text)),
          ]),
        ),
      ),
      validator: (value) =>
          CameroonPhone.isValid(value ?? '') ? null : 'Entrez un numéro mobile valide (9 chiffres commençant par 6).',
    );
  }
}

class _PhoneGroupingFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = CameroonPhone.digitsOnly(newValue.text);
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i == 1 || i == 3 || i == 5 || i == 7) buffer.write(' ');
      buffer.write(digits[i]);
    }
    final text = buffer.toString();
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

/// Code PIN à 6 chiffres, masqué, avec bouton afficher/masquer.
class PinField extends StatefulWidget {
  const PinField({
    super.key,
    required this.controller,
    this.hintText = '••••••',
    this.errorText,
    this.validator,
    this.textInputAction,
    this.onSubmitted,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final String hintText;
  final String? errorText;
  final FormFieldValidator<String>? validator;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final bool autofocus;

  @override
  State<PinField> createState() => _PinFieldState();
}

class _PinFieldState extends State<PinField> {
  bool _obscured = true;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      autofocus: widget.autofocus,
      obscureText: _obscured,
      obscuringCharacter: '•',
      keyboardType: TextInputType.number,
      textInputAction: widget.textInputAction ?? TextInputAction.next,
      onFieldSubmitted: widget.onSubmitted,
      enableSuggestions: false,
      autocorrect: false,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
      style: const TextStyle(letterSpacing: 6, fontWeight: FontWeight.w700),
      decoration: InputDecoration(
        hintText: widget.hintText,
        errorText: widget.errorText,
        prefixIcon: const Icon(Icons.lock_outline_rounded),
        suffixIcon: IconButton(
          tooltip: _obscured ? 'Afficher le code' : 'Masquer le code',
          icon: Icon(_obscured ? Icons.visibility_outlined : Icons.visibility_off_outlined),
          onPressed: () => setState(() => _obscured = !_obscured),
        ),
      ),
      validator: widget.validator ??
          (value) => RegExp(r'^\d{6}$').hasMatch(value ?? '') ? null : 'Le code PIN doit contenir 6 chiffres.',
    );
  }
}

/// Saisie du code OTP à 6 chiffres (autofill SMS).
class OtpField extends StatelessWidget {
  const OtpField({super.key, required this.controller, this.errorText, this.onCompleted});

  final TextEditingController controller;
  final String? errorText;
  final ValueChanged<String>? onCompleted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      autofocus: true,
      keyboardType: TextInputType.number,
      textAlign: TextAlign.center,
      autofillHints: const [AutofillHints.oneTimeCode],
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
      style: Theme.of(context).textTheme.headlineMedium?.copyWith(letterSpacing: 14, fontWeight: FontWeight.w800),
      onChanged: (value) {
        if (value.length == 6) onCompleted?.call(value);
      },
      decoration: InputDecoration(hintText: '······', errorText: errorText, counterText: ''),
    );
  }
}
