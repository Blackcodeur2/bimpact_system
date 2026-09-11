import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/cached_fetch.dart';
import '../data/loaded.dart';
import '../data/money.dart';
import '../providers.dart';

/// Contacts réellement configurés par l'équipe ; null tant qu'ils ne sont pas renseignés (jamais de numéro inventé).
class SupportContacts {
  const SupportContacts({this.phone, this.whatsapp, this.email, this.hours, this.emergencyPhone});

  final String? phone;
  final String? whatsapp;
  final String? email;
  final String? hours;
  final String? emergencyPhone;

  bool get isEmpty => phone == null && whatsapp == null && email == null && emergencyPhone == null;

  factory SupportContacts.fromJson(Map<String, dynamic> json) => SupportContacts(
        phone: json['phone'] as String?,
        whatsapp: json['whatsapp'] as String?,
        email: json['email'] as String?,
        hours: json['hours'] as String?,
        emergencyPhone: json['emergencyPhone'] as String?,
      );
}

/// Configuration distante lue au démarrage (GET /v1/config/mobile — cahier §7.1).
class RemoteConfig {
  const RemoteConfig({
    required this.minVersion,
    required this.latestVersion,
    required this.maintenanceEnabled,
    required this.paymentsTestMode,
    required this.solidarityCollections,
    required this.dailyContribution,
    required this.support,
    this.maintenanceMessage,
  });

  final String minVersion;
  final String latestVersion;
  final bool maintenanceEnabled;
  final String? maintenanceMessage;
  final bool paymentsTestMode;
  final bool solidarityCollections;
  final Money dailyContribution;
  final SupportContacts support;

  factory RemoteConfig.fromJson(Map<String, dynamic> json) {
    final maintenance = json['maintenance'] as Map<String, dynamic>? ?? const {};
    final features = json['features'] as Map<String, dynamic>? ?? const {};
    final contribution = json['contribution'] as Map<String, dynamic>? ?? const {};
    return RemoteConfig(
      minVersion: json['minVersion'] as String? ?? '0.0.0',
      latestVersion: json['latestVersion'] as String? ?? '0.0.0',
      maintenanceEnabled: maintenance['enabled'] as bool? ?? false,
      maintenanceMessage: maintenance['message'] as String?,
      paymentsTestMode: features['paymentsTestMode'] as bool? ?? false,
      solidarityCollections: features['solidarityCollections'] as bool? ?? false,
      dailyContribution: contribution['dailyAmount'] is Map<String, dynamic>
          ? Money.fromJson(contribution['dailyAmount'] as Map<String, dynamic>)
          : const Money(amount: '200', currency: 'XAF'),
      support: SupportContacts.fromJson(json['support'] as Map<String, dynamic>? ?? const {}),
    );
  }
}

/// Compare deux versions « 1.2.3 » (le suffixe de build « +4 » est ignoré). Négatif si [a] < [b].
int compareVersions(String a, String b) {
  List<int> parts(String version) =>
      version.split('+').first.split('.').map((part) => int.tryParse(part.trim()) ?? 0).toList();
  final left = parts(a);
  final right = parts(b);
  for (var i = 0; i < 3; i++) {
    final l = i < left.length ? left[i] : 0;
    final r = i < right.length ? right[i] : 0;
    if (l != r) return l.compareTo(r);
  }
  return 0;
}

final remoteConfigProvider = FutureProvider<Loaded<RemoteConfig>>(
  (ref) => fetchWithCache(
    client: ref.watch(apiClientProvider),
    cache: ref.watch(localCacheProvider),
    key: 'config.mobile',
    request: (dio) => dio.get('/config/mobile'),
    parse: (json) => RemoteConfig.fromJson(json as Map<String, dynamic>),
  ),
);

sealed class AppGate {
  const AppGate();
}

final class GateOpen extends AppGate {
  const GateOpen();
}

final class GateMaintenance extends AppGate {
  const GateMaintenance(this.message);
  final String? message;
}

final class GateUpdateRequired extends AppGate {
  const GateUpdateRequired(this.minVersion);
  final String minVersion;
}

/// Maintenance et version minimale. Sans réseau ni configuration connue, l'application reste utilisable hors ligne.
class AppGateController extends Notifier<AppGate> {
  @override
  AppGate build() => const GateOpen();

  Future<void> check() async {
    ref.invalidate(remoteConfigProvider);
    try {
      final loaded = await ref.read(remoteConfigProvider.future).timeout(const Duration(seconds: 8));
      final config = loaded.data;
      final appVersion = ref.read(deviceIdentityProvider).appVersion;
      if (config.maintenanceEnabled && !loaded.isFromCache) {
        state = GateMaintenance(config.maintenanceMessage);
      } else if (compareVersions(appVersion, config.minVersion) < 0) {
        state = GateUpdateRequired(config.minVersion);
      } else {
        state = const GateOpen();
      }
    } catch (_) {
      state = const GateOpen();
    }
  }
}

final appGateProvider = NotifierProvider<AppGateController, AppGate>(AppGateController.new);
