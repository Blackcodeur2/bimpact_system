import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/auth/application/session_controller.dart';
import '../providers.dart';
import 'app_lock.dart';
import 'biometric_auth_service.dart';
import 'biometric_credential_store.dart';

class BiometricState {
  const BiometricState({
    this.deviceSupported = false,
    this.hasFingerprint = false,
    this.isEnrolled = false,
    this.enrolledPhone,
    this.enrolledFirstName,
    this.isAuthenticating = false,
    this.lastError,
  });

  final bool deviceSupported;
  final bool hasFingerprint;
  final bool isEnrolled;
  final String? enrolledPhone;
  final String? enrolledFirstName;
  final bool isAuthenticating;
  final String? lastError;

  bool get isAvailable => deviceSupported && hasFingerprint;
  bool get canLoginWithBiometrics => isAvailable && isEnrolled && enrolledPhone != null;

  BiometricState copyWith({
    bool? deviceSupported,
    bool? hasFingerprint,
    bool? isEnrolled,
    String? enrolledPhone,
    String? enrolledFirstName,
    bool? isAuthenticating,
    String? lastError,
  }) {
    return BiometricState(
      deviceSupported: deviceSupported ?? this.deviceSupported,
      hasFingerprint: hasFingerprint ?? this.hasFingerprint,
      isEnrolled: isEnrolled ?? this.isEnrolled,
      enrolledPhone: enrolledPhone ?? this.enrolledPhone,
      enrolledFirstName: enrolledFirstName ?? this.enrolledFirstName,
      isAuthenticating: isAuthenticating ?? this.isAuthenticating,
      lastError: lastError,
    );
  }
}

class BiometricController extends StateNotifier<BiometricState> {
  BiometricController(this.ref) : super(const BiometricState()) {
    refresh();
  }

  final Ref ref;

  BiometricAuthService get _authService => ref.read(biometricAuthServiceProvider);
  BiometricCredentialStore get _credentialStore => ref.read(biometricCredentialStoreProvider);

  /// Vérifie la disponibilité du matériel et l'enrôlement actuel.
  Future<void> refresh() async {
    final available = await _authService.isAvailable();
    final hasFingerprint = available && await _authService.hasFingerprint();
    final isEnrolled = await _credentialStore.isEnrolled();
    final phone = isEnrolled ? await _credentialStore.getPhone() : null;
    final name = isEnrolled ? await _credentialStore.getFirstName() : null;

    state = state.copyWith(
      deviceSupported: available,
      hasFingerprint: hasFingerprint,
      isEnrolled: isEnrolled,
      enrolledPhone: phone,
      enrolledFirstName: name,
    );
  }

  /// Active la connexion par empreinte digitale pour l'utilisateur connecté.
  Future<bool> enroll({
    required String phone,
    required String pin,
    required String firstName,
  }) async {
    if (!state.isAvailable) return false;

    state = state.copyWith(isAuthenticating: true, lastError: null);
    try {
      final confirmed = await _authService.authenticate(
        reason: 'Confirmez votre empreinte pour activer la connexion biométrique',
        title: 'Activer la connexion par empreinte',
        hint: 'Scannez votre empreinte digitale',
      );

      if (!confirmed) {
        state = state.copyWith(isAuthenticating: false);
        return false;
      }

      await _credentialStore.save(
        phone: phone,
        pin: pin,
        firstName: firstName,
      );
      // Synchronise également le verrouillage d'application au premier plan
      await ref.read(biometricPreferenceProvider.notifier).set(true);

      state = state.copyWith(
        isEnrolled: true,
        enrolledPhone: phone,
        enrolledFirstName: firstName,
        isAuthenticating: false,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isAuthenticating: false,
        lastError: 'Erreur lors de l’activation de la biométrie : $e',
      );
      return false;
    }
  }

  /// Désactive la connexion biométrique et efface les identifiants stockés.
  Future<void> disable() async {
    await _credentialStore.clear();
    await ref.read(biometricPreferenceProvider.notifier).set(false);
    state = state.copyWith(
      isEnrolled: false,
      enrolledPhone: null,
      enrolledFirstName: null,
    );
  }

  /// Déclenche la connexion par empreinte digitale depuis l'écran de Login.
  Future<bool> loginWithBiometrics() async {
    if (!state.canLoginWithBiometrics) return false;

    state = state.copyWith(isAuthenticating: true, lastError: null);
    try {
      final authenticated = await _authService.authenticate(
        reason: 'Scannez votre empreinte digitale pour vous connecter à BENSKIN IMPACT',
        title: 'Connexion BENSKIN IMPACT',
        hint: 'Touchez le capteur d’empreinte',
      );

      if (!authenticated) {
        state = state.copyWith(isAuthenticating: false);
        return false;
      }

      final phone = await _credentialStore.getPhone();
      final pin = await _credentialStore.getPin();

      if (phone == null || pin == null) {
        state = state.copyWith(
          isAuthenticating: false,
          lastError: 'Identifiants biométriques introuvables. Entrez votre code PIN.',
        );
        return false;
      }

      final result = await ref.read(authRepositoryProvider).login(phone: phone, pin: pin);
      await ref.read(sessionControllerProvider.notifier).signIn(result);

      state = state.copyWith(isAuthenticating: false);
      return true;
    } catch (e) {
      state = state.copyWith(
        isAuthenticating: false,
        lastError: 'Échec de la connexion biométrique. Veuillez utiliser votre code PIN.',
      );
      return false;
    }
  }
}

final biometricControllerProvider = StateNotifierProvider<BiometricController, BiometricState>((ref) {
  return BiometricController(ref);
});
