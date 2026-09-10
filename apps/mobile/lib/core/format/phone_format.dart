/// Numéros mobiles camerounais : saisie locale « 6 12 34 56 78 », envoi E.164 « +237612345678 ».
/// La validation de référence reste côté API ; celle-ci sert au retour immédiat à l'utilisateur.
abstract final class CameroonPhone {
  static final _local = RegExp(r'^6\d{8}$');

  static String digitsOnly(String input) => input.replaceAll(RegExp(r'\D'), '');

  /// Retire l'indicatif s'il a été saisi.
  static String localPart(String input) {
    var digits = digitsOnly(input);
    if (digits.startsWith('00237')) digits = digits.substring(5);
    if (digits.startsWith('237') && digits.length == 12) digits = digits.substring(3);
    return digits;
  }

  static bool isValid(String input) => _local.hasMatch(localPart(input));

  static String toE164(String input) => '+237${localPart(input)}';

  /// « 612345678 » → « 6 12 34 56 78 ».
  static String pretty(String input) {
    final d = localPart(input);
    if (d.length != 9) return input;
    return '${d[0]} ${d.substring(1, 3)} ${d.substring(3, 5)} ${d.substring(5, 7)} ${d.substring(7)}';
  }
}
