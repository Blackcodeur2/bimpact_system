import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

/// Identité de l'installation envoyée à la connexion (gestion et révocation des appareils).
class DeviceIdentity {
  const DeviceIdentity({required this.installationId, required this.platform, required this.appVersion});

  final String installationId;
  final String platform;
  final String appVersion;

  Map<String, dynamic> toJson() => {
        'installationId': installationId,
        'platform': platform,
        'appVersion': appVersion,
      };

  static const _key = 'device.installation_id';

  static Future<DeviceIdentity> load() async {
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_key);
    if (id == null) {
      id = const Uuid().v4();
      await prefs.setString(_key, id);
    }
    final info = await PackageInfo.fromPlatform();
    final platform = kIsWeb ? 'web' : (defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android');
    return DeviceIdentity(installationId: id, platform: platform, appVersion: info.version);
  }
}
