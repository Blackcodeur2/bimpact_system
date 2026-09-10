import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';
import '../domain/project_models.dart';

class ProjectsRepository {
  ProjectsRepository({required this.client});
  final ApiClient client;

  Future<List<ProjectItem>> listProjects() => client.call(
        (dio) => dio.get('/projects'),
        (json) => (json as List<dynamic>)
            .map((e) => ProjectItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Future<ProjectItem> getProject(String id) => client.call(
        (dio) => dio.get('/projects/$id'),
        (json) => ProjectItem.fromJson(json as Map<String, dynamic>),
      );

  Future<ProjectItem> createProject(Map<String, dynamic> data) => client.call(
        (dio) => dio.post('/projects', data: data),
        (json) => ProjectItem.fromJson(json as Map<String, dynamic>),
      );
}

final projectsRepositoryProvider = Provider<ProjectsRepository>(
  (ref) => ProjectsRepository(client: ref.watch(apiClientProvider)),
);

final projectsListProvider = FutureProvider.autoDispose<List<ProjectItem>>(
  (ref) => ref.watch(projectsRepositoryProvider).listProjects(),
);

final projectDetailProvider = FutureProvider.autoDispose.family<ProjectItem, String>(
  (ref, id) => ref.watch(projectsRepositoryProvider).getProject(id),
);
