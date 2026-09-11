import 'package:benskin_impact/core/config/remote_config.dart';
import 'package:benskin_impact/core/network/api_client.dart';
import 'package:benskin_impact/core/network/app_failure.dart';
import 'package:benskin_impact/core/providers.dart';
import 'package:benskin_impact/core/storage/token_store.dart';
import 'package:benskin_impact/core/sync/sync_queue.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _NoTokens extends TokenStore {
  @override
  Future<StoredTokens?> read() async => null;
}

/// Serveur simulé : hors ligne, ou réponse fixée par le test. Les requêtes reçues sont conservées.
class _FakeServer extends Interceptor {
  bool online = false;
  int status = 201;
  Map<String, dynamic> body = {'id': 'ticket-1'};
  final received = <RequestOptions>[];

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (!online) {
      handler.reject(DioException(requestOptions: options, type: DioExceptionType.connectionError, error: Exception('offline')));
      return;
    }
    received.add(options);
    final response = Response<dynamic>(requestOptions: options, statusCode: status, data: body);
    if (status >= 400) {
      handler.reject(DioException(requestOptions: options, response: response, type: DioExceptionType.badResponse));
    } else {
      handler.resolve(response);
    }
  }
}

void main() {
  group('retryDelay', () {
    test('double à chaque essai et plafonne à 30 minutes', () {
      expect(retryDelay(1), const Duration(seconds: 5));
      expect(retryDelay(2), const Duration(seconds: 10));
      expect(retryDelay(4), const Duration(seconds: 40));
      expect(retryDelay(30), const Duration(minutes: 30));
    });
  });

  group('compareVersions', () {
    test('compare numériquement et ignore le numéro de build', () {
      expect(compareVersions('1.0.0', '1.0.1'), lessThan(0));
      expect(compareVersions('1.10.0', '1.9.9'), greaterThan(0));
      expect(compareVersions('1.2.3+45', '1.2.3'), 0);
    });
  });

  group('SyncQueueController', () {
    late _FakeServer server;
    late ProviderContainer container;
    late MemoryPendingActionStore store;

    setUp(() {
      server = _FakeServer();
      store = MemoryPendingActionStore();
      final dio = Dio(BaseOptions(baseUrl: 'http://api.test/v1'))..interceptors.add(server);
      container = ProviderContainer(overrides: [
        apiClientProvider.overrideWithValue(ApiClient(tokens: _NoTokens(), onSessionExpired: () async {}, dio: dio)),
        pendingActionStoreProvider.overrideWithValue(store),
        connectivityProvider.overrideWith((ref) => Stream.value(false)),
      ]);
    });

    tearDown(() => container.dispose());

    Future<SubmitOutcome> submitTicket() => container.read(syncQueueProvider.notifier).submit(
          kind: 'support',
          label: 'Demande au support',
          method: 'POST',
          path: '/support/tickets',
          body: {'subject': 'Rechargement'},
        );

    test('hors ligne, conserve l’action puis l’envoie avec la même clé d’idempotence', () async {
      final outcome = await submitTicket();
      expect(outcome, isA<SubmitQueued>());
      final queued = (outcome as SubmitQueued).action;
      expect(container.read(syncQueueProvider).pendingCount, 1);
      expect(await store.all(), hasLength(1));

      server.online = true;
      await container.read(syncQueueProvider.notifier).retry(queued.id);

      expect(server.received, hasLength(1));
      expect(server.received.single.headers['Idempotency-Key'], queued.idempotencyKey);
      expect(container.read(syncQueueProvider).actions, isEmpty);
      expect(await store.all(), isEmpty);
      expect(container.read(syncRevisionProvider('support')), 1);
    });

    test('en ligne, envoie immédiatement sans rien conserver', () async {
      server.online = true;
      final outcome = await submitTicket();
      expect(outcome, isA<SubmitSent>());
      expect((outcome as SubmitSent).response, {'id': 'ticket-1'});
      expect(await store.all(), isEmpty);
    });

    test('une erreur métier à l’envoi immédiat est remontée à l’écran, jamais mise en file', () async {
      server
        ..online = true
        ..status = 422
        ..body = {'code': 'VALIDATION_FAILED', 'message': 'Certaines informations sont invalides.'};
      await expectLater(submitTicket(), throwsA(isA<ApiFailure>()));
      expect(await store.all(), isEmpty);
    });

    test('marque en échec une action refusée lors de la synchronisation, et considère une candidature déjà reçue comme faite', () async {
      final ticket = (await submitTicket()) as SubmitQueued;
      final application = (await container.read(syncQueueProvider.notifier).submit(
        kind: 'jobs',
        label: 'Candidature',
        method: 'POST',
        path: '/jobs/j1/apply',
      )) as SubmitQueued;

      server
        ..online = true
        ..status = 409
        ..body = {'code': 'ALREADY_APPLIED', 'message': 'Vous avez déjà postulé.'};
      await container.read(syncQueueProvider.notifier).retry(application.action.id);
      expect(container.read(syncQueueProvider).actions.map((a) => a.id), [ticket.action.id]);

      server
        ..status = 409
        ..body = {'code': 'SUPPORT_TICKET_CLOSED', 'message': 'Cette demande est clôturée.'};
      await container.read(syncQueueProvider.notifier).retry(ticket.action.id);
      final failed = container.read(syncQueueProvider).actions.single;
      expect(failed.status, PendingActionStatus.failed);
      expect(failed.lastError, 'Cette demande est clôturée.');

      await container.read(syncQueueProvider.notifier).discard(failed.id);
      expect(container.read(syncQueueProvider).actions, isEmpty);
    });
  });
}
