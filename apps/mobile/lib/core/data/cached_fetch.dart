import 'package:dio/dio.dart';

import '../network/api_client.dart';
import '../network/app_failure.dart';
import '../storage/local_cache.dart';
import 'loaded.dart';

typedef ApiRequest = Future<Response<dynamic>> Function(Dio dio);

/// Lecture « réseau d'abord » : la réponse est mise en cache ; sans réseau, la dernière réponse
/// enregistrée est renvoyée avec sa date pour que l'écran l'indique clairement.
Future<Loaded<T>> fetchWithCache<T>({
  required ApiClient client,
  required LocalCache cache,
  required String key,
  required ApiRequest request,
  required T Function(Object? json) parse,
}) async {
  try {
    final json = await client.call<Object?>(request, (json) => json);
    await cache.write(key, json);
    return Loaded(parse(json));
  } on NetworkFailure {
    final cached = await cache.read(key);
    if (cached == null) rethrow;
    return Loaded(parse(cached.json), cachedAt: cached.updatedAt);
  }
}
