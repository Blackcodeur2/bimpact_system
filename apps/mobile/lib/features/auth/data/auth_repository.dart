import '../../../core/network/api_client.dart';
import '../../../core/storage/device_identity.dart';
import '../../../core/storage/local_cache.dart';
import '../domain/auth_models.dart';

/// Parcours d'authentification (cahier §7.3, §7.4). Aucune règle de sécurité n'est décidée ici :
/// l'API valide le téléphone, le PIN, l'OTP, le verrouillage et les consentements.
class AuthRepository {
  AuthRepository({required this.client, required this.cache, required this.device});

  final ApiClient client;
  final LocalCache cache;
  final DeviceIdentity device;

  static const _meKey = 'me';

  Future<PendingRegistration> register({
    required String phone,
    required String firstName,
    required String lastName,
    required String city,
    required String pin,
    required bool acceptTerms,
    required bool acceptPrivacy,
  }) {
    return client.call(
      (dio) => dio.post('/auth/register', data: {
        'phone': phone,
        'firstName': firstName,
        'lastName': lastName,
        'city': city,
        'pin': pin,
        'acceptTerms': acceptTerms,
        'acceptPrivacy': acceptPrivacy,
      }),
      (json) => PendingRegistration.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<OtpChallenge> resendOtp(String phone) {
    return client.call(
      (dio) => dio.post('/auth/otp/request', data: {'phone': phone, 'purpose': 'REGISTER'}),
      (json) => OtpChallenge.fromJson((json as Map<String, dynamic>)['otp'] as Map<String, dynamic>),
    );
  }

  Future<AuthResult> verifyOtp({required String challengeId, required String code}) {
    return client.call(
      (dio) => dio.post('/auth/otp/verify', data: {
        'challengeId': challengeId,
        'code': code,
        'device': device.toJson(),
      }),
      (json) => AuthResult.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<AuthResult> login({required String phone, required String pin}) {
    return client.call(
      (dio) => dio.post('/auth/login', data: {'phone': phone, 'pin': pin, 'device': device.toJson()}),
      (json) => AuthResult.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<MeUser> me() async {
    final json = await client.call((dio) => dio.get('/me'), (json) => json as Map<String, dynamic>);
    await cache.write(_meKey, json);
    return MeUser.fromJson(json);
  }

  Future<MeUser?> cachedMe() async {
    final cached = await cache.read(_meKey);
    return cached == null ? null : MeUser.fromJson(cached.json as Map<String, dynamic>);
  }

  Future<void> cacheMe(MeUser user) => cache.write(_meKey, user.toJson());

  Future<void> logout() => client.call((dio) => dio.post('/auth/logout'), (_) {});
}
