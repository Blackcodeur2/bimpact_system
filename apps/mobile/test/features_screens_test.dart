import 'package:benskin_impact/core/config/remote_config.dart';
import 'package:benskin_impact/core/data/loaded.dart';
import 'package:benskin_impact/core/data/money.dart';
import 'package:benskin_impact/core/providers.dart';
import 'package:benskin_impact/core/sync/sync_queue.dart';
import 'package:benskin_impact/features/accidents/application/accidents_providers.dart';
import 'package:benskin_impact/features/accidents/domain/accident_models.dart';
import 'package:benskin_impact/features/accidents/presentation/accidents_screen.dart';
import 'package:benskin_impact/features/contributions/application/contributions_providers.dart';
import 'package:benskin_impact/features/contributions/domain/contribution_models.dart';
import 'package:benskin_impact/features/contributions/presentation/contributions_screen.dart';
import 'package:benskin_impact/features/draws/draws_data.dart';
import 'package:benskin_impact/features/draws/presentation/draws_screen.dart';
import 'package:benskin_impact/features/payments/application/payments_providers.dart';
import 'package:benskin_impact/features/payments/domain/payment_models.dart';
import 'package:benskin_impact/features/profile/presentation/support_screen.dart';
import 'package:benskin_impact/features/projects/application/projects_providers.dart';
import 'package:benskin_impact/features/projects/domain/project_models.dart';
import 'package:benskin_impact/features/projects/presentation/projects_screen.dart';
import 'package:benskin_impact/features/support/support_data.dart';
import 'package:benskin_impact/features/training/application/training_providers.dart';
import 'package:benskin_impact/features/training/domain/training_models.dart';
import 'package:benskin_impact/features/training/presentation/training_screen.dart';
import 'package:benskin_impact/features/wallet/presentation/recharge_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

const _xaf = 'XAF';

const _sandboxMethods = PaymentMethods(
  provider: 'sandbox',
  testMode: true,
  channels: [
    PaymentChannelInfo(code: 'MTN_MOMO', label: 'MTN Mobile Money'),
    PaymentChannelInfo(code: 'ORANGE_MONEY', label: 'Orange Money'),
  ],
  minAmount: Money(amount: '500', currency: _xaf),
  maxAmount: Money(amount: '500000', currency: _xaf),
  dailyLimit: Money(amount: '1000000', currency: _xaf),
  fee: Money(amount: '0', currency: _xaf),
);

final _contributionOverview = ContributionOverview(
  eligible: true,
  ineligibilityReasons: const [],
  dailyAmount: const Money(amount: '200', currency: _xaf),
  plan: const ContributionPlan(status: 'ACTIVE', autoDebit: false, startedOn: '2026-09-01'),
  todayDate: '2026-09-10',
  todayStatus: 'DUE',
  streak: 3,
  monthPaidDays: 7,
  monthExpectedDays: 10,
  monthTotal: const Money(amount: '1400', currency: _xaf),
  totalPaid: const Money(amount: '1400', currency: _xaf),
  calendar: [
    for (var day = 1; day <= 10; day++) ContributionDay(date: '2026-09-${day.toString().padLeft(2, '0')}', status: day == 10 ? 'DUE' : 'PAID'),
  ],
  payableDates: const ['2026-09-10'],
  nextDueDate: '2026-09-10',
  autoDebitHour: 7,
  recent: [
    ContributionItem(id: 'c1', date: '2026-09-09', amount: const Money(amount: '200', currency: _xaf), source: 'MANUAL', paidAt: DateTime(2026, 9, 9, 7, 15)),
  ],
);

/// File de synchronisation vide et réseau disponible : les bandeaux de synchronisation restent masqués.
final _syncOverrides = [
  pendingActionStoreProvider.overrideWithValue(MemoryPendingActionStore()),
  connectivityProvider.overrideWith((ref) => Stream.value(true)),
];

