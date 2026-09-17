import 'package:benskin_impact/core/security/biometric_credential_store.dart';
import 'package:benskin_impact/core/widgets/biometric_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeSecureStorage extends Fake implements FlutterSecureStorage {
  final Map<String, String> _data = {};

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (value == null) {
      _data.remove(key);
    } else {
      _data[key] = value;
    }
  }

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => _data[key];

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => _data.remove(key);
}

void main() {
  group('BiometricCredentialStore', () {
    late FakeSecureStorage storage;
    late BiometricCredentialStore store;

    setUp(() {
      storage = FakeSecureStorage();
      store = BiometricCredentialStore(storage);
    });

    test('initialement non enrôlé', () async {
      expect(await store.isEnrolled(), isFalse);
      expect(await store.getPhone(), isNull);
      expect(await store.getPin(), isNull);
      expect(await store.getFirstName(), isNull);
    });

    test('sauvegarde et récupère les identifiants biométriques', () async {
      await store.save(
        phone: '+237699001122',
        pin: '123456',
        firstName: 'Jean',
      );

      expect(await store.isEnrolled(), isTrue);
      expect(await store.getPhone(), '+237699001122');
      expect(await store.getPin(), '123456');
      expect(await store.getFirstName(), 'Jean');
    });

    test('met à jour le code PIN stocké', () async {
      await store.save(
        phone: '+237699001122',
        pin: '123456',
        firstName: 'Jean',
      );

      await store.updatePin('654321');
      expect(await store.getPin(), '654321');
    });

    test('supprime les identifiants lors du clear()', () async {
      await store.save(
        phone: '+237699001122',
        pin: '123456',
        firstName: 'Jean',
      );

      await store.clear();
      expect(await store.isEnrolled(), isFalse);
      expect(await store.getPhone(), isNull);
      expect(await store.getPin(), isNull);
      expect(await store.getFirstName(), isNull);
    });
  });

  group('BiometricButton Widget', () {
    testWidgets('affiche l’icône empreinte et le libellé', (tester) async {
      var tapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: BiometricButton(
              onPressed: () => tapped = true,
              label: 'Se connecter avec l’empreinte',
            ),
          ),
        ),
      );

      expect(find.text('Se connecter avec l’empreinte'), findsOneWidget);
      expect(find.byIcon(Icons.fingerprint_rounded), findsOneWidget);

      await tester.tap(find.byType(BiometricButton));
      expect(tapped, isTrue);
    });

    testWidgets('affiche un indicateur de chargement si loading=true', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: BiometricButton(
              onPressed: () {},
              loading: true,
            ),
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.byIcon(Icons.fingerprint_rounded), findsNothing);
    });
  });
}
