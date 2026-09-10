import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/accidents/presentation/accident_detail_screen.dart';
import '../../features/accidents/presentation/accidents_screen.dart';
import '../../features/accidents/presentation/report_accident_screen.dart';
import '../../features/auth/application/session_controller.dart';
import '../../features/auth/domain/auth_models.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/otp_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
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
import '../../features/splash/splash_screen.dart';
import '../../features/training/presentation/certificate_screen.dart';
import '../../features/training/presentation/lesson_player_screen.dart';
import '../../features/training/presentation/quiz_screen.dart';
import '../../features/training/presentation/training_screen.dart';
import '../../features/wallet/presentation/recharge_screen.dart';
import '../../features/wallet/presentation/transactions_screen.dart';
import '../../features/wallet/presentation/wallet_screen.dart';
import '../providers.dart';

abstract final class Routes {
  static const splash = '/splash';
  static const onboarding = '/onboarding';
  static const login = '/auth/login';
  static const register = '/auth/register';
  static const otp = '/auth/otp';
  static const home = '/home';
  static const wallet = '/wallet';
  static const recharge = '/wallet/recharge';
  static const transactions = '/wallet/transactions';
  static const contributions = '/contributions';
  static const draws = '/draws';
  static const training = '/training';
  static const projects = '/projects';
  static const accidents = '/accidents';
  static const recruitment = '/recruitment';
  static const profile = '/profile';
  static const security = '/profile/security';
  static const support = '/profile/support';
  static const notifications = '/notifications';
  static String payment(String id) => '/wallet/payments/$id';
  static String draw(String id) => '/draws/$id';
  static const program = '/program';
  static const kyc = '/kyc';
  static const kycIdentity = '/kyc/identity';
  static const kycLocation = '/kyc/location';
  static const kycVehicle = '/kyc/vehicle';
  static const kycDocuments = '/kyc/documents';
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref
    ..listen(sessionControllerProvider, (_, _) => refresh.value++)
    ..listen(onboardingDoneProvider, (_, _) => refresh.value++)
    ..onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      final location = state.matchedLocation;
      final inEntryFlow = location.startsWith('/auth') || location == Routes.onboarding;

      return switch (ref.read(sessionControllerProvider)) {
        SessionRestoring() => location == Routes.splash ? null : Routes.splash,
        SignedOut() => inEntryFlow ? null : (ref.read(onboardingDoneProvider) ? Routes.login : Routes.onboarding),
        SignedIn() => inEntryFlow || location == Routes.splash ? Routes.home : null,
      };
    },
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(path: Routes.onboarding, builder: (_, _) => const OnboardingScreen()),
      GoRoute(path: Routes.login, builder: (_, _) => const LoginScreen()),
      GoRoute(path: Routes.register, builder: (_, _) => const RegisterScreen()),
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
        routes: [
          GoRoute(path: ':id', builder: (_, state) => DrawDetailScreen(drawId: state.pathParameters['id']!)),
        ],
      ),
      GoRoute(path: Routes.program, builder: (_, _) => const ProgramScreen()),
      GoRoute(
        path: Routes.training,
        builder: (_, _) => const TrainingScreen(),
        routes: [
          GoRoute(path: 'lesson/:id', builder: (_, state) => LessonPlayerScreen(lessonId: state.pathParameters['id']!)),
          GoRoute(path: 'quiz/:moduleId', builder: (_, state) => QuizScreen(moduleId: state.pathParameters['moduleId']!)),
          GoRoute(path: 'certificate', builder: (_, _) => const CertificateScreen()),
        ],
      ),
      GoRoute(
        path: Routes.projects,
        builder: (_, _) => const ProjectsScreen(),
        routes: [
          GoRoute(path: 'new', builder: (_, _) => const CreateProjectScreen()),
          GoRoute(path: ':id', builder: (_, state) => ProjectDetailScreen(projectId: state.pathParameters['id']!)),
        ],
      ),
      GoRoute(
        path: Routes.accidents,
        builder: (_, _) => const AccidentsScreen(),
        routes: [
          GoRoute(path: 'report', builder: (_, _) => const ReportAccidentScreen()),
          GoRoute(path: ':id', builder: (_, state) => AccidentDetailScreen(claimId: state.pathParameters['id']!)),
        ],
      ),
      GoRoute(path: Routes.recruitment, builder: (_, _) => const RecruitmentScreen()),
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
                GoRoute(
                  path: 'payments/:id',
                  builder: (_, state) => PaymentStatusScreen(intentId: state.pathParameters['id']!),
                ),
                GoRoute(path: 'transactions', builder: (_, _) => const TransactionsScreen()),
              ],
            ),
          ]),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.profile,
                builder: (_, _) => const ProfileScreen(),
                routes: [
                  GoRoute(path: 'security', builder: (_, _) => const SecuritySettingsScreen()),
                  GoRoute(path: 'support', builder: (_, _) => const SupportScreen()),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
