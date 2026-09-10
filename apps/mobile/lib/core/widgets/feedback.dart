import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// Erreur de formulaire affichée au-dessus du bouton principal.
class FormErrorBanner extends StatelessWidget {
  const FormErrorBanner(this.message, {super.key});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BSpace.x3),
      decoration: BoxDecoration(color: BColors.danger50, borderRadius: BorderRadius.circular(BRadius.md)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.error_outline_rounded, color: BColors.danger500, size: 20),
        const SizedBox(width: BSpace.x2),
        Expanded(
          child: Text(message, style: const TextStyle(color: BColors.danger500, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }
}

/// Bouton principal avec indicateur de chargement (évite les doubles soumissions).
class LoadingButton extends StatelessWidget {
  const LoadingButton({super.key, required this.label, required this.onPressed, this.loading = false});

  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: loading ? null : onPressed,
      child: loading
          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
          : Text(label),
    );
  }
}

/// Fonctionnalité prévue au cahier mais pas encore livrée : on le dit clairement.
void showComingSoon(BuildContext context, String feature) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text('$feature arrive dans une prochaine version.')));
}

void showSuccessSnackBar(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: BColors.growth600,
    ));
}

void showErrorSnackBar(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: BColors.danger500,
    ));
}

void showInfoSnackBar(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: BColors.primary600,
    ));
}

String plural(int count, String singular, [String? pluralForm]) =>
    count > 1 ? (pluralForm ?? '${singular}s') : singular;
