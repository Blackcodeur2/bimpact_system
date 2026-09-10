// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_TokenPair _$TokenPairFromJson(Map<String, dynamic> json) => _TokenPair(
  accessToken: json['accessToken'] as String,
  refreshToken: json['refreshToken'] as String,
  expiresIn: (json['expiresIn'] as num).toInt(),
);

Map<String, dynamic> _$TokenPairToJson(_TokenPair instance) =>
    <String, dynamic>{
      'accessToken': instance.accessToken,
      'refreshToken': instance.refreshToken,
      'expiresIn': instance.expiresIn,
    };

_UserProfile _$UserProfileFromJson(Map<String, dynamic> json) => _UserProfile(
  firstName: json['firstName'] as String,
  lastName: json['lastName'] as String,
  city: json['city'] as String,
  zone: json['zone'] as String?,
  kycStatus: json['kycStatus'] as String,
);

Map<String, dynamic> _$UserProfileToJson(_UserProfile instance) =>
    <String, dynamic>{
      'firstName': instance.firstName,
      'lastName': instance.lastName,
      'city': instance.city,
      'zone': instance.zone,
      'kycStatus': instance.kycStatus,
    };

_MeUser _$MeUserFromJson(Map<String, dynamic> json) => _MeUser(
  id: json['id'] as String,
  phone: json['phone'] as String,
  kind: json['kind'] as String,
  status: json['status'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
  profile: UserProfile.fromJson(json['profile'] as Map<String, dynamic>),
  roles: (json['roles'] as List<dynamic>).map((e) => e as String).toList(),
  permissions: (json['permissions'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$MeUserToJson(_MeUser instance) => <String, dynamic>{
  'id': instance.id,
  'phone': instance.phone,
  'kind': instance.kind,
  'status': instance.status,
  'createdAt': instance.createdAt.toIso8601String(),
  'profile': instance.profile.toJson(),
  'roles': instance.roles,
  'permissions': instance.permissions,
};

_OtpChallenge _$OtpChallengeFromJson(Map<String, dynamic> json) =>
    _OtpChallenge(
      challengeId: json['challengeId'] as String,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      resendAvailableAt: DateTime.parse(json['resendAvailableAt'] as String),
    );

Map<String, dynamic> _$OtpChallengeToJson(_OtpChallenge instance) =>
    <String, dynamic>{
      'challengeId': instance.challengeId,
      'expiresAt': instance.expiresAt.toIso8601String(),
      'resendAvailableAt': instance.resendAvailableAt.toIso8601String(),
    };

_PendingRegistration _$PendingRegistrationFromJson(Map<String, dynamic> json) =>
    _PendingRegistration(
      phone: json['phone'] as String,
      otp: OtpChallenge.fromJson(json['otp'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PendingRegistrationToJson(
  _PendingRegistration instance,
) => <String, dynamic>{'phone': instance.phone, 'otp': instance.otp.toJson()};

_AuthResult _$AuthResultFromJson(Map<String, dynamic> json) => _AuthResult(
  tokens: TokenPair.fromJson(json['tokens'] as Map<String, dynamic>),
  user: MeUser.fromJson(json['user'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AuthResultToJson(_AuthResult instance) =>
    <String, dynamic>{
      'tokens': instance.tokens.toJson(),
      'user': instance.user.toJson(),
    };
