import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/data/cached_fetch.dart';
import '../../../core/data/loaded.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/local_cache.dart';
import '../domain/kyc_models.dart';

export '../../../core/network/api_url.dart' show resolveApiUrl;

/// Dossier KYC (cahier §7.5). Les règles (complétude, verrouillage, types de fichiers) sont appliquées par l'API.
class KycRepository {
  KycRepository({required this.client, required this.cache});

  final ApiClient client;
  final LocalCache cache;

  Future<Loaded<KycDossier>> dossier() => fetchWithCache(
        client: client,
        cache: cache,
        key: 'kyc',
        request: (dio) => dio.get('/kyc'),
        parse: (json) => KycDossier.fromJson(json as Map<String, dynamic>),
      );

  Future<KycDossier> update(Map<String, Object?> fields) => client.call(
        (dio) => dio.patch('/kyc', data: fields),
        (json) => KycDossier.fromJson(json as Map<String, dynamic>),
      );

  Future<KycDocument> upload({required String type, required Uint8List bytes, required String filename}) {
    return client.call(
      (dio) => dio.post(
        '/kyc/documents',
        data: FormData.fromMap({'type': type, 'file': MultipartFile.fromBytes(bytes, filename: filename)}),
        options: Options(receiveTimeout: const Duration(seconds: 60)),
      ),
      (json) => KycDocument.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<KycDossier> submit() => client.call(
        (dio) => dio.post('/kyc/submit'),
        (json) => KycDossier.fromJson(json as Map<String, dynamic>),
      );
}
