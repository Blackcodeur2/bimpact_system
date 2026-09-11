import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/json.dart';
import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';
import '../../../core/sync/sync_queue.dart';
import '../domain/training_models.dart';

/// Formation. La validation d'une leçon passe par la file de synchronisation (écran) ; le quiz exige le réseau
/// car la correction est faite par le serveur.
class TrainingRepository {
  TrainingRepository({required this.client});
  final ApiClient client;

  Future<TrainingOverview> overview() =>
      client.call((dio) => dio.get('/training/modules'), (json) => TrainingOverview.fromJson(json as Map<String, dynamic>));

  Future<ModuleDetail> module(String id) =>
      client.call((dio) => dio.get('/training/modules/$id'), (json) => ModuleDetail.fromJson(json as Map<String, dynamic>));

  Future<LessonDetail> lesson(String id) =>
      client.call((dio) => dio.get('/training/lessons/$id'), (json) => LessonDetail.fromJson(json as Map<String, dynamic>));

  /// Position de lecture, au mieux : une perte n'a aucune conséquence.
  Future<void> saveProgress(String lessonId, int percent) async {
    try {
      await client.call((dio) => dio.post('/training/lessons/$lessonId/progress', data: {'positionSeconds': 0, 'progressPercent': percent}), (_) {});
    } catch (_) {}
  }

  Future<QuizData> quiz(String moduleId) =>
      client.call((dio) => dio.get('/training/quiz/$moduleId'), (json) => QuizData.fromJson(json as Map<String, dynamic>));

  Future<QuizResult> submitQuiz(String moduleId, Map<String, int> answers) => client.call(
        (dio) => dio.post('/training/quiz/$moduleId/submit', data: {
          'answers': [for (final entry in answers.entries) {'questionId': entry.key, 'selectedIndex': entry.value}],
        }),
        (json) => QuizResult.fromJson(json as Map<String, dynamic>),
      );

  Future<List<CertificateItem>> certificates() =>
      client.call((dio) => dio.get('/certificates'), (json) => listOf((json as Map<String, dynamic>)['items'], CertificateItem.fromJson));
}

final trainingRepositoryProvider = Provider<TrainingRepository>((ref) => TrainingRepository(client: ref.watch(apiClientProvider)));

final trainingOverviewProvider = FutureProvider.autoDispose<TrainingOverview>((ref) {
  ref.watch(syncRevisionProvider('training'));
  return ref.watch(trainingRepositoryProvider).overview();
});

final moduleDetailProvider = FutureProvider.autoDispose.family<ModuleDetail, String>((ref, id) {
  ref.watch(syncRevisionProvider('training'));
  return ref.watch(trainingRepositoryProvider).module(id);
});

final lessonDetailProvider = FutureProvider.autoDispose.family<LessonDetail, String>((ref, id) {
  ref.watch(syncRevisionProvider('training'));
  return ref.watch(trainingRepositoryProvider).lesson(id);
});

final quizProvider = FutureProvider.autoDispose.family<QuizData, String>((ref, moduleId) => ref.watch(trainingRepositoryProvider).quiz(moduleId));

final certificatesProvider = FutureProvider.autoDispose<List<CertificateItem>>((ref) => ref.watch(trainingRepositoryProvider).certificates());
