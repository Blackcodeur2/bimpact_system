import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/auth/application/session_controller.dart';
import '../features/auth/data/auth_repository.dart';
import '../features/wallet/data/wallet_repository.dart';
import 'network/api_client.dart';
import 'storage/device_identity.dart';
import 'storage/local_cache.dart';
import 'storage/token_store.dart';
import 'sync/sync_queue.dart';

/// Initialisés dans main() avant runApp puis injectés par override.
final sharedPreferencesProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError());
final localCacheProvider = Provider<LocalCache>((ref) => throw UnimplementedError());
final pendingActionStoreProvider = Provider<PendingActionStore>((ref) => throw UnimplementedError());
final deviceIdentityProvider = Provider<DeviceIdentity>((ref) => throw UnimplementedError());

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    tokens: ref.watch(tokenStoreProvider),
    onSessionExpired: () => ref.read(sessionControllerProvider.notifier).onSessionExpired(),
  );
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    client: ref.watch(apiClientProvider),
    cache: ref.watch(localCacheProvider),
    device: ref.watch(deviceIdentityProvider),
  );
});

final walletRepositoryProvider = Provider<WalletRepository>((ref) {
  return WalletRepository(client: ref.watch(apiClientProvider), cache: ref.watch(localCacheProvider));
});

/// true si une interface réseau est disponible (ne garantit pas que l'API est joignable).
final connectivityProvider = StreamProvider<bool>((ref) async* {
  final connectivity = Connectivity();
  bool online(List<ConnectivityResult> results) => results.any((r) => r != ConnectivityResult.none);
  yield online(await connectivity.checkConnectivity());
  yield* connectivity.onConnectivityChanged.map(online);
});

/// Onboarding déjà vu sur cet appareil (mémorisé localement, sans appel API — cahier §7.2).
class OnboardingController extends Notifier<bool> {
  static const _key = 'onboarding.completed.v1';

  @override
  bool build() => ref.watch(sharedPreferencesProvider).getBool(_key) ?? false;

  Future<void> complete() async {
    await ref.read(sharedPreferencesProvider).setBool(_key, true);
    state = true;
  }
}

final onboardingDoneProvider = NotifierProvider<OnboardingController, bool>(OnboardingController.new);
