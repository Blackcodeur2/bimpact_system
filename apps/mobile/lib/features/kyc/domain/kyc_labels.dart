/// Libellés compréhensibles sur le terrain pour les codes renvoyés par l'API KYC.
abstract final class KycLabels {
  static const optionalDocuments = ['VEHICLE_REGISTRATION', 'DRIVING_LICENSE'];

  static String document(String type) => switch (type) {
        'ID_FRONT' => 'Pièce d’identité — recto',
        'ID_BACK' => 'Pièce d’identité — verso',
        'SELFIE' => 'Selfie',
        'VEHICLE_REGISTRATION' => 'Carte grise de la moto',
        'DRIVING_LICENSE' => 'Permis de conduire',
        _ => 'Document',
      };

  static String documentHint(String type) => switch (type) {
        'SELFIE' => 'Votre visage bien éclairé, sans lunettes de soleil ni casque.',
        'ID_FRONT' || 'ID_BACK' => 'Photo nette, sans reflet, les 4 coins visibles.',
        _ => 'Photo nette et lisible du document complet.',
      };

  static const idDocumentTypes = {
    'CNI': 'Carte nationale d’identité',
    'PASSPORT': 'Passeport',
    'RECEIPT': 'Récépissé de CNI',
  };

  static const ownerships = {
    'OWNER': 'Je suis propriétaire de la moto',
    'RENTED': 'Je loue la moto',
    'THIRD_PARTY': 'Je conduis la moto d’une autre personne',
  };

  static String missing(String code) {
    if (code.startsWith('DOCUMENT:')) return document(code.substring('DOCUMENT:'.length)).toLowerCase();
    return switch (code) {
      'IDENTITY' => 'votre identité',
      'LOCATION' => 'votre adresse',
      'VEHICLE' => 'votre moto',
      _ => code,
    };
  }
}