Future<void> _pump(WidgetTester tester, Widget screen, List<Override> overrides) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(ProviderScope(overrides: [..._syncOverrides, ...overrides], child: MaterialApp(home: screen)));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  testWidgets('RechargeScreen affiche les montants rapides et les moyens de paiement', (tester) async {
    await _pump(tester, const RechargeScreen(), [paymentMethodsProvider.overrideWith((ref) async => _sandboxMethods)]);

    expect(find.text('Recharger mon compte'), findsOneWidget);
    expect(find.textContaining('Mode test'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    expect(find.text('MTN Mobile Money'), findsOneWidget);
    expect(find.text('Orange Money'), findsOneWidget);
  });

  testWidgets('ContributionsScreen affiche la contribution quotidienne', (tester) async {
    await _pump(tester, const ContributionsScreen(), [contributionOverviewProvider.overrideWith((ref) async => _contributionOverview)]);

    expect(find.text('Ma contribution'), findsOneWidget);
    expect(find.text('200'), findsOneWidget);
    expect(find.textContaining('Payer ma contribution du jour'), findsOneWidget);
  });

  testWidgets('DrawsScreen affiche le prochain tirage et l’éligibilité renvoyés par l’API', (tester) async {
    final next = NextDraw(
      draw: DrawInfo(
        id: 'd1',
        code: 'TIRAGE-1',
        title: 'Tirage d’octobre',
        status: 'DRAFT',
        scheduledAt: DateTime.now().add(const Duration(days: 3)),
        winnerCount: 2,
        minPaidDays: 20,
        windowDays: 30,
      ),
      eligibility: const DrawEligibility(eligible: false, paidDays: 3, requiredDays: 20, windowDays: 30, reasons: ['NOT_ENOUGH_CONTRIBUTIONS']),
    );
    await _pump(tester, const DrawsScreen(), [
      nextDrawProvider.overrideWith((ref) async => next),
      publishedDrawsProvider.overrideWith((ref) async => const <DrawInfo>[]),
    ]);

    expect(find.text('Tirage d’octobre'), findsOneWidget);
    expect(find.text('3 / 20 jours payés'), findsOneWidget);
    expect(find.text('Aucun résultat pour le moment'), findsOneWidget);
  });

  testWidgets('TrainingScreen affiche la progression réelle et verrouille les modules suivants', (tester) async {
    const overview = TrainingOverview(
      summary: TrainingSummary(
        totalModules: 2,
        completedModules: 1,
        progressPercent: 67,
        certified: false,
        current: TrainingCurrent(moduleId: 'm2', month: 2, title: 'Étude de marché', quizReady: false, nextLessonId: 'l3', nextLessonTitle: 'Identifier une opportunité'),
      ),
      modules: [
        TrainingModuleItem(id: 'm1', month: 1, title: 'Entrepreneuriat', description: '…', durationMinutes: 45, totalLessons: 2, completedLessons: 2, status: 'COMPLETED', hasQuiz: true, bestScore: 100),
        TrainingModuleItem(id: 'm2', month: 2, title: 'Étude de marché', description: '…', durationMinutes: 40, totalLessons: 1, completedLessons: 0, status: 'AVAILABLE', hasQuiz: true),
      ],
    );
    await _pump(tester, const TrainingScreen(), [trainingOverviewProvider.overrideWith((ref) async => overview)]);

    expect(find.text('1 sur 2 modules validés'), findsOneWidget);
    expect(find.text('67 %'), findsOneWidget);
    expect(find.textContaining('Continuer : Identifier une opportunité'), findsOneWidget);
    expect(find.text('Validé'), findsOneWidget);
  });

  testWidgets('ProjectsScreen liste les projets du membre avec leur statut', (tester) async {
    final projects = [
      ProjectSummary(
        id: 'p1',
        title: 'Atelier du soir',
        sector: 'Mécanique',
        city: 'Douala',
        status: 'CHANGES_REQUESTED',
        estimatedBudget: const Money(amount: '1000000', currency: _xaf),
        createdAt: DateTime(2026, 9, 1),
        updatedAt: DateTime(2026, 9, 10),
      ),
    ];
    await _pump(tester, const ProjectsScreen(), [projectsListProvider.overrideWith((ref) async => projects)]);

    expect(find.text('Atelier du soir'), findsOneWidget);
    expect(find.text('Corrections demandées'), findsOneWidget);
    expect(find.text('Nouveau projet'), findsOneWidget);
  });

  testWidgets('SupportScreen n’affiche aucun contact tant que l’équipe ne les a pas configurés', (tester) async {
    const config = RemoteConfig(
      minVersion: '1.0.0',
      latestVersion: '1.0.0',
      maintenanceEnabled: false,
      paymentsTestMode: true,
      solidarityCollections: false,
      dailyContribution: Money(amount: '200', currency: _xaf),
      support: SupportContacts(),
    );
    await _pump(tester, const SupportScreen(), [
      remoteConfigProvider.overrideWith((ref) async => const Loaded(config)),
      faqProvider.overrideWith((ref) async => const Loaded([FaqItem(question: 'J’ai oublié mon code PIN', answer: 'Touchez « Code PIN oublié ? ».')])),
      ticketsProvider.overrideWith((ref) async => const <SupportTicket>[]),
    ]);

    expect(find.text('Écrivez-nous'), findsOneWidget);
    expect(find.text('Aucune demande'), findsOneWidget);
    expect(find.text('J’ai oublié mon code PIN'), findsOneWidget);
    expect(find.textContaining('+237'), findsNothing);
  });

  testWidgets('AccidentsScreen présente l’adhésion comme volontaire et les collectes non activées', (tester) async {
    const status = SolidarityStatus(
      rules: SolidarityRules(
        collectionsEnabled: false,
        contributionPerClaim: Money(amount: '500', currency: _xaf),
        maxAssistance: Money(amount: '150000', currency: _xaf),
        waitingDays: 30,
        rulesVersion: '2026-09',
      ),
      rulesText: ['L’adhésion est volontaire.'],
      canJoin: true,
      covered: false,
      reasons: ['NOT_MEMBER'],
      fundBalance: Money(amount: '0', currency: _xaf),
      activeMembers: 0,
    );
    await _pump(tester, const AccidentsScreen(), [
      solidarityStatusProvider.overrideWith((ref) async => status),
      accidentClaimsProvider.overrideWith((ref) async => const <AccidentSummary>[]),
    ]);

    expect(find.text('Fonds de solidarité volontaire'), findsOneWidget);
    expect(find.textContaining('collectes non activées'), findsOneWidget);
    expect(find.text('Aucune déclaration'), findsOneWidget);
    expect(find.text('Déclarer un accident'), findsOneWidget);
  });
}
