import 'package:freezed_annotation/freezed_annotation.dart';

part 'auth_models.freezed.dart';
part 'auth_models.g.dart';

@freezed
abstract class TokenPair with _$TokenPair {
  const factory TokenPair({
    required String accessToken,
    required String refreshToken,
    required int expiresIn,
  }) = _TokenPair;

  factory TokenPair.fromJson(Map<String, dynamic> json) => _$TokenPairFromJson(json);
}

@freezed
abstract class UserProfile with _$UserProfile {
  const factory UserProfile({
    required String firstName,
    required String lastName,
    required String city,
    String? zone,
    required String kycStatus,
  }) = _UserProfile;

  factory UserProfile.fromJson(Map<String, dynamic> json) => _$UserProfileFromJson(json);
}

@freezed
abstract class MeUser with _$MeUser {
  const MeUser._();

  const factory MeUser({
    required String id,
    required String phone,
    required String kind,
    required String status,
    required DateTime createdAt,
    required UserProfile profile,
    required List<String> roles,
    required List<String> permissions,
  }) = _MeUser;

  factory MeUser.fromJson(Map<String, dynamic> json) => _$MeUserFromJson(json);

  /// Affichage adapté aux capacités ; le serveur reste seul juge des autorisations.
  bool can(String permission) => permissions.contains(permission);

  String get initials =>
      '${profile.firstName.isNotEmpty ? profile.firstName[0] : ''}${profile.lastName.isNotEmpty ? profile.lastName[0] : ''}'
          .toUpperCase();
}

@freezed
abstract class OtpChallenge with _$OtpChallenge {
  const factory OtpChallenge({
    required String challengeId,
    required DateTime expiresAt,
    required DateTime resendAvailableAt,
  }) = _OtpChallenge;

  factory OtpChallenge.fromJson(Map<String, dynamic> json) => _$OtpChallengeFromJson(json);
}

@freezed
abstract class PendingRegistration with _$PendingRegistration {
  const factory PendingRegistration({required String phone, required OtpChallenge otp}) = _PendingRegistration;

  factory PendingRegistration.fromJson(Map<String, dynamic> json) => _$PendingRegistrationFromJson(json);
}

@freezed
abstract class AuthResult with _$AuthResult {
  const factory AuthResult({required TokenPair tokens, required MeUser user}) = _AuthResult;

  factory AuthResult.fromJson(Map<String, dynamic> json) => _$AuthResultFromJson(json);
}
