import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../config/app_config.dart';
import '../router/app_router.dart';
import '../theme/tokens.dart';
import 'states.dart';

/// Protège les écrans de modules dont le backend n'existe pas encore.
///
/// Par défaut, l'utilisateur voit un écran « bientôt disponible » : aucune donnée fictive
/// n'est jamais présentée comme réelle (cahier §20). Avec `--dart-define=MODULE_PREVIEWS=true`,
/// la maquette est affichée avec un bandeau permanent qui signale des données fictives.
class ModulePreviewGate extends StatelessWidget {
  const ModulePreviewGate({
    super.key,
    required this.title,
    required this.feature,
    required this.preview,
    this.previewsEnabled = AppConfig.modulePreviews,
  });

  final String title;

  /// Nom du module en début de phrase, ex. « Le rechargement par Mobile Money ».
  final String feature;
  final Widget preview;
  final bool previewsEnabled;

  @override
  Widget build(BuildContext context) {
    if (!previewsEnabled) return ComingSoonScreen(title: title, feature: feature);

    return Column(children: [
      Expanded(child: preview),
      Material(
        color: BColors.warning500,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: BSpace.x4, vertical: BSpace.x2),
            child: Row(children: [
              const Icon(Icons.visibility_outlined, color: Colors.white, size: 18),
              const SizedBox(width: BSpace.x2),
              Expanded(
                child: Text(
                  'Aperçu — données fictives, aucune opération réelle',
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                ),
              ),
            ]),
          ),
        ),
      ),
    ]);
  }
}

class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen({super.key, required this.title, required this.feature});

  final String title;
  final String feature;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: SingleChildScrollView(
          child: EmptyState(
            icon: Icons.hourglass_empty_rounded,
            title: 'Bientôt disponible',
            message: '$feature n’est pas encore disponible. Il sera activé dès que le service sera prêt et vérifié.',
            action: OutlinedButton(
              style: OutlinedButton.styleFrom(minimumSize: const Size(200, BSize.touchTarget)),
              onPressed: () => context.canPop() ? context.pop() : context.go(Routes.home),
              child: const Text('Retour'),
            ),
          ),
        ),
      ),
    );
  }
}
