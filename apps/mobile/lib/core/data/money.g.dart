// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'money.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Money _$MoneyFromJson(Map<String, dynamic> json) => _Money(
  amount: json['amount'] as String,
  currency: json['currency'] as String,
);

Map<String, dynamic> _$MoneyToJson(_Money instance) => <String, dynamic>{
  'amount': instance.amount,
  'currency': instance.currency,
};
