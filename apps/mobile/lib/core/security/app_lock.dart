import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import 'biometric_auth_service.dart';

/// Empreinte ou reconnaissance faciale du téléphone (cahier §7.4, §7.24).
/// Elle déverrouille une session déjà ouverte ; le code PIN reste l'accès de référence.
class BiometricAuthenticator {
  BiometricAuthenticator([BiometricAuthService? service])
      : _service = service ?? BiometricAuthService();

  final BiometricAuthService _service;

  Future<bool> isAvailable() => _service.isAvailable();

  Future<bool> authenticate(String reason) => _service.authenticate(
        reason: reason,
        title: 'Déverrouillage de l’application',
        hint: 'Scannez votre empreinte digitale',
      );
}

final biometricAuthenticatorProvider = Provider<BiometricAuthenticator>((ref) {
  return BiometricAuthenticator(ref.watch(biometricAuthServiceProvider));
});

/// Préférence propre à cet appareil ; effacée à la déconnexion.
class BiometricPreference extends Notifier<bool> {
  static const _key = 'security.biometric_unlock.v1';

  @override
  bool build() => ref.watch(sharedPreferencesProvider).getBool(_key) ?? false;

  Future<void> set(bool enabled) async {
    await ref.read(sharedPreferencesProvider).setBool(_key, enabled);
    state = enabled;
  }
}

final biometricPreferenceProvider = NotifierProvider<BiometricPreference, bool>(BiometricPreference.new);

/// `true` : l'application attend un déverrouillage avant d'afficher les données du membre.
class AppLockController extends Notifier<bool> {
  static const relockAfter = Duration(minutes: 2);
  DateTime? _backgroundedAt;

  @override
  bool build() => false;

  void lockIfEnabled() {
    if (ref.read(biometricPreferenceProvider)) state = true;
  }

  void onBackground() => _backgroundedAt ??= DateTime.now();

  void onForeground() {
    final since = _backgroundedAt;
    _backgroundedAt = null;
    if (since != null && DateTime.now().difference(since) >= relockAfter) lockIfEnabled();
  }

  void unlock() => state = false;
}

final appLockProvider = NotifierProvider<AppLockController, bool>(AppLockController.new);
