import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/json.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/providers.dart';
import '../../../core/sync/sync_queue.dart';
import '../domain/job_models.dart';

/// Offres et candidatures. La candidature passe par la file de synchronisation (écran).
class RecruitmentRepository {
  RecruitmentRepository({required this.client});
  final ApiClient client;

  Future<PageResult<JobOfferItem>> offers({String query = '', String? cursor}) => client.call(
        (dio) => dio.get('/jobs', queryParameters: {'limit': 30, if (query.isNotEmpty) 'q': query, 'cursor': ?cursor}),
        (json) => PageResult.fromJson(json, JobOfferItem.fromJson),
      );

  Future<List<MyJobApplication>> myApplications() => client.call(
        (dio) => dio.get('/jobs/applications/me'),
        (json) => listOf((json as Map<String, dynamic>)['items'], MyJobApplication.fromJson),
      );

  Future<List<MyJobApplication>> withdraw(String applicationId) => client.call(
        (dio) => dio.post('/jobs/applications/$applicationId/withdraw'),
        (json) => listOf((json as Map<String, dynamic>)['items'], MyJobApplication.fromJson),
      );
}

final recruitmentRepositoryProvider = Provider<RecruitmentRepository>((ref) => RecruitmentRepository(client: ref.watch(apiClientProvider)));

/// Liste des offres pour une recherche donnée, paginée par curseur.
class JobOffersController extends AutoDisposeFamilyAsyncNotifier<JobOffersState, String> {
  @override
  Future<JobOffersState> build(String query) async {
    ref.watch(syncRevisionProvider('jobs'));
    return JobOffersState.fromPage(await ref.watch(recruitmentRepositoryProvider).offers(query: query));
  }

  Future<void> loadMore() async {
    final current = state.valueOrNull;
    if (current == null || current.nextCursor == null || current.loadingMore) return;
    state = AsyncData(current.copyWith(loadingMore: true));
    try {
      final page = await ref.read(recruitmentRepositoryProvider).offers(query: arg, cursor: current.nextCursor);
      state = AsyncData(current.copyWith(items: [...current.items, ...page.items], nextCursor: () => page.nextCursor, loadingMore: false));
    } on AppFailure {
      state = AsyncData(current.copyWith(loadingMore: false));
    }
  }
}

final jobOffersProvider = AsyncNotifierProvider.autoDispose.family<JobOffersController, JobOffersState, String>(JobOffersController.new);

final myApplicationsProvider = FutureProvider.autoDispose<List<MyJobApplication>>((ref) {
  ref.watch(syncRevisionProvider('jobs'));
  return ref.watch(recruitmentRepositoryProvider).myApplications();
});
