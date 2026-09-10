import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/providers.dart';
import 'core/storage/device_identity.dart';
import 'core/storage/local_cache.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('fr');
  Intl.defaultLocale = 'fr';

  final preferences = await SharedPreferences.getInstance();
  final device = await DeviceIdentity.load();
  final LocalCache cache = kIsWeb ? MemoryLocalCache() : DriftLocalCache(AppDatabase());

  runApp(
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(preferences),
        deviceIdentityProvider.overrideWithValue(device),
        localCacheProvider.overrideWithValue(cache),
      ],
      child: const BenskinApp(),
    ),
  );
}
