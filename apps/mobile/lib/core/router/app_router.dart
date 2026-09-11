import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/accidents/presentation/accident_detail_screen.dart';
import '../../features/accidents/presentation/accidents_screen.dart';
import '../../features/accidents/presentation/report_accident_screen.dart';
import '../../features/accidents/presentation/solidarity_screen.dart';
import '../../features/auth/application/session_controller.dart';
import '../../features/auth/domain/auth_models.dart';
import '../../features/auth/presentation/lock_screen.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/otp_screen.dart';
import '../../features/auth/presentation/pin_reset_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/companies/companies_screens.dart';
import '../../features/contributions/presentation/contributions_screen.dart';
import '../../features/dashboard/presentation/home_screen.dart';
import '../../features/draws/presentation/draw_detail_screen.dart';
import '../../features/draws/presentation/draws_screen.dart';
import '../../features/draws/presentation/program_screen.dart';
import '../../features/kyc/presentation/kyc_documents_screen.dart';
import '../../features/kyc/presentation/kyc_screen.dart';
import '../../features/kyc/presentation/kyc_step_screens.dart';
import '../../features/notifications/notifications.dart';
import '../../features/onboarding/presentation/onboarding_screen.dart';
import '../../features/payments/presentation/payment_status_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/profile/presentation/security_settings_screen.dart';
import '../../features/profile/presentation/support_screen.dart';
import '../../features/projects/presentation/create_project_screen.dart';
import '../../features/projects/presentation/project_detail_screen.dart';
import '../../features/projects/presentation/projects_screen.dart';
import '../../features/recruitment/presentation/recruitment_screen.dart';
import '../../features/shell/main_shell.dart';
import '../../features/splash/gate_screens.dart';
import '../../features/splash/splash_screen.dart';
import '../../features/support/new_ticket_screen.dart';
import '../../features/support/ticket_detail_screen.dart';
import '../../features/training/presentation/certificate_screen.dart';
import '../../features/training/presentation/lesson_player_screen.dart';
import '../../features/training/presentation/module_screen.dart';
import '../../features/training/presentation/quiz_screen.dart';
import '../../features/training/presentation/training_screen.dart';
import '../../features/wallet/presentation/recharge_screen.dart';
import '../../features/wallet/presentation/transactions_screen.dart';
import '../../features/wallet/presentation/wallet_screen.dart';
import '../config/remote_config.dart';
import '../providers.dart';
import '../security/app_lock.dart';

abstract final class Routes {
  static const splash = '/splash';
  static const onboarding = '/onboarding';
  static const maintenance = '/maintenance';
  static const update = '/update';
  static const lock = '/lock';
  static const login = '/auth/login';
  static const register = '/auth/register';
  static const otp = '/auth/otp';
  static const pinReset = '/auth/pin-reset';
  static const home = '/home';
  static const wallet = '/wallet';
  static const recharge = '/wallet/recharge';
  static const transactions = '/wallet/transactions';
  static const contributions = '/contributions';
  static const draws = '/draws';
  static const program = '/program';
  static const training = '/training';
  static const certificate = '/training/certificate';
  static const projects = '/projects';
  static const companies = '/companies';
  static const recruitment = '/recruitment';
  static const accidents = '/accidents';
  static const solidarity = '/accidents/solidarity';
  static const profile = '/profile';
  static const security = '/profile/security';
  static const support = '/profile/support';
  static const notifications = '/notifications';
  static const kyc = '/kyc';
  static const kycIdentity = '/kyc/identity';
  static const kycLocation = '/kyc/location';
  static const kycVehicle = '/kyc/vehicle';
  static const kycDocuments = '/kyc/documents';
  static String payment(String id) => '/wallet/payments/$id';
  static String draw(String id) => '/draws/$id';
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  void bump(Object? _, Object? _) => refresh.value++;
  ref
    ..listen(sessionControllerProvider, bump)
    ..listen(onboardingDoneProvider, bump)
    ..listen(appGateProvider, bump)
    ..listen(appLockProvider, bump)
    ..onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      final location = state.matchedLocation;

      // Maintenance et version minimale passent avant tout le reste.
      final gate = ref.read(appGateProvider);
      if (gate is GateMaintenance) return location == Routes.maintenance ? null : Routes.maintenance;
      if (gate is GateUpdateRequired) return location == Routes.update ? null : Routes.update;
      if (location == Routes.maintenance || location == Routes.update) return Routes.splash;

