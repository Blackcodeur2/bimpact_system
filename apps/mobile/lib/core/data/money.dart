import 'package:freezed_annotation/freezed_annotation.dart';

import '../format/money_format.dart';

part 'money.freezed.dart';
part 'money.g.dart';

/// Montant tel que renvoyé par l'API : chaîne décimale + devise. Jamais converti en double.
@freezed
abstract class Money with _$Money {
  const Money._();

  const factory Money({required String amount, required String currency}) = _Money;

  factory Money.fromJson(Map<String, dynamic> json) => _$MoneyFromJson(json);

  String get formatted => formatMoney(amount, currency: currency);
}
