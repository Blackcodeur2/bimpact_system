import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Coffre-fort sécurisé pour les identifiants biométriques.
/// Utilise le Keystore matériel (Android) / Keychain (iOS) via FlutterSecureStorage.
/// Les informations sensibles (code PIN, numéro) ne sont jamais stockées en clair.
class BiometricCredentialStore {
  BiometricCredentialStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _keyEnabled = 'biometric.enabled';
  static const _keyPhone = 'biometric.phone';
  static const _keyFirstName = 'biometric.first_name';
  static const _keyPin = 'biometric.pin';
  static const _keyEnrolledAt = 'biometric.enrolled_at';

  /// Enregistre les identifiants nécessaires à la connexion par empreinte.
  Future<void> save({
    required String phone,
    required String pin,
    required String firstName,
  }) async {
    await _storage.write(key: _keyPhone, value: phone);
    await _storage.write(key: _keyPin, value: pin);
    await _storage.write(key: _keyFirstName, value: firstName);
    await _storage.write(key: _keyEnabled, value: 'true');
    await _storage.write(key: _keyEnrolledAt, value: DateTime.now().toIso8601String());
  }

  /// Vérifie si un profil biométrique complet est actif sur cet appareil.
  Future<bool> isEnrolled() async {
    final enabled = await _storage.read(key: _keyEnabled);
    if (enabled != 'true') return false;
    final phone = await _storage.read(key: _keyPhone);
    final pin = await _storage.read(key: _keyPin);
    return phone != null && phone.isNotEmpty && pin != null && pin.isNotEmpty;
  }

  Future<String?> getPhone() => _storage.read(key: _keyPhone);

  Future<String?> getFirstName() => _storage.read(key: _keyFirstName);

  Future<String?> getPin() => _storage.read(key: _keyPin);

  /// Met à jour le code PIN stocké en cas de changement par l'utilisateur.
  Future<void> updatePin(String newPin) async {
    if (await isEnrolled()) {
      await _storage.write(key: _keyPin, value: newPin);
    }
  }

  /// Désactive et supprime définitivement les identifiants biométriques.
  Future<void> clear() async {
    await _storage.delete(key: _keyEnabled);
    await _storage.delete(key: _keyPhone);
    await _storage.delete(key: _keyFirstName);
    await _storage.delete(key: _keyPin);
    await _storage.delete(key: _keyEnrolledAt);
  }
}

final biometricCredentialStoreProvider = Provider<BiometricCredentialStore>((ref) => BiometricCredentialStore());
