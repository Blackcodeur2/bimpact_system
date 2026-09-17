import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:local_auth_android/local_auth_android.dart';

/// Service d'authentification biométrique (empreinte digitale / reconnaissance faciale).
/// Conforme au cahier des charges (§7.4, §7.24) et aux recommandations OWASP MASVS.
class BiometricAuthService {
  BiometricAuthService([LocalAuthentication? auth]) : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  /// Vérifie si le matériel du téléphone prend en charge la biométrie
  /// et si au moins une empreinte digitale est configurée sur l'appareil.
  Future<bool> isAvailable() async {
    if (kIsWeb) return false;
    try {
      final isSupported = await _auth.isDeviceSupported();
      final canCheck = await _auth.canCheckBiometrics;
      return isSupported && canCheck;
    } catch (_) {
      return false;
    }
  }

  /// Vérifie spécifiquement si un capteur d'empreinte digitale est disponible.
  Future<bool> hasFingerprint() async {
    if (kIsWeb) return false;
    try {
      if (!await isAvailable()) return false;
      final available = await _auth.getAvailableBiometrics();
      return available.contains(BiometricType.fingerprint) ||
          available.contains(BiometricType.strong) ||
          available.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// Retourne la liste des types biométriques configurés sur l'appareil.
  Future<List<BiometricType>> getAvailableBiometrics() async {
    if (kIsWeb) return const [];
    try {
      return await _auth.getAvailableBiometrics();
    } catch (_) {
      return const [];
    }
  }

  /// Authentifie l'utilisateur via le capteur biométrique (empreinte digitale).
  ///
  /// Affiche la boîte de dialogue native Android avec des messages en français.
  Future<bool> authenticate({
    required String reason,
    String title = 'Authentification par empreinte',
    String? subtitle,
    String? hint = 'Touchez le capteur d’empreinte digitale',
    String cancelButton = 'Annuler',
    bool biometricOnly = true,
  }) async {
    if (kIsWeb) return false;
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        authMessages: [
          AndroidAuthMessages(
            signInTitle: title,
            signInHint: hint,
            cancelButton: cancelButton,
          ),
        ],
        biometricOnly: biometricOnly,
        persistAcrossBackgrounding: true,
      );
    } catch (_) {
      return false;
    }
  }
}

final biometricAuthServiceProvider = Provider<BiometricAuthService>((ref) => BiometricAuthService());
