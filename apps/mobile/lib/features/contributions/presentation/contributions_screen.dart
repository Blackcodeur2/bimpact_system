import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';

/// Écran de gestion des contributions quotidiennes (cahier §7.10 et design-board).
class ContributionsScreen extends ConsumerStatefulWidget {
  const ContributionsScreen({super.key});

  @override
  ConsumerState<ContributionsScreen> createState() => _ContributionsScreenState();
}

class _ContributionsScreenState extends ConsumerState<ContributionsScreen> {
  final bool _autoDebit = true;

  final _recentContributions = const [
    ('Aujourd’hui à 07:15', '200', 'Succès'),
    ('Hier à 07:12', '200', 'Succès'),
    ('10 avr. 2026 à 07:30', '200', 'Succès'),
    ('09 avr. 2026 à 07:05', '200', 'Succès'),
    ('08 avr. 2026 à 08:10', '200', 'Succès'),
  ];

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: BColors.background,
      appBar: AppBar(
        title: const Text('Contribution', style: TextStyle(fontWeight: FontWeight.w800)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BSpace.x4),
          children: [
            // Carte principale Ma contribution
            Container(
              padding: const EdgeInsets.all(BSpace.x6),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [BColors.navy800, BColors.primary600],
                ),
                borderRadius: BorderRadius.circular(BRadius.xl),
                boxShadow: BShadow.raised,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Ma contribution',
                        style: TextStyle(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.w600),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: BSpace.x3, vertical: BSpace.x1),
                        decoration: BoxDecoration(
                          color: BColors.growth500,
                          borderRadius: BorderRadius.circular(BRadius.pill),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.check_circle, size: 14, color: Colors.white),
                            SizedBox(width: 4),
                            Text('Active', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: BSpace.x4),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      const Text(
                        '200',
                        style: TextStyle(
                          fontSize: 38,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          letterSpacing: -0.5,
                        ),
                      ),
                      const SizedBox(width: BSpace.x2),
                      const Text(
                        'FCFA / jour',
                        style: TextStyle(color: Colors.white70, fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  const SizedBox(height: BSpace.x2),
                  const Text(
                    'Contribution communautaire programmée',
                    style: TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                  const Divider(color: Colors.white24, height: BSpace.x6),
                  const Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Dernière contribution', style: TextStyle(color: Colors.white60, fontSize: 12)),
                            SizedBox(height: 2),
                            Text('Aujourd’hui', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text('Prochaine contribution', style: TextStyle(color: Colors.white60, fontSize: 12)),
                            SizedBox(height: 2),
                            Text('Demain à 07:00', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: BSpace.x6),
            // Assiduité / Régularité
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
                      Text('Assiduité ce mois', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                      const Text('10 / 10 jours', style: TextStyle(color: BColors.growth600, fontWeight: FontWeight.w800)),
                    ],
                  ),
                  const SizedBox(height: BSpace.x2),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(BRadius.pill),
                    child: const LinearProgressIndicator(
                      value: 1.0,
                      minHeight: 8,
                      backgroundColor: BColors.neutral100,
                      valueColor: AlwaysStoppedAnimation<Color>(BColors.growth500),
                    ),
                  ),
                  const SizedBox(height: BSpace.x3),
                  const Text(
                    'Votre régularité vous rend 100% éligible aux tirages quotidiens du programme entrepreneurial.',
                    style: TextStyle(color: BColors.textMuted, fontSize: 13),
                  ),
                ],
              ),
            ),
            const SizedBox(height: BSpace.x6),
            // Paramètre Prélèvement automatique
            Container(
              padding: const EdgeInsets.symmetric(horizontal: BSpace.x4, vertical: BSpace.x3),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(BRadius.lg),
                boxShadow: BShadow.card,
              ),
              child: SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _autoDebit,
                activeThumbColor: BColors.growth500,
                // Aperçu : aucun réglage n'est enregistré tant que le module Contributions n'existe pas.
                onChanged: (_) => showInfoSnackBar(
                  context,
                  'Aperçu : le prélèvement automatique n’est pas encore disponible.',
                ),
                title: const Text('Prélèvement automatique', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                subtitle: const Text(
                  'Débit direct depuis votre portefeuille chaque matin à 07h00.',
                  style: TextStyle(color: BColors.textMuted, fontSize: 12.5),
                ),
              ),
            ),
            const SizedBox(height: BSpace.x6),
            // Historique des contributions
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Historique récent', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                TextButton(
                  onPressed: () => context.push(Routes.transactions),
                  child: const Text('Tout voir'),
                ),
              ],
            ),
            const SizedBox(height: BSpace.x2),
            ..._recentContributions.map((item) {
              return Card(
                margin: const EdgeInsets.only(bottom: BSpace.x2),
                child: ListTile(
                  leading: Container(
                    padding: const EdgeInsets.all(BSpace.x2),
                    decoration: const BoxDecoration(
                      color: BColors.primary50,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.savings_rounded, color: BColors.primary500, size: 22),
                  ),
                  title: const Text('Contribution journalière', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                  subtitle: Text(item.$1, style: const TextStyle(color: BColors.textMuted, fontSize: 12)),
                  trailing: Text(
                    '-${item.$2} FCFA',
                    style: const TextStyle(fontWeight: FontWeight.w800, color: BColors.text, fontSize: 14.5),
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
