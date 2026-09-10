import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/loaded.dart';
import '../../../core/providers.dart';
import '../../auth/application/session_controller.dart';
import '../../wallet/application/wallet_providers.dart';
import '../data/kyc_repository.dart';
import '../domain/kyc_models.dart';

final kycRepositoryProvider = Provider<KycRepository>(
  (ref) => KycRepository(client: ref.watch(apiClientProvider), cache: ref.watch(localCacheProvider)),
);

final kycDossierProvider = FutureProvider.autoDispose<Loaded<KycDossier>>(
  (ref) => ref.watch(kycRepositoryProvider).dossier(),
);

/// Après toute modification du dossier : dossier, tableau de bord et statut du profil sont actualisés.
Future<void> refreshAfterKycChange(WidgetRef ref) async {
  ref
    ..invalidate(kycDossierProvider)
    ..invalidate(dashboardProvider);
  await ref.read(sessionControllerProvider.notifier).reloadUser();
}
