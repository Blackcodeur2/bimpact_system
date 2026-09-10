import 'dart:async';

import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../storage/token_store.dart';
import 'app_failure.dart';

/// Client HTTP : ajoute le jeton, rafraîchit la session une seule fois en cas d'expiration
/// (les requêtes concurrentes attendent le même rafraîchissement), puis rejoue la requête.
class ApiClient {
  ApiClient({required this.tokens, required this.onSessionExpired, Dio? dio, Dio? refreshDio})
      : dio = dio ?? Dio(_options()),
        _refreshDio = refreshDio ?? Dio(_options()) {
    this.dio.interceptors.add(
          QueuedInterceptorsWrapper(onRequest: _attachToken, onError: _handleError),
        );
  }

  final Dio dio;
  final Dio _refreshDio;
  final TokenStore tokens;

  /// Appelé quand la session ne peut plus être renouvelée (révoquée, expirée, réutilisation détectée).
  final Future<void> Function() onSessionExpired;

  Future<StoredTokens?>? _refreshing;

  static BaseOptions _options() => BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: AppConfig.connectTimeout,
        receiveTimeout: AppConfig.receiveTimeout,
        contentType: Headers.jsonContentType,
        responseType: ResponseType.json,
      );

  static const _publicPaths = ['/auth/login', '/auth/register', '/auth/otp/', '/auth/refresh'];

  Future<void> _attachToken(RequestOptions options, RequestInterceptorHandler handler) async {
    final isPublic = _publicPaths.any(options.path.startsWith);
    if (!isPublic) {
      final stored = await tokens.read();
      if (stored != null) options.headers['Authorization'] = 'Bearer ${stored.accessToken}';
    }
    handler.next(options);
  }

  Future<void> _handleError(DioException error, ErrorInterceptorHandler handler) async {
    final response = error.response;
    final code = response?.data is Map ? (response!.data as Map)['code'] : null;
    final alreadyRetried = error.requestOptions.extra['retried'] == true;

    if (response?.statusCode == 401 && code == 'ACCESS_TOKEN_INVALID' && !alreadyRetried) {
      final renewed = await _refreshOnce();
      if (renewed != null) {
        final retry = error.requestOptions
          ..headers['Authorization'] = 'Bearer ${renewed.accessToken}'
          ..extra['retried'] = true;
        try {
          return handler.resolve(await dio.fetch(retry));
        } on DioException catch (retryError) {
          return handler.next(retryError);
        }
      }
    }

    if (response?.statusCode == 401 && (code == 'SESSION_REVOKED' || code == 'ACCESS_TOKEN_INVALID')) {
      await tokens.clear();
      await onSessionExpired();
    }
    handler.next(error);
  }

  Future<StoredTokens?> _refreshOnce() {
    return _refreshing ??= _refresh().whenComplete(() => _refreshing = null);
  }

  Future<StoredTokens?> _refresh() async {
    final current = await tokens.read();
    if (current == null) return null;
    try {
      final res = await _refreshDio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': current.refreshToken},
      );
      final renewed = StoredTokens(
        accessToken: res.data!['accessToken'] as String,
        refreshToken: res.data!['refreshToken'] as String,
      );
      await tokens.save(renewed);
      return renewed;
    } on DioException catch (error) {
      // Hors ligne : on garde la session pour réessayer plus tard.
      if (toAppFailure(error) is NetworkFailure) return null;
      await tokens.clear();
      await onSessionExpired();
      return null;
    }
  }

  /// Exécute un appel et convertit toute erreur en [AppFailure].
  Future<T> call<T>(Future<Response<dynamic>> Function(Dio dio) request, T Function(dynamic data) parse) async {
    try {
      final response = await request(dio);
      return parse(response.data);
    } catch (error) {
      throw toAppFailure(error);
    }
  }
}
