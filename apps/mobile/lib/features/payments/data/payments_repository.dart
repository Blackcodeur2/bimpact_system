import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/payment_models.dart';

class PaymentsRepository {
  PaymentsRepository({required this.client});

  final ApiClient client;

  Future<PaymentMethods> methods() => client.call(
        (dio) => dio.get('/payments/methods'),
        (json) => PaymentMethods.fromJson(json as Map<String, dynamic>),
      );

  /// Réutiliser la même [idempotencyKey] lors d'un nouvel essai garantit qu'aucun second débit n'est initié.
  Future<PaymentIntent> createIntent({
    required String amount,
    required String channel,
    required String idempotencyKey,
    String? payerPhone,
  }) {
    return client.call(
      (dio) => dio.post(
        '/payments/intents',
        data: {'amount': amount, 'channel': channel, 'payerPhone': ?payerPhone},
        options: Options(headers: {'Idempotency-Key': idempotencyKey}),
      ),
      (json) => PaymentIntent.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<PaymentIntent> get(String id) => client.call(
        (dio) => dio.get('/payments/$id'),
        (json) => PaymentIntent.fromJson(json as Map<String, dynamic>),
      );

  Future<List<PaymentIntent>> list({String? status, int limit = 20}) => client.call(
        (dio) => dio.get('/payments', queryParameters: {'limit': limit, 'status': ?status}),
        (json) => ((json as Map<String, dynamic>)['items'] as List<dynamic>)
            .map((e) => PaymentIntent.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Future<PaymentIntent> cancel(String id) => client.call(
        (dio) => dio.post('/payments/$id/cancel'),
        (json) => PaymentIntent.fromJson(json as Map<String, dynamic>),
      );
}
