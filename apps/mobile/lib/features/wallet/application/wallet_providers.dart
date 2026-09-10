import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/loaded.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/providers.dart';
import '../../dashboard/domain/dashboard.dart';
import '../domain/wallet_models.dart';

final dashboardProvider = FutureProvider.autoDispose<Loaded<Dashboard>>(
  (ref) => ref.watch(walletRepositoryProvider).dashboard(),
);

final walletProvider = FutureProvider.autoDispose<Loaded<Wallet>>(
  (ref) => ref.watch(walletRepositoryProvider).wallet(),
);

class TransactionsState {
  const TransactionsState({
    required this.items,
    this.nextCursor,
    this.cachedAt,
    this.loadingMore = false,
    this.loadMoreError,
  });

  final List<WalletTransaction> items;
  final String? nextCursor;
  final DateTime? cachedAt;
  final bool loadingMore;
  final AppFailure? loadMoreError;

  bool get hasMore => nextCursor != null;

  TransactionsState copyWith({
    List<WalletTransaction>? items,
    String? Function()? nextCursor,
    bool? loadingMore,
    AppFailure? Function()? loadMoreError,
  }) {
    return TransactionsState(
      items: items ?? this.items,
      nextCursor: nextCursor != null ? nextCursor() : this.nextCursor,
      cachedAt: cachedAt,
      loadingMore: loadingMore ?? this.loadingMore,
      loadMoreError: loadMoreError != null ? loadMoreError() : this.loadMoreError,
    );
  }
}

/// Historique paginé par curseur ; l'argument est le filtre de sens (null = tout, IN, OUT).
class TransactionsController extends AutoDisposeFamilyAsyncNotifier<TransactionsState, String?> {
  @override
  Future<TransactionsState> build(String? direction) async {
    final page = await ref.watch(walletRepositoryProvider).transactions(direction: direction);
    return TransactionsState(items: page.data.items, nextCursor: page.data.nextCursor, cachedAt: page.cachedAt);
  }

  Future<void> loadMore() async {
    final current = state.valueOrNull;
    if (current == null || !current.hasMore || current.loadingMore) return;

    state = AsyncData(current.copyWith(loadingMore: true, loadMoreError: () => null));
    try {
      final page = await ref.read(walletRepositoryProvider).transactions(direction: arg, cursor: current.nextCursor);
      state = AsyncData(current.copyWith(
        items: [...current.items, ...page.data.items],
        nextCursor: () => page.data.nextCursor,
        loadingMore: false,
      ));
    } on AppFailure catch (failure) {
      state = AsyncData(current.copyWith(loadingMore: false, loadMoreError: () => failure));
    }
  }
}

final transactionsProvider =
    AsyncNotifierProvider.autoDispose.family<TransactionsController, TransactionsState, String?>(
  TransactionsController.new,
);
