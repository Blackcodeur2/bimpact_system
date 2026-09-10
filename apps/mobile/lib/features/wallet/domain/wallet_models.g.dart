// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'wallet_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Wallet _$WalletFromJson(Map<String, dynamic> json) => _Wallet(
  id: json['id'] as String,
  status: json['status'] as String,
  currency: json['currency'] as String,
  availableBalance: Money.fromJson(
    json['availableBalance'] as Map<String, dynamic>,
  ),
  reservedBalance: Money.fromJson(
    json['reservedBalance'] as Map<String, dynamic>,
  ),
  updatedAt: DateTime.parse(json['updatedAt'] as String),
);

Map<String, dynamic> _$WalletToJson(_Wallet instance) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status,
  'currency': instance.currency,
  'availableBalance': instance.availableBalance.toJson(),
  'reservedBalance': instance.reservedBalance.toJson(),
  'updatedAt': instance.updatedAt.toIso8601String(),
};

_WalletTransaction _$WalletTransactionFromJson(Map<String, dynamic> json) =>
    _WalletTransaction(
      id: json['id'] as String,
      transactionId: json['transactionId'] as String,
      reference: json['reference'] as String,
      type: json['type'] as String,
      description: json['description'] as String?,
      direction: json['direction'] as String,
      amount: Money.fromJson(json['amount'] as Map<String, dynamic>),
      balanceAfter: Money.fromJson(
        json['balanceAfter'] as Map<String, dynamic>,
      ),
      bucket: json['bucket'] as String,
      status: json['status'] as String,
      isReversal: json['isReversal'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$WalletTransactionToJson(_WalletTransaction instance) =>
    <String, dynamic>{
      'id': instance.id,
      'transactionId': instance.transactionId,
      'reference': instance.reference,
      'type': instance.type,
      'description': instance.description,
      'direction': instance.direction,
      'amount': instance.amount.toJson(),
      'balanceAfter': instance.balanceAfter.toJson(),
      'bucket': instance.bucket,
      'status': instance.status,
      'isReversal': instance.isReversal,
      'createdAt': instance.createdAt.toIso8601String(),
    };

_TransactionPage _$TransactionPageFromJson(Map<String, dynamic> json) =>
    _TransactionPage(
      items: (json['items'] as List<dynamic>)
          .map((e) => WalletTransaction.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: json['nextCursor'] as String?,
    );

Map<String, dynamic> _$TransactionPageToJson(_TransactionPage instance) =>
    <String, dynamic>{
      'items': instance.items.map((e) => e.toJson()).toList(),
      'nextCursor': instance.nextCursor,
    };
