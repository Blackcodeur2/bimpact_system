import 'package:freezed_annotation/freezed_annotation.dart';

import '../../../core/data/money.dart';

part 'wallet_models.freezed.dart';
part 'wallet_models.g.dart';

@freezed
abstract class Wallet with _$Wallet {
  const factory Wallet({
    required String id,
    required String status,
    required String currency,
    required Money availableBalance,
    required Money reservedBalance,
    required DateTime updatedAt,
  }) = _Wallet;

  factory Wallet.fromJson(Map<String, dynamic> json) => _$WalletFromJson(json);
}

@freezed
abstract class WalletTransaction with _$WalletTransaction {
  const WalletTransaction._();

  const factory WalletTransaction({
    required String id,
    required String transactionId,
    required String reference,
    required String type,
    String? description,
    required String direction,
    required Money amount,
    required Money balanceAfter,
    required String bucket,
    required String status,
    required bool isReversal,
    required DateTime createdAt,
  }) = _WalletTransaction;

  factory WalletTransaction.fromJson(Map<String, dynamic> json) => _$WalletTransactionFromJson(json);

  bool get isIncoming => direction == 'IN';

  /// Libellé lisible par un conducteur (cahier §2 : vocabulaire compréhensible sur le terrain).
  String get label {
    if (isReversal) return 'Annulation';
    return switch (type) {
      'DEPOSIT' => 'Rechargement',
      'CONTRIBUTION' => 'Contribution',
      'WITHDRAWAL' => 'Retrait',
      'ASSISTANCE' => 'Aide reçue',
      'FEE' => 'Frais',
      _ => description ?? 'Opération',
    };
  }
}

@freezed
abstract class TransactionPage with _$TransactionPage {
  const factory TransactionPage({
    required List<WalletTransaction> items,
    String? nextCursor,
  }) = _TransactionPage;

  factory TransactionPage.fromJson(Map<String, dynamic> json) => _$TransactionPageFromJson(json);
}
