import 'package:intl/intl.dart';

/// Espace insécable (U+00A0) : un montant ne doit jamais être coupé en fin de ligne.
const nbsp = '\u00A0';

/// Formate un montant reçu de l'API (chaîne décimale, jamais de double) : « 25 400 FCFA ».
/// Aucun calcul financier n'est fait côté mobile ; on ne fait qu'afficher.
String formatMoney(String amount, {String currency = 'XAF', bool withSymbol = true}) {
  final negative = amount.startsWith('-');
  final unsigned = negative ? amount.substring(1) : amount;
  final parts = unsigned.split('.');
  final integerPart = parts.first.isEmpty ? '0' : parts.first;
  final decimals = currency == 'XAF' ? '' : (parts.length > 1 ? ',${parts[1]}' : '');

  final grouped = _groupThousands(integerPart);
  final symbol = withSymbol ? '$nbsp${currencySymbol(currency)}' : '';
  return '${negative ? '-' : ''}$grouped$decimals$symbol';
}

String currencySymbol(String currency) => currency == 'XAF' ? 'FCFA' : currency;

String _groupThousands(String digits) {
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(nbsp);
    buffer.write(digits[i]);
  }
  return buffer.toString();
}

final _dateTime = DateFormat("d MMM yyyy 'à' HH:mm", 'fr');
final _date = DateFormat('d MMM yyyy', 'fr');

String formatDateTime(DateTime value) => _dateTime.format(value.toLocal());
String formatDate(DateTime value) => _date.format(value.toLocal());
