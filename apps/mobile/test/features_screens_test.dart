import 'package:benskin_impact/features/contributions/presentation/contributions_screen.dart';
import 'package:benskin_impact/features/draws/presentation/draws_screen.dart';
import 'package:benskin_impact/features/projects/presentation/projects_screen.dart';
import 'package:benskin_impact/features/training/presentation/training_screen.dart';
import 'package:benskin_impact/features/wallet/presentation/recharge_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  testWidgets('RechargeScreen renders preset amounts and payment providers', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: RechargeScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Recharger mon compte'), findsOneWidget);
    expect(find.text('Montants rapides'), findsOneWidget);

    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();

    expect(find.text('MTN Mobile Money'), findsOneWidget);
    expect(find.text('Orange Money'), findsOneWidget);
  });

  testWidgets('ContributionsScreen renders 200 FCFA daily contribution', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: ContributionsScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Ma contribution'), findsOneWidget);
    expect(find.text('200'), findsOneWidget);
    expect(find.text('FCFA / jour'), findsOneWidget);
    expect(find.text('Prélèvement automatique'), findsOneWidget);
  });

  testWidgets('DrawsScreen renders daily selection and audit proof', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: DrawsScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sélection quotidienne'), findsOneWidget);
    expect(find.text('10 / 10'), findsOneWidget);
    expect(find.text('Commencer mon parcours'), findsOneWidget);
    expect(find.text('Voir la preuve du tirage'), findsOneWidget);
  });

  testWidgets('TrainingScreen renders 6 months modules and completion rate', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: TrainingScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Formation & Parcours'), findsOneWidget);
    expect(find.text('68%'), findsOneWidget);
    expect(find.text('Mois 1 : Entrepreneuriat'), findsWidgets);

    await tester.drag(find.byType(ListView).first, const Offset(0, -300));
    await tester.pumpAndSettle();

    expect(find.text('Mois 4 : Finance & Trésorerie'), findsWidgets);
  });

  testWidgets('ProjectsScreen renders project list and new project CTA', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: ProjectsScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Projets'), findsOneWidget);
    expect(find.text('Nouveau projet'), findsOneWidget);
    expect(find.text('Atelier mécanique et pièces motos'), findsOneWidget);
  });
}
