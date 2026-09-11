import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/json.dart';
import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';
import '../../../core/sync/sync_queue.dart';
import '../domain/project_models.dart';

/// Projets du membre. Création et enregistrement du brouillon passent par la file de synchronisation (écrans).
class ProjectsRepository {
  ProjectsRepository({required this.client});
  final ApiClient client;

  Future<List<ProjectSummary>> projects() =>
      client.call((dio) => dio.get('/projects'), (json) => listOf((json as Map<String, dynamic>)['items'], ProjectSummary.fromJson));

  Future<ProjectDetail> project(String id) =>
      client.call((dio) => dio.get('/projects/$id'), (json) => ProjectDetail.fromJson(json as Map<String, dynamic>));

  Future<ProjectDetail> submit(String id) =>
      client.call((dio) => dio.post('/projects/$id/submit'), (json) => ProjectDetail.fromJson(json as Map<String, dynamic>));

  Future<ProjectDetail> uploadDocument({required String projectId, required String type, required Uint8List bytes, required String filename}) {
    return client.call(
      (dio) => dio.post(
        '/projects/$projectId/documents',
        data: FormData.fromMap({'type': type, 'file': MultipartFile.fromBytes(bytes, filename: filename)}),
        options: Options(receiveTimeout: const Duration(seconds: 60)),
      ),
      (json) => ProjectDetail.fromJson(json as Map<String, dynamic>),
    );
  }
}

final projectsRepositoryProvider = Provider<ProjectsRepository>((ref) => ProjectsRepository(client: ref.watch(apiClientProvider)));

final projectsListProvider = FutureProvider.autoDispose<List<ProjectSummary>>((ref) {
  ref.watch(syncRevisionProvider('project'));
  return ref.watch(projectsRepositoryProvider).projects();
});

final projectDetailProvider = FutureProvider.autoDispose.family<ProjectDetail, String>((ref, id) {
  ref.watch(syncRevisionProvider('project'));
  return ref.watch(projectsRepositoryProvider).project(id);
});
