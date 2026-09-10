import 'package:benskin_impact/core/data/money.dart';
import 'package:benskin_impact/core/format/money_format.dart';
import 'package:benskin_impact/core/format/phone_format.dart';
import 'package:benskin_impact/core/widgets/status_badge.dart';
import 'package:benskin_impact/features/wallet/domain/wallet_models.dart';
import 'package:benskin_impact/features/wallet/presentation/widgets/transaction_row.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting('fr'));

  group('formatMoney', () {
    test('groupe les milliers avec des espaces insécables et affiche FCFA sans décimales', () {
      expect(formatMoney('25400'), '25${nbsp}400${nbsp}FCFA');
      expect(formatMoney('142600000'), '142${nbsp}600${nbsp}000${nbsp}FCFA');
      expect(formatMoney('200.00'), '200${nbsp}FCFA');
      expect(formatMoney('0'), '0${nbsp}FCFA');
    });

    test('conserve le signe', () {
      expect(formatMoney('-200'), '-200${nbsp}FCFA');
    });

    test('peut omettre le symbole', () {
      expect(formatMoney('25400', withSymbol: false), '25${nbsp}400');
    });
  });

  group('CameroonPhone', () {
    test('normalise la saisie locale en E.164', () {
      expect(CameroonPhone.toE164('6 12 34 56 78'), '+237612345678');
      expect(CameroonPhone.toE164('+237 612345678'), '+237612345678');
    });

    test('refuse les numéros non mobiles ou incomplets', () {
      expect(CameroonPhone.isValid('612345678'), isTrue);
      expect(CameroonPhone.isValid('222123456'), isFalse);
      expect(CameroonPhone.isValid('61234'), isFalse);
    });

    test('met en forme pour l’affichage', () {
      expect(CameroonPhone.pretty('+237612345678'), '6 12 34 56 78');
    });
  });

  testWidgets('TransactionRow affiche le sens, le libellé et le montant', (tester) async {
    final transaction = WalletTransaction(
      id: 'e1',
      transactionId: 't1',
      reference: 'deposit:1',
      type: 'DEPOSIT',
      direction: 'IN',
      amount: const Money(amount: '10000', currency: 'XAF'),
      balanceAfter: const Money(amount: '25400', currency: 'XAF'),
      bucket: 'AVAILABLE',
      status: 'POSTED',
      isReversal: false,
      createdAt: DateTime(2026, 9, 10, 8, 30),
    );

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: TransactionRow(transaction: transaction))));

    expect(find.text('Rechargement'), findsOneWidget);
    expect(find.text('+10${nbsp}000${nbsp}FCFA'), findsOneWidget);
  });

  testWidgets('StatusBadge traduit le statut KYC', (tester) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: StatusBadge.kyc('UNDER_REVIEW'))));
    expect(find.text('Vérification en cours'), findsOneWidget);
  });
}
