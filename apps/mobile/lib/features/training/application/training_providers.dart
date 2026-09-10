import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';
import '../domain/training_models.dart';

class TrainingRepository {
  TrainingRepository({required this.client});
  final ApiClient client;

  Future<List<TrainingModuleItem>> getModules() => client.call(
        (dio) => dio.get('/training/modules'),
        (json) => (json as List<dynamic>)
            .map((e) => TrainingModuleItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Future<Map<String, dynamic>> getModule(String id) => client.call(
        (dio) => dio.get('/training/modules/$id'),
        (json) => json as Map<String, dynamic>,
      );

  Future<LessonDetail> getLesson(String id) => client.call(
        (dio) => dio.get('/training/lessons/$id'),
        (json) => LessonDetail.fromJson(json as Map<String, dynamic>),
      );

  Future<void> completeLesson(String id) => client.call(
        (dio) => dio.post('/training/lessons/$id/complete'),
        (_) {},
      );

  Future<QuizData> getQuiz(String moduleId) => client.call(
        (dio) => dio.get('/training/quiz/$moduleId'),
        (json) => QuizData.fromJson(json as Map<String, dynamic>),
      );

  Future<Map<String, dynamic>> submitQuiz(String moduleId, List<Map<String, dynamic>> answers) => client.call(
        (dio) => dio.post('/training/quiz/$moduleId/submit', data: {'answers': answers}),
        (json) => json as Map<String, dynamic>,
      );

  Future<List<CertificateItem>> getCertificates() => client.call(
        (dio) => dio.get('/training/certificates'),
        (json) => (json as List<dynamic>)
            .map((e) => CertificateItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

final trainingRepositoryProvider = Provider<TrainingRepository>(
  (ref) => TrainingRepository(client: ref.watch(apiClientProvider)),
);

final trainingModulesProvider = FutureProvider.autoDispose<List<TrainingModuleItem>>(
  (ref) => ref.watch(trainingRepositoryProvider).getModules(),
);

final trainingModuleDetailProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
  (ref, id) => ref.watch(trainingRepositoryProvider).getModule(id),
);

final lessonDetailProvider = FutureProvider.autoDispose.family<LessonDetail, String>(
  (ref, id) => ref.watch(trainingRepositoryProvider).getLesson(id),
);

final certificatesProvider = FutureProvider.autoDispose<List<CertificateItem>>(
  (ref) => ref.watch(trainingRepositoryProvider).getCertificates(),
);
