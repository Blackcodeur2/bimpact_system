import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class StoredTokens {
  const StoredTokens({required this.accessToken, required this.refreshToken});
  final String accessToken;
  final String refreshToken;
}

/// Jetons de session dans le stockage sécurisé du système (Keystore Android), jamais en clair.
class TokenStore {
  TokenStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _accessKey = 'auth.access_token';
  static const _refreshKey = 'auth.refresh_token';

  StoredTokens? _cache;
  bool _loaded = false;

  Future<StoredTokens?> read() async {
    if (_loaded) return _cache;
    final access = await _storage.read(key: _accessKey);
    final refresh = await _storage.read(key: _refreshKey);
    _cache = access != null && refresh != null ? StoredTokens(accessToken: access, refreshToken: refresh) : null;
    _loaded = true;
    return _cache;
  }

  Future<void> save(StoredTokens tokens) async {
    await _storage.write(key: _accessKey, value: tokens.accessToken);
    await _storage.write(key: _refreshKey, value: tokens.refreshToken);
    _cache = tokens;
    _loaded = true;
  }

  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
    _cache = null;
    _loaded = true;
  }
}
