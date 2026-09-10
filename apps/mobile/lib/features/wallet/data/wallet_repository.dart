import 'package:dio/dio.dart';

import '../../../core/data/cached_fetch.dart';
import '../../../core/data/loaded.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/local_cache.dart';
import '../../dashboard/domain/dashboard.dart';
import '../domain/wallet_models.dart';

/// Lecture du portefeuille. Le solde vient toujours du ledger serveur ; le cache ne sert qu'hors ligne.
class WalletRepository {
  WalletRepository({required this.client, required this.cache});

  final ApiClient client;
  final LocalCache cache;

  Future<Loaded<Dashboard>> dashboard() => fetchWithCache(
        client: client,
        cache: cache,
        key: 'dashboard',
        request: (dio) => dio.get('/me/dashboard'),
        parse: (json) => Dashboard.fromJson(json as Map<String, dynamic>),
      );

  Future<Loaded<Wallet>> wallet() => fetchWithCache(
        client: client,
        cache: cache,
        key: 'wallet',
        request: (dio) => dio.get('/wallet'),
        parse: (json) => Wallet.fromJson(json as Map<String, dynamic>),
      );

  /// Première page mise en cache pour l'affichage hors ligne ; les pages suivantes exigent le réseau.
  Future<Loaded<TransactionPage>> transactions({String? cursor, String? direction, int limit = 20}) {
    Future<Response<dynamic>> request(Dio dio) => dio.get(
          '/wallet/transactions',
          queryParameters: {'limit': limit, 'cursor': ?cursor, 'direction': ?direction},
        );
    TransactionPage parse(Object? json) => TransactionPage.fromJson(json as Map<String, dynamic>);

    if (cursor != null) {
      return client.call(request, (json) => Loaded(parse(json)));
    }
    return fetchWithCache(client: client, cache: cache, key: 'transactions:${direction ?? 'ALL'}', request: request, parse: parse);
  }
}
