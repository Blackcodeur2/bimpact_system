import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/session_controller.dart';
import '../../features/auth/domain/auth_models.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/otp_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/contributions/presentation/contributions_screen.dart';
import '../../features/dashboard/presentation/home_screen.dart';
import '../../features/draws/presentation/draws_screen.dart';
import '../../features/kyc/presentation/kyc_documents_screen.dart';
import '../../features/kyc/presentation/kyc_screen.dart';
import '../../features/kyc/presentation/kyc_step_screens.dart';
import '../../features/onboarding/presentation/onboarding_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/projects/presentation/projects_screen.dart';
import '../../features/shell/main_shell.dart';
import '../../features/splash/splash_screen.dart';
import '../../features/training/presentation/training_screen.dart';
import '../../features/wallet/presentation/recharge_screen.dart';
import '../../features/wallet/presentation/transactions_screen.dart';
import '../../features/wallet/presentation/wallet_screen.dart';
import '../providers.dart';
import '../widgets/module_preview.dart';

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
  static const profile = '/profile';
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
      // Modules sans backend : écran « bientôt disponible », ou maquette signalée si MODULE_PREVIEWS=true.
      GoRoute(
        path: Routes.contributions,
        builder: (_, _) => const ModulePreviewGate(
          title: 'Contribution',
          feature: 'Le suivi des contributions',
          preview: ContributionsScreen(),
        ),
      ),
      GoRoute(
        path: Routes.draws,
        builder: (_, _) => const ModulePreviewGate(
          title: 'Tirages',
          feature: 'Le tirage des bénéficiaires',
          preview: DrawsScreen(),
        ),
      ),
      GoRoute(
        path: Routes.training,
        builder: (_, _) => const ModulePreviewGate(
          title: 'Formation',
          feature: 'La formation entrepreneuriale',
          preview: TrainingScreen(),
        ),
      ),
      GoRoute(
        path: Routes.projects,
        builder: (_, _) => const ModulePreviewGate(
          title: 'Projets',
          feature: 'La gestion des projets',
          preview: ProjectsScreen(),
        ),
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
                GoRoute(
                  path: 'recharge',
                  builder: (_, _) => const ModulePreviewGate(
                    title: 'Recharger',
                    feature: 'Le rechargement par Mobile Money',
                    preview: RechargeScreen(),
                  ),
                ),
                GoRoute(path: 'transactions', builder: (_, _) => const TransactionsScreen()),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.profile, builder: (_, _) => const ProfileScreen())]),
        ],
      ),
    ],
  );
});
