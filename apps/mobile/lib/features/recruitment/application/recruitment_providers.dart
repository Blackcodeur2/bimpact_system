import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';
import '../domain/job_models.dart';

class RecruitmentRepository {
  RecruitmentRepository({required this.client});
  final ApiClient client;

  Future<List<JobOfferItem>> listOffers() => client.call(
        (dio) => dio.get('/jobs'),
        (json) => (json as List<dynamic>)
            .map((e) => JobOfferItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Future<void> apply(String offerId, String? message) => client.call(
        (dio) => dio.post('/jobs/$offerId/apply', data: {'message': message}),
        (_) {},
      );
}

final recruitmentRepositoryProvider = Provider<RecruitmentRepository>(
  (ref) => RecruitmentRepository(client: ref.watch(apiClientProvider)),
);

final jobOffersProvider = FutureProvider.autoDispose<List<JobOfferItem>>(
  (ref) => ref.watch(recruitmentRepositoryProvider).listOffers(),
);
