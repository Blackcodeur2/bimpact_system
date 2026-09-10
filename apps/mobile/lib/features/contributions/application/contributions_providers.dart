import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';
import '../../wallet/application/wallet_providers.dart';
import '../domain/contribution_models.dart';

class ContributionsRepository {
  ContributionsRepository({required this.client});
  final ApiClient client;

  Future<ContributionOverview> overview() => client.call(
        (dio) => dio.get('/contributions'),
        (json) => ContributionOverview.fromJson(json as Map<String, dynamic>),
      );

  /// Paie un jour ; la même [idempotencyKey] lors d'un nouvel essai ne débite jamais deux fois.
  Future<ContributionOverview> pay({required String idempotencyKey, String? periodDate}) => client.call(
        (dio) => dio.post(
          '/contributions',
          data: {'periodDate': ?periodDate},
          options: Options(headers: {'Idempotency-Key': idempotencyKey}),
        ),
        (json) => ContributionOverview.fromJson((json as Map<String, dynamic>)['overview'] as Map<String, dynamic>),
      );

  Future<ContributionOverview> setAutoDebit(bool enabled) => client.call(
        (dio) => dio.patch('/contributions/settings', data: {'autoDebit': enabled}),
        (json) => ContributionOverview.fromJson(json as Map<String, dynamic>),
      );
}

final contributionsRepositoryProvider = Provider<ContributionsRepository>(
  (ref) => ContributionsRepository(client: ref.watch(apiClientProvider)),
);

final contributionOverviewProvider = FutureProvider.autoDispose<ContributionOverview>(
  (ref) => ref.watch(contributionsRepositoryProvider).overview(),
);

/// Après un paiement : solde, historique et tableau de bord sont relus depuis le serveur.
void refreshAfterContribution(WidgetRef ref) {
  ref
    ..invalidate(contributionOverviewProvider)
    ..invalidate(walletProvider)
    ..invalidate(dashboardProvider)
    ..invalidate(transactionsProvider);
}
