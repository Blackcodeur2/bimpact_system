import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import '../providers.dart';
import '../storage/device_identity.dart';

/// Évènements d'usage (cahier §7.2), envoyés par lots et au mieux : une perte n'a aucune conséquence.
/// Aucune donnée personnelle dans les propriétés (le serveur ne conserve que des valeurs simples).
class AnalyticsService {
  AnalyticsService({required this.client, required this.device});

  final ApiClient client;
  final DeviceIdentity device;

  static const _maxBuffer = 100;
  final _buffer = <Map<String, dynamic>>[];
  Timer? _timer;

  void track(String name, [Map<String, Object> properties = const {}]) {
    _buffer.add({'name': name, 'occurredAt': DateTime.now().toUtc().toIso8601String(), if (properties.isNotEmpty) 'properties': properties});
    if (_buffer.length > _maxBuffer) _buffer.removeRange(0, _buffer.length - _maxBuffer);
    if (_buffer.length >= 10) {
      unawaited(flush());
    } else {
      _timer ??= Timer(const Duration(seconds: 20), () => unawaited(flush()));
    }
  }

  Future<void> flush() async {
    _timer?.cancel();
    _timer = null;
    if (_buffer.isEmpty) return;
    final batch = _buffer.take(50).toList();
    try {
      await client.call((dio) => dio.post('/analytics/events', data: {'installationId': device.installationId, 'events': batch}), (_) {});
      _buffer.removeRange(0, batch.length);
    } catch (_) {
      // Hors ligne : les évènements restent en mémoire pour le prochain envoi.
    }
  }
}

final analyticsProvider = Provider<AnalyticsService>(
  (ref) => AnalyticsService(client: ref.watch(apiClientProvider), device: ref.watch(deviceIdentityProvider)),
);
