import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';
import '../domain/accident_models.dart';

class AccidentsRepository {
  AccidentsRepository({required this.client});
  final ApiClient client;

  Future<CoverageStatus> getCoverage() => client.call(
        (dio) => dio.get('/accidents/coverage'),
        (json) => CoverageStatus.fromJson(json as Map<String, dynamic>),
      );

  Future<List<AccidentClaimItem>> listClaims() => client.call(
        (dio) => dio.get('/accidents'),
        (json) => (json as List<dynamic>)
            .map((e) => AccidentClaimItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Future<AccidentClaimItem> getClaim(String id) => client.call(
        (dio) => dio.get('/accidents/$id'),
        (json) => AccidentClaimItem.fromJson(json as Map<String, dynamic>),
      );

  Future<AccidentClaimItem> reportAccident(Map<String, dynamic> data) => client.call(
        (dio) => dio.post('/accidents', data: data),
        (json) => AccidentClaimItem.fromJson(json as Map<String, dynamic>),
      );
}

final accidentsRepositoryProvider = Provider<AccidentsRepository>(
  (ref) => AccidentsRepository(client: ref.watch(apiClientProvider)),
);

final coverageStatusProvider = FutureProvider.autoDispose<CoverageStatus>(
  (ref) => ref.watch(accidentsRepositoryProvider).getCoverage(),
);

final accidentClaimsProvider = FutureProvider.autoDispose<List<AccidentClaimItem>>(
  (ref) => ref.watch(accidentsRepositoryProvider).listClaims(),
);

final accidentClaimDetailProvider = FutureProvider.autoDispose.family<AccidentClaimItem, String>(
  (ref, id) => ref.watch(accidentsRepositoryProvider).getClaim(id),
);
