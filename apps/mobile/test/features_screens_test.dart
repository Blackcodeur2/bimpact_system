import 'package:benskin_impact/core/data/money.dart';
import 'package:benskin_impact/features/contributions/application/contributions_providers.dart';
import 'package:benskin_impact/features/contributions/domain/contribution_models.dart';
import 'package:benskin_impact/features/contributions/presentation/contributions_screen.dart';
import 'package:benskin_impact/features/payments/application/payments_providers.dart';
import 'package:benskin_impact/features/payments/domain/payment_models.dart';
import 'package:benskin_impact/features/draws/presentation/draws_screen.dart';
import 'package:benskin_impact/features/projects/presentation/projects_screen.dart';
import 'package:benskin_impact/features/training/presentation/training_screen.dart';
import 'package:benskin_impact/features/wallet/presentation/recharge_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

const _sandboxMethods = PaymentMethods(
  provider: 'sandbox',
  testMode: true,
  channels: [
    PaymentChannelInfo(code: 'MTN_MOMO', label: 'MTN Mobile Money'),
    PaymentChannelInfo(code: 'ORANGE_MONEY', label: 'Orange Money'),
  ],
  minAmount: Money(amount: '500', currency: 'XAF'),
  maxAmount: Money(amount: '500000', currency: 'XAF'),
  dailyLimit: Money(amount: '1000000', currency: 'XAF'),
  fee: Money(amount: '0', currency: 'XAF'),
);

final _contributionOverview = ContributionOverview(
  eligible: true,
  ineligibilityReasons: const [],
  dailyAmount: const Money(amount: '200', currency: 'XAF'),
  plan: const ContributionPlan(status: 'ACTIVE', autoDebit: false, startedOn: '2026-09-01'),
  todayDate: '2026-09-10',
  todayStatus: 'DUE',
  streak: 3,
  monthPaidDays: 7,
  monthExpectedDays: 10,
  monthTotal: const Money(amount: '1400', currency: 'XAF'),
  totalPaid: const Money(amount: '1400', currency: 'XAF'),
  calendar: [
    for (var day = 1; day <= 10; day++)
      ContributionDay(date: '2026-09-${day.toString().padLeft(2, '0')}', status: day == 10 ? 'DUE' : 'PAID'),
  ],
  payableDates: const ['2026-09-10'],
  nextDueDate: '2026-09-10',
  autoDebitHour: 7,
  recent: [
    ContributionItem(
      id: 'c1',
      date: '2026-09-09',
      amount: const Money(amount: '200', currency: 'XAF'),
      source: 'MANUAL',
      paidAt: DateTime(2026, 9, 9, 7, 15),
    ),
  ],
);

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  testWidgets('RechargeScreen renders preset amounts and payment providers', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [paymentMethodsProvider.overrideWith((ref) async => _sandboxMethods)],
        child: const MaterialApp(
          home: RechargeScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Recharger mon compte'), findsOneWidget);
    expect(find.textContaining('Mode test'), findsOneWidget);
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
      ProviderScope(
        overrides: [contributionOverviewProvider.overrideWith((ref) async => _contributionOverview)],
        child: const MaterialApp(
          home: ContributionsScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Ma contribution'), findsOneWidget);
    expect(find.text('200'), findsOneWidget);
    expect(find.text('FCFA / jour'), findsOneWidget);
    expect(find.textContaining('Payer ma contribution du jour'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Prélèvement automatique'), 300, scrollable: find.byType(Scrollable).first);
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
