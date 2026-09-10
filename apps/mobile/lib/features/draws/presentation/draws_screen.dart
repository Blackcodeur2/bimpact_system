import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';

/// Écran de tirage transparent et auditable (cahier §7.11 et design-board).
class DrawsScreen extends ConsumerWidget {
  const DrawsScreen({super.key});

  void _showProofDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.verified_user_rounded, color: BColors.growth600),
            SizedBox(width: BSpace.x2),
            Text('Preuve cryptographique', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Chaque tirage BENSKIN IMPACT repose sur un algorithme déterministe et publiquement vérifiable pour garantir une équité totale.',
              style: TextStyle(fontSize: 13.5, height: 1.4),
            ),
            const SizedBox(height: BSpace.x4),
            Container(
              padding: const EdgeInsets.all(BSpace.x3),
              decoration: BoxDecoration(
                color: BColors.neutral50,
                borderRadius: BorderRadius.circular(BRadius.md),
                border: Border.all(color: BColors.border),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Empreinte du tirage (SHA-256)', style: TextStyle(color: BColors.textMuted, fontSize: 11.5)),
                  SizedBox(height: 4),
                  SelectableText(
                    '0x873d6a4f91b72e38c50d4f55a821e06f6c91a78e4d29b01c',
                    style: TextStyle(fontFamily: 'monospace', fontSize: 11, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
            const SizedBox(height: BSpace.x3),
            const Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Semence aléatoire (Seed)', style: TextStyle(color: BColors.textMuted, fontSize: 12)),
                Text('Bloc #849201', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
              ],
            ),
            const SizedBox(height: BSpace.x1),
            const Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Horodatage certifié', style: TextStyle(color: BColors.textMuted, fontSize: 12)),
                Text('12 avr. 2026 à 08:00:00 UTC', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Clipboard.setData(const ClipboardData(text: '0x873d6a4f91b72e38c50d4f55a821e06f6c91a78e4d29b01c'));
              Navigator.pop(ctx);
              showSuccessSnackBar(context, 'Empreinte copiée dans le presse-papier');
            },
            child: const Text('Copier le hash'),
          ),
          FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Fermer')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: BColors.background,
      appBar: AppBar(
        title: const Text('Tirage', style: TextStyle(fontWeight: FontWeight.w800)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BSpace.x4),
          children: [
            // Titre de section
            Text('Sélection quotidienne', style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w900, color: BColors.navy900)),
            const SizedBox(height: BSpace.x1),
            const Text(
              '10 bénéficiaires sélectionnés aujourd’hui parmi les conducteurs assidus.',
              style: TextStyle(color: BColors.textMuted, fontSize: 14),
            ),
            const SizedBox(height: BSpace.x6),
            // Carte principale résultat du tirage
            Container(
              padding: const EdgeInsets.all(BSpace.x6),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(BRadius.xl),
                boxShadow: BShadow.raised,
              ),
              child: Column(
                children: [
                  // Cercle animé 10/10
                  Container(
                    width: 130,
                    height: 130,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: BColors.growth500, width: 8),
                      color: BColors.growth50,
                    ),
                    alignment: Alignment.center,
                    child: const Text(
                      '10 / 10',
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                        color: BColors.growth700,
                      ),
                    ),
                  ),
                  const SizedBox(height: BSpace.x6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: BSpace.x3, vertical: BSpace.x1),
                    decoration: BoxDecoration(
                      color: BColors.accent50,
                      borderRadius: BorderRadius.circular(BRadius.pill),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('✨ Félicitations ! ✨', style: TextStyle(color: BColors.accent700, fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ),
                  const SizedBox(height: BSpace.x3),
                  Text(
                    'Vous êtes sélectionné pour le programme entrepreneurial.',
                    textAlign: TextAlign.center,
                    style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: BColors.navy900, height: 1.3),
                  ),
                  const SizedBox(height: BSpace.x2),
                  const Text(
                    'Accédez dès maintenant à votre formation de 6 mois prise en charge et bénéficiez de l’accompagnement de projet.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: BColors.textMuted, fontSize: 13.5, height: 1.4),
                  ),
                  const SizedBox(height: BSpace.x6),
                  FilledButton(
                    onPressed: () => context.push(Routes.training),
                    style: FilledButton.styleFrom(
                      backgroundColor: BColors.growth600,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('Commencer mon parcours'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: BSpace.x6),
            // Bloc de transparence et audit
            Container(
              padding: const EdgeInsets.all(BSpace.x4),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(BRadius.lg),
                boxShadow: BShadow.card,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text('Certitude & Auditabilité', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                      ),
                      const SizedBox(width: BSpace.x2),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: BSpace.x2, vertical: 2),
                        decoration: BoxDecoration(
                          color: BColors.growth50,
                          borderRadius: BorderRadius.circular(BRadius.pill),
                        ),
                        child: const Text('Terminé', style: TextStyle(color: BColors.growth700, fontSize: 11, fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                  const SizedBox(height: BSpace.x3),
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(child: Text('Population éligible', style: TextStyle(color: BColors.textMuted))),
                      Text('12 200 conducteurs', style: TextStyle(fontWeight: FontWeight.w700)),
                    ],
                  ),
                  const SizedBox(height: BSpace.x2),
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(child: Text('Bénéficiaires tirés', style: TextStyle(color: BColors.textMuted))),
                      Text('10 retenus', style: TextStyle(fontWeight: FontWeight.w700)),
                    ],
                  ),
                  const SizedBox(height: BSpace.x2),
                  const Row(
                    children: [
                      Text('Empreinte vérifiable', style: TextStyle(color: BColors.textMuted)),
                      Spacer(),
                      Flexible(
                        child: Text(
                          '0x873d6...06f6',
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontWeight: FontWeight.w700, fontFamily: 'monospace'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: BSpace.x4),
                  OutlinedButton.icon(
                    onPressed: () => _showProofDialog(context),
                    icon: const Icon(Icons.shield_outlined, size: 18),
                    label: const Text('Voir la preuve du tirage'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
