import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';

import '../providers.dart';

/// Empreinte ou reconnaissance faciale du téléphone (cahier §7.4, §7.24).
/// Elle déverrouille une session déjà ouverte ; le code PIN reste l'accès de référence.
class BiometricAuthenticator {
  BiometricAuthenticator([LocalAuthentication? auth]) : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  Future<bool> isAvailable() async {
    if (kIsWeb) return false;
    try {
      return await _auth.isDeviceSupported() && await _auth.canCheckBiometrics;
    } catch (_) {
      return false;
    }
  }

  Future<bool> authenticate(String reason) async {
    if (kIsWeb) return false;
    try {
      return await _auth.authenticate(localizedReason: reason, persistAcrossBackgrounding: true);
    } catch (_) {
      return false;
    }
  }
}

final biometricAuthenticatorProvider = Provider<BiometricAuthenticator>((ref) => BiometricAuthenticator());

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
