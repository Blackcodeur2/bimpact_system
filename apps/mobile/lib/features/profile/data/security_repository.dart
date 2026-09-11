import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';

/// Appareil connecté au compte (GET /v1/security/devices).
class DeviceSession {
  const DeviceSession({
    required this.id,
    required this.platform,
    required this.lastSeenAt,
    required this.createdAt,
    required this.activeSessions,
    required this.current,
    this.model,
    this.appVersion,
    this.revokedAt,
  });

  final String id;
  final String platform;
  final String? model;
  final String? appVersion;
  final DateTime lastSeenAt;
  final DateTime createdAt;
  final DateTime? revokedAt;
  final int activeSessions;
  final bool current;

  bool get isRevoked => revokedAt != null;

  String get displayName {
    final kind = switch (platform) {
      'android' => 'Téléphone Android',
      'ios' => 'iPhone',
      'web' => 'Navigateur web',
      _ => 'Appareil',
    };
    return model == null || model!.isEmpty ? kind : '$kind · $model';
  }

  factory DeviceSession.fromJson(Map<String, dynamic> json) => DeviceSession(
        id: json['id'] as String,
        platform: json['platform'] as String,
        model: json['model'] as String?,
        appVersion: json['appVersion'] as String?,
        lastSeenAt: DateTime.parse(json['lastSeenAt'] as String),
        createdAt: DateTime.parse(json['createdAt'] as String),
        revokedAt: json['revokedAt'] == null ? null : DateTime.parse(json['revokedAt'] as String),
        activeSessions: (json['activeSessions'] as num).toInt(),
        current: json['current'] as bool? ?? false,
      );
}

class SecurityRepository {
  SecurityRepository({required this.client});
  final ApiClient client;

  /// Renvoie le nombre d'autres sessions fermées par le serveur.
  Future<int> changePin({required String currentPin, required String newPin}) => client.call(
        (dio) => dio.post('/security/pin', data: {'currentPin': currentPin, 'newPin': newPin}),
        (json) => ((json as Map<String, dynamic>)['revokedSessions'] as num).toInt(),
      );

  Future<List<DeviceSession>> devices() => client.call((dio) => dio.get('/security/devices'), _parseDevices);

  Future<List<DeviceSession>> revoke(String deviceId) =>
      client.call((dio) => dio.post('/security/devices/$deviceId/revoke'), _parseDevices);

  static List<DeviceSession> _parseDevices(dynamic json) => ((json as Map<String, dynamic>)['items'] as List<dynamic>)
      .map((e) => DeviceSession.fromJson(e as Map<String, dynamic>))
      .toList();
}

final securityRepositoryProvider = Provider<SecurityRepository>((ref) => SecurityRepository(client: ref.watch(apiClientProvider)));

final devicesProvider = FutureProvider.autoDispose<List<DeviceSession>>((ref) => ref.watch(securityRepositoryProvider).devices());
