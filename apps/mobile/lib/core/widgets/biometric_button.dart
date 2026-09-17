import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/tokens.dart';

/// Bouton d'authentification biométrique (cahier §7.4).
/// Conforme à la charte BENSKIN IMPACT avec retour haptique.
class BiometricButton extends StatelessWidget {
  const BiometricButton({
    super.key,
    required this.onPressed,
    this.label = 'Se connecter avec l’empreinte',
    this.loading = false,
    this.outlined = false,
    this.iconSize = 24,
  });

  final VoidCallback? onPressed;
  final String label;
  final bool loading;
  final bool outlined;
  final double iconSize;

  void _handleTap() {
    if (loading || onPressed == null) return;
    HapticFeedback.lightImpact();
    onPressed!();
  }

  @override
  Widget build(BuildContext context) {
    final iconWidget = loading
        ? const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
          )
        : Icon(Icons.fingerprint_rounded, size: iconSize);

    if (outlined) {
      return OutlinedButton.icon(
        style: OutlinedButton.styleFrom(
          foregroundColor: BColors.primary600,
          side: const BorderSide(color: BColors.primary500, width: 1.5),
          padding: const EdgeInsets.symmetric(horizontal: BSpace.x4, vertical: BSpace.x3),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
          minimumSize: const Size.fromHeight(48),
        ),
        onPressed: loading ? null : _handleTap,
        icon: iconWidget,
        label: Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      );
    }

    return FilledButton.icon(
      style: FilledButton.styleFrom(
        backgroundColor: BColors.growth600,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: BSpace.x4, vertical: BSpace.x3),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
        minimumSize: const Size.fromHeight(50),
        elevation: 1,
      ),
      onPressed: loading ? null : _handleTap,
      icon: iconWidget,
      label: Text(
        label,
        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
      ),
    );
  }
}
