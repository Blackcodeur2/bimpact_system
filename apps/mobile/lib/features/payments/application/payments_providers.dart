import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/app_failure.dart';
import '../../../core/providers.dart';
import '../../wallet/application/wallet_providers.dart';
import '../data/payments_repository.dart';
import '../domain/payment_models.dart';

final paymentsRepositoryProvider = Provider<PaymentsRepository>(
  (ref) => PaymentsRepository(client: ref.watch(apiClientProvider)),
);

final paymentMethodsProvider = FutureProvider.autoDispose<PaymentMethods>(
  (ref) => ref.watch(paymentsRepositoryProvider).methods(),
);

/// Rechargements en attente de confirmation par l'opérateur (affichés sur le portefeuille).
final pendingPaymentsProvider = FutureProvider.autoDispose<List<PaymentIntent>>(
  (ref) => ref.watch(paymentsRepositoryProvider).list(status: 'PENDING'),
);

/// Suit une intention jusqu'à un statut définitif : interrogation toutes les 3 s tant qu'elle est ouverte.
class PaymentStatusController extends AutoDisposeFamilyAsyncNotifier<PaymentIntent, String> {
  Timer? _timer;

  @override
  Future<PaymentIntent> build(String id) async {
    ref.onDispose(() => _timer?.cancel());
    final intent = await ref.read(paymentsRepositoryProvider).get(id);
    _followUp(intent);
    return intent;
  }

  Future<void> cancel() async {
    final updated = await ref.read(paymentsRepositoryProvider).cancel(arg);
    state = AsyncData(updated);
    _followUp(updated);
  }

  void _followUp(PaymentIntent intent) {
    _timer?.cancel();
    if (intent.isOpen) {
      _timer = Timer(const Duration(seconds: 3), _poll);
      return;
    }
    // Statut définitif : les soldes et historiques affichés sont actualisés depuis le serveur.
    scheduleMicrotask(() {
      ref
        ..invalidate(walletProvider)
        ..invalidate(dashboardProvider)
        ..invalidate(transactionsProvider)
        ..invalidate(pendingPaymentsProvider);
    });
  }

  Future<void> _poll() async {
    try {
      final intent = await ref.read(paymentsRepositoryProvider).get(arg);
      state = AsyncData(intent);
      _followUp(intent);
    } on AppFailure {
      // Réseau instable : on garde le dernier statut connu et on réessaie plus tard.
      _timer = Timer(const Duration(seconds: 8), _poll);
    }
  }
}

final paymentStatusProvider =
    AsyncNotifierProvider.autoDispose.family<PaymentStatusController, PaymentIntent, String>(PaymentStatusController.new);
