import 'package:benskin_impact/core/widgets/module_preview.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const preview = Scaffold(body: Text('Solde fictif : 25 400 FCFA'));

  testWidgets('par défaut, un module sans backend affiche « bientôt disponible » et jamais la maquette', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: ModulePreviewGate(
        title: 'Recharger',
        feature: 'Le rechargement par Mobile Money',
        preview: preview,
      ),
    ));

    expect(find.text('Bientôt disponible'), findsOneWidget);
    expect(find.textContaining('Le rechargement par Mobile Money n’est pas encore disponible'), findsOneWidget);
    expect(find.text('Solde fictif : 25 400 FCFA'), findsNothing);
  });

  testWidgets('en mode aperçu, la maquette est accompagnée d’un bandeau « données fictives »', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: ModulePreviewGate(
        title: 'Recharger',
        feature: 'Le rechargement par Mobile Money',
        preview: preview,
        previewsEnabled: true,
      ),
    ));

    expect(find.text('Solde fictif : 25 400 FCFA'), findsOneWidget);
    expect(find.text('Aperçu — données fictives, aucune opération réelle'), findsOneWidget);
  });
}