      final inEntryFlow = location.startsWith('/auth') || location == Routes.onboarding;
      return switch (ref.read(sessionControllerProvider)) {
        SessionRestoring() => location == Routes.splash ? null : Routes.splash,
        SignedOut() => inEntryFlow ? null : (ref.read(onboardingDoneProvider) ? Routes.login : Routes.onboarding),
        SignedIn() when ref.read(appLockProvider) => location == Routes.lock ? null : Routes.lock,
        SignedIn() => inEntryFlow || location == Routes.splash || location == Routes.lock ? Routes.home : null,
      };
    },
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(path: Routes.maintenance, builder: (_, _) => const MaintenanceScreen()),
      GoRoute(path: Routes.update, builder: (_, _) => const UpdateRequiredScreen()),
      GoRoute(path: Routes.lock, builder: (_, _) => const LockScreen()),
      GoRoute(path: Routes.onboarding, builder: (_, _) => const OnboardingScreen()),
      GoRoute(path: Routes.login, builder: (_, _) => const LoginScreen()),
      GoRoute(path: Routes.register, builder: (_, _) => const RegisterScreen()),
      GoRoute(path: Routes.pinReset, builder: (_, _) => const PinResetScreen()),
      GoRoute(
        path: Routes.otp,
        builder: (_, state) {
          final pending = state.extra;
          return pending is PendingRegistration ? OtpScreen(pending: pending) : const RegisterScreen();
        },
      ),
      GoRoute(
        path: Routes.kyc,
        builder: (_, _) => const KycScreen(),
        routes: [
          GoRoute(path: 'identity', builder: (_, _) => const KycIdentityScreen()),
          GoRoute(path: 'location', builder: (_, _) => const KycLocationScreen()),
          GoRoute(path: 'vehicle', builder: (_, _) => const KycVehicleScreen()),
          GoRoute(path: 'documents', builder: (_, _) => const KycDocumentsScreen()),
        ],
      ),
      GoRoute(path: Routes.notifications, builder: (_, _) => const NotificationsScreen()),
      GoRoute(path: Routes.contributions, builder: (_, _) => const ContributionsScreen()),
      GoRoute(
        path: Routes.draws,
        builder: (_, _) => const DrawsScreen(),
        routes: [GoRoute(path: ':id', builder: (_, state) => DrawDetailScreen(drawId: state.pathParameters['id']!))],
      ),
      GoRoute(path: Routes.program, builder: (_, _) => const ProgramScreen()),
      GoRoute(
        path: Routes.training,
        builder: (_, _) => const TrainingScreen(),
        routes: [
          GoRoute(path: 'certificate', builder: (_, _) => const CertificateScreen()),
          GoRoute(path: 'module/:id', builder: (_, state) => ModuleScreen(moduleId: state.pathParameters['id']!)),
          GoRoute(path: 'lesson/:id', builder: (_, state) => LessonPlayerScreen(lessonId: state.pathParameters['id']!)),
          GoRoute(path: 'quiz/:moduleId', builder: (_, state) => QuizScreen(moduleId: state.pathParameters['moduleId']!)),
        ],
      ),
      GoRoute(
        path: Routes.projects,
        builder: (_, _) => const ProjectsScreen(),
        routes: [
          GoRoute(path: 'new', builder: (_, _) => const CreateProjectScreen()),
          GoRoute(
            path: ':id',
            builder: (_, state) => ProjectDetailScreen(projectId: state.pathParameters['id']!),
            routes: [GoRoute(path: 'edit', builder: (_, state) => EditProjectScreen(projectId: state.pathParameters['id']!))],
          ),
        ],
      ),
      GoRoute(
        path: Routes.companies,
        builder: (_, _) => const CompaniesScreen(),
        routes: [
          GoRoute(
            path: 'new',
            builder: (_, state) {
              final projectId = state.uri.queryParameters['projectId'];
              return projectId == null ? const CompaniesScreen() : CreateCompanyScreen(projectId: projectId);
            },
          ),
          GoRoute(
            path: ':id',
            builder: (_, state) => CompanyDetailScreen(companyId: state.pathParameters['id']!),
            routes: [
              GoRoute(path: 'jobs/new', builder: (_, state) => JobOfferFormScreen(companyId: state.pathParameters['id']!)),
              GoRoute(
                path: 'jobs/:jobId/applications',
                builder: (_, state) => JobApplicationsScreen(companyId: state.pathParameters['id']!, jobId: state.pathParameters['jobId']!),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: Routes.recruitment,
        builder: (_, state) => RecruitmentScreen(initialTab: state.uri.queryParameters['tab'] == 'applications' ? 1 : 0),
      ),
      GoRoute(
        path: Routes.accidents,
        builder: (_, _) => const AccidentsScreen(),
        routes: [
          GoRoute(path: 'report', builder: (_, _) => const ReportAccidentScreen()),
          GoRoute(path: 'solidarity', builder: (_, _) => const SolidarityScreen()),
          GoRoute(path: ':id', builder: (_, state) => AccidentDetailScreen(claimId: state.pathParameters['id']!)),
        ],
      ),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => MainShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: Routes.home, builder: (_, _) => const HomeScreen())]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: Routes.wallet,
              builder: (_, _) => const WalletScreen(),
              routes: [
                GoRoute(path: 'recharge', builder: (_, _) => const RechargeScreen()),
                GoRoute(path: 'payments/:id', builder: (_, state) => PaymentStatusScreen(intentId: state.pathParameters['id']!)),
                GoRoute(path: 'transactions', builder: (_, _) => const TransactionsScreen()),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: Routes.profile,
              builder: (_, _) => const ProfileScreen(),
              routes: [
                GoRoute(path: 'security', builder: (_, _) => const SecuritySettingsScreen()),
                GoRoute(
                  path: 'support',
                  builder: (_, _) => const SupportScreen(),
                  routes: [
                    GoRoute(path: 'new', builder: (_, _) => const NewTicketScreen()),
                    GoRoute(path: 'tickets/:id', builder: (_, state) => TicketDetailScreen(ticketId: state.pathParameters['id']!)),
                  ],
                ),
              ],
            ),
          ]),
        ],
      ),
    ],
  );
});
