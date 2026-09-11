import '../config/app_config.dart';

/// Les URLs signées des documents sont relatives à l'origine de l'API (« /v1/files/… »).
String resolveApiUrl(String path) => Uri.parse(AppConfig.apiBaseUrl).resolve(path).toString();
