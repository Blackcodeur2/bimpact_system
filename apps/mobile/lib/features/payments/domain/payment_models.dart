// Modèles des paiements (rechargement). Les montants restent des chaînes décimales venues du serveur.

import '../../../core/data/money.dart';

class PaymentChannelInfo {
  const PaymentChannelInfo({required this.code, required this.label});

  final String code;
  final String label;

  factory PaymentChannelInfo.fromJson(Map<String, dynamic> json) =>
      PaymentChannelInfo(code: json['code'] as String, label: json['label'] as String);
}

/// Moyens de paiement et limites annoncés par l'API (GET /v1/payments/methods).
class PaymentMethods {
  const PaymentMethods({
    required this.provider,
    required this.testMode,
    required this.channels,
    required this.minAmount,
    required this.maxAmount,
    required this.dailyLimit,
    required this.fee,
  });

  final String provider;
  final bool testMode;
  final List<PaymentChannelInfo> channels;
  final Money minAmount;
  final Money maxAmount;
  final Money dailyLimit;
  final Money fee;

  int get minAmountValue => int.parse(minAmount.amount.split('.').first);
  int get maxAmountValue => int.parse(maxAmount.amount.split('.').first);

  factory PaymentMethods.fromJson(Map<String, dynamic> json) => PaymentMethods(
        provider: json['provider'] as String,
        testMode: json['testMode'] as bool? ?? false,
        channels: (json['channels'] as List<dynamic>)
            .map((e) => PaymentChannelInfo.fromJson(e as Map<String, dynamic>))
            .toList(),
        minAmount: Money.fromJson(json['minAmount'] as Map<String, dynamic>),
        maxAmount: Money.fromJson(json['maxAmount'] as Map<String, dynamic>),
        dailyLimit: Money.fromJson(json['dailyLimit'] as Map<String, dynamic>),
        fee: Money.fromJson(json['fee'] as Map<String, dynamic>),
      );
}

class PaymentFailure {
  const PaymentFailure({required this.code, this.message});

  final String code;
  final String? message;
}

/// Intention de paiement : seul le statut SUCCEEDED signifie que le portefeuille a été crédité.
class PaymentIntent {
  const PaymentIntent({
    required this.id,
    required this.status,
    required this.testMode,
    required this.channel,
    required this.channelLabel,
    required this.amount,
    required this.fee,
    required this.payerPhone,
    required this.expiresAt,
    required this.createdAt,
    this.externalReference,
    this.payerInstructions,
    this.failure,
    this.ledgerTransactionId,
    this.confirmedAt,
  });

  final String id;
  final String status;
  final bool testMode;
  final String channel;
  final String channelLabel;
  final Money amount;
  final Money fee;
  final String payerPhone;
  final String? externalReference;
  final String? payerInstructions;
  final PaymentFailure? failure;
  final String? ledgerTransactionId;
  final DateTime expiresAt;
  final DateTime? confirmedAt;
  final DateTime createdAt;

  bool get isOpen => status == 'CREATED' || status == 'PENDING';
  bool get isSucceeded => status == 'SUCCEEDED';

  factory PaymentIntent.fromJson(Map<String, dynamic> json) {
    final failure = json['failure'] as Map<String, dynamic>?;
    DateTime? date(String key) => json[key] == null ? null : DateTime.parse(json[key] as String);
    return PaymentIntent(
      id: json['id'] as String,
      status: json['status'] as String,
      testMode: json['testMode'] as bool? ?? false,
      channel: json['channel'] as String,
      channelLabel: json['channelLabel'] as String? ?? json['channel'] as String,
      amount: Money.fromJson(json['amount'] as Map<String, dynamic>),
      fee: Money.fromJson(json['fee'] as Map<String, dynamic>),
      payerPhone: json['payerPhone'] as String,
      externalReference: json['externalReference'] as String?,
      payerInstructions: json['payerInstructions'] as String?,
      failure: failure == null ? null : PaymentFailure(code: failure['code'] as String, message: failure['message'] as String?),
      ledgerTransactionId: json['ledgerTransactionId'] as String?,
      expiresAt: date('expiresAt')!,
      confirmedAt: date('confirmedAt'),
      createdAt: date('createdAt')!,
    );
  }
}
