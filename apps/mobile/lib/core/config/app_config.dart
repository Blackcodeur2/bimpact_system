import 'package:flutter/foundation.dart';

/// Configuration injectée à la compilation :
///   flutter run --dart-define=API_BASE_URL=https://api.benskinimpact.cm/v1
abstract final class AppConfig {
  static const _apiBaseUrl = String.fromEnvironment('API_BASE_URL');

  /// Par défaut : API locale (émulateur Android → 10.0.2.2 = machine hôte).
  static String get apiBaseUrl {
    if (_apiBaseUrl.isNotEmpty) return _apiBaseUrl;
    return kIsWeb ? 'http://localhost:3000/v1' : 'http://10.0.2.2:3000/v1';
  }

  static const connectTimeout = Duration(seconds: 15);
  static const receiveTimeout = Duration(seconds: 20);
}
