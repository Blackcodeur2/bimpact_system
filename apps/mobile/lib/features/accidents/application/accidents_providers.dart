import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/json.dart';
import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';
import '../../../core/sync/sync_queue.dart';
import '../domain/accident_models.dart';

/// Accidents (déclaration, justificatifs, suivi) et adhésion volontaire au fonds de solidarité.
/// La déclaration et les messages passent par la file de synchronisation (voir les écrans).
class AccidentsRepository {
  AccidentsRepository({required this.client});
  final ApiClient client;

  Future<SolidarityStatus> solidarity() =>
      client.call((dio) => dio.get('/solidarity/me'), (json) => SolidarityStatus.fromJson(json as Map<String, dynamic>));

  Future<SolidarityStatus> join(String rulesVersion) => client.call(
        (dio) => dio.post('/solidarity/join', data: {'rulesVersion': rulesVersion}),
        (json) => SolidarityStatus.fromJson(json as Map<String, dynamic>),
      );

  Future<SolidarityStatus> leave() =>
      client.call((dio) => dio.post('/solidarity/leave'), (json) => SolidarityStatus.fromJson(json as Map<String, dynamic>));

  Future<List<AccidentSummary>> claims() =>
      client.call((dio) => dio.get('/accidents'), (json) => listOf((json as Map<String, dynamic>)['items'], AccidentSummary.fromJson));

  Future<AccidentDetail> claim(String id) =>
      client.call((dio) => dio.get('/accidents/$id'), (json) => AccidentDetail.fromJson(json as Map<String, dynamic>));

  Future<AccidentDetail> uploadDocument({required String claimId, required String type, required Uint8List bytes, required String filename}) {
    return client.call(
      (dio) => dio.post(
        '/accidents/$claimId/documents',
        data: FormData.fromMap({'type': type, 'file': MultipartFile.fromBytes(bytes, filename: filename)}),
        options: Options(receiveTimeout: const Duration(seconds: 60)),
      ),
      (json) => AccidentDetail.fromJson(json as Map<String, dynamic>),
    );
  }
}

final accidentsRepositoryProvider = Provider<AccidentsRepository>((ref) => AccidentsRepository(client: ref.watch(apiClientProvider)));

final solidarityStatusProvider = FutureProvider.autoDispose<SolidarityStatus>((ref) => ref.watch(accidentsRepositoryProvider).solidarity());

final accidentClaimsProvider = FutureProvider.autoDispose<List<AccidentSummary>>((ref) {
  ref.watch(syncRevisionProvider('accident'));
  return ref.watch(accidentsRepositoryProvider).claims();
});

final accidentClaimDetailProvider = FutureProvider.autoDispose.family<AccidentDetail, String>((ref, id) {
  ref.watch(syncRevisionProvider('accident'));
  return ref.watch(accidentsRepositoryProvider).claim(id);
});
