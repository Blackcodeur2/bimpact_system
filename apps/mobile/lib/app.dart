import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/analytics/analytics.dart';
import 'core/router/app_router.dart';
import 'core/security/app_lock.dart';
import 'core/sync/sync_queue.dart';
import 'core/theme/app_theme.dart';

class BenskinApp extends ConsumerStatefulWidget {
  const BenskinApp({super.key});

  @override
  ConsumerState<BenskinApp> createState() => _BenskinAppState();
}

class _BenskinAppState extends ConsumerState<BenskinApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        ref.read(appLockProvider.notifier).onBackground();
        unawaited(ref.read(analyticsProvider).flush());
      case AppLifecycleState.resumed:
        ref.read(appLockProvider.notifier).onForeground();
        unawaited(ref.read(syncQueueProvider.notifier).flush());
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'BENSKIN IMPACT',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      routerConfig: ref.watch(routerProvider),
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
    );
  }
}
