import 'money.dart';

// Lecture tolérante des réponses JSON de l'API (champs facultatifs, listes, montants en chaînes décimales).

Money? moneyOrNull(Object? value) => value is Map<String, dynamic> ? Money.fromJson(value) : null;

DateTime? dateOrNull(Object? value) => value is String ? DateTime.parse(value) : null;

List<T> listOf<T>(Object? value, T Function(Map<String, dynamic> json) parse) =>
    value is List ? value.whereType<Map<String, dynamic>>().map(parse).toList() : <T>[];

/// Document privé servi par une URL signée temporaire (chemin relatif à l'origine de l'API).
class SignedDocument {
  const SignedDocument({required this.id, required this.type, required this.mimeType, required this.uploadedAt, required this.url});

  final String id;
  final String type;
  final String mimeType;
  final DateTime uploadedAt;
  final String url;

  bool get isImage => mimeType.startsWith('image/');

  factory SignedDocument.fromJson(Map<String, dynamic> json) => SignedDocument(
        id: json['id'] as String,
        type: json['type'] as String,
        mimeType: json['mimeType'] as String,
        uploadedAt: DateTime.parse(json['uploadedAt'] as String),
        url: json['url'] as String,
      );
}

/// Réponse paginée `{ items, nextCursor }`.
class PageResult<T> {
  const PageResult({required this.items, this.nextCursor});
  final List<T> items;
  final String? nextCursor;

  factory PageResult.fromJson(Object? json, T Function(Map<String, dynamic> json) parse) {
    final map = json as Map<String, dynamic>;
    return PageResult(items: listOf(map['items'], parse), nextCursor: map['nextCursor'] as String?);
  }
}
