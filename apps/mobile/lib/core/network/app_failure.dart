import 'package:dio/dio.dart';

/// Échec présentable à l'utilisateur. Les écrans se basent sur le type et le `code`, jamais sur le texte.
sealed class AppFailure implements Exception {
  const AppFailure(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Erreur métier renvoyée par l'API au format `{ code, message, details }`.
final class ApiFailure extends AppFailure {
  const ApiFailure({required this.status, required this.code, required String message, this.details = const {}})
      : super(message);

  final int status;
  final String code;
  final Map<String, dynamic> details;

  /// Erreurs de validation par champ : `{ "phone": ["Numéro invalide"] }`.
  Map<String, List<String>> get fieldErrors {
    final fields = details['fields'];
    if (fields is! Map) return const {};
    return fields.map((key, value) => MapEntry(key.toString(), (value as List).map((e) => e.toString()).toList()));
  }

  String? fieldError(String field) => fieldErrors[field]?.first;
}

/// Pas de réseau ou serveur injoignable : l'action peut être réessayée.
final class NetworkFailure extends AppFailure {
  const NetworkFailure() : super('Pas de connexion. Vérifiez votre réseau puis réessayez.');
}

final class UnexpectedFailure extends AppFailure {
  const UnexpectedFailure() : super('Une erreur inattendue est survenue. Réessayez.');
}

AppFailure toAppFailure(Object error) {
  if (error is AppFailure) return error;
  if (error is DioException) {
    final inner = error.error;
    if (inner is AppFailure) return inner;
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
      case DioExceptionType.connectionError:
        return const NetworkFailure();
      case DioExceptionType.badResponse:
        final data = error.response?.data;
        if (data is Map && data['code'] is String) {
          return ApiFailure(
            status: error.response?.statusCode ?? 0,
            code: data['code'] as String,
            message: (data['message'] as String?) ?? 'La requête a échoué.',
            details: (data['details'] as Map?)?.cast<String, dynamic>() ?? const {},
          );
        }
        return const UnexpectedFailure();
      case DioExceptionType.cancel:
      case DioExceptionType.badCertificate:
      case DioExceptionType.unknown:
        return error.error is Exception && error.response == null ? const NetworkFailure() : const UnexpectedFailure();
    }
  }
  return const UnexpectedFailure();
}
