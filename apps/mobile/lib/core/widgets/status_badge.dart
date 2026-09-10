import 'package:flutter/material.dart';

import '../theme/tokens.dart';

enum BadgeTone { neutral, info, success, warning, danger }

class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, this.tone = BadgeTone.neutral, this.icon});

  final String label;
  final BadgeTone tone;
  final IconData? icon;

  /// Libellés du statut KYC renvoyé par l'API.
  factory StatusBadge.kyc(String status) {
    return switch (status) {
      'APPROVED' => const StatusBadge(label: 'Identité vérifiée', tone: BadgeTone.success, icon: Icons.verified_rounded),
      'SUBMITTED' || 'UNDER_REVIEW' =>
        const StatusBadge(label: 'Vérification en cours', tone: BadgeTone.info, icon: Icons.hourglass_top_rounded),
      'REJECTED' => const StatusBadge(label: 'Vérification refusée', tone: BadgeTone.danger, icon: Icons.error_rounded),
      'DRAFT' => const StatusBadge(label: 'Dossier incomplet', tone: BadgeTone.warning, icon: Icons.edit_note_rounded),
      _ => const StatusBadge(label: 'Identité non vérifiée', tone: BadgeTone.warning, icon: Icons.shield_outlined),
    };
  }

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = switch (tone) {
      BadgeTone.neutral => (BColors.neutral100, BColors.textMuted),
      BadgeTone.info => (BColors.primary50, BColors.primary700),
      BadgeTone.success => (BColors.growth50, BColors.growth700),
      BadgeTone.warning => (BColors.warning50, BColors.warning700),
      BadgeTone.danger => (BColors.danger50, BColors.danger500),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: BSpace.x2 + 2, vertical: BSpace.x1),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 14, color: foreground), const SizedBox(width: BSpace.x1)],
        Text(label, style: TextStyle(color: foreground, fontSize: 12, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}
