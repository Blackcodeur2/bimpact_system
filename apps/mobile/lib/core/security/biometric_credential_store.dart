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
  static const _keyIdentifier = 'biometric.identifier';
  static const _keyPassword = 'biometric.password';
  static const _keyPhone = 'biometric.phone';
  static const _keyFirstName = 'biometric.first_name';
  static const _keyPin = 'biometric.pin';
  static const _keyEnrolledAt = 'biometric.enrolled_at';

  /// Enregistre les identifiants nécessaires à la connexion par empreinte.
  Future<void> save({
    String? identifier,
    String? password,
    String? phone,
    String? pin,
    required String firstName,
  }) async {
    final effectiveId = identifier ?? phone ?? '';
    final effectivePassword = password ?? pin ?? '';
    await _storage.write(key: _keyIdentifier, value: effectiveId);
    await _storage.write(key: _keyPassword, value: effectivePassword);
    // Compatibilité rétroactive
    await _storage.write(key: _keyPhone, value: effectiveId);
    await _storage.write(key: _keyPin, value: effectivePassword);
    await _storage.write(key: _keyFirstName, value: firstName);
    await _storage.write(key: _keyEnabled, value: 'true');
    await _storage.write(key: _keyEnrolledAt, value: DateTime.now().toIso8601String());
  }

  /// Vérifie si un profil biométrique complet est actif sur cet appareil.
  Future<bool> isEnrolled() async {
    final enabled = await _storage.read(key: _keyEnabled);
    if (enabled != 'true') return false;
    final id = await getIdentifier();
    final pwd = await getPassword();
    return id != null && id.isNotEmpty && pwd != null && pwd.isNotEmpty;
  }

  Future<String?> getIdentifier() async {
    final id = await _storage.read(key: _keyIdentifier);
    if (id != null && id.isNotEmpty) return id;
    return _storage.read(key: _keyPhone);
  }

  Future<String?> getPassword() async {
    final pwd = await _storage.read(key: _keyPassword);
    if (pwd != null && pwd.isNotEmpty) return pwd;
    return _storage.read(key: _keyPin);
  }

  Future<String?> getPhone() => getIdentifier();

  Future<String?> getFirstName() => _storage.read(key: _keyFirstName);

  Future<String?> getPin() => getPassword();

  /// Met à jour le mot de passe stocké en cas de changement par l'utilisateur.
  Future<void> updatePassword(String newPassword) async {
    if (await isEnrolled()) {
      await _storage.write(key: _keyPassword, value: newPassword);
      await _storage.write(key: _keyPin, value: newPassword);
    }
  }

  /// Met à jour le code PIN stocké en cas de changement par l'utilisateur.
  Future<void> updatePin(String newPin) async {
    if (await isEnrolled()) {
      await _storage.write(key: _keyPin, value: newPin);
      await _storage.write(key: _keyPassword, value: newPin);
    }
  }

  /// Désactive et supprime définitivement les identifiants biométriques.
  Future<void> clear() async {
    await _storage.delete(key: _keyEnabled);
    await _storage.delete(key: _keyIdentifier);
    await _storage.delete(key: _keyPassword);
    await _storage.delete(key: _keyPhone);
    await _storage.delete(key: _keyFirstName);
    await _storage.delete(key: _keyPin);
    await _storage.delete(key: _keyEnrolledAt);
  }
}

final biometricCredentialStoreProvider = Provider<BiometricCredentialStore>((ref) => BiometricCredentialStore());
