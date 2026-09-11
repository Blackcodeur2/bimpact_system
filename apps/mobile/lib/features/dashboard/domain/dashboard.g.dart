// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dashboard.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_DashboardUser _$DashboardUserFromJson(Map<String, dynamic> json) =>
    _DashboardUser(
      firstName: json['firstName'] as String,
      lastName: json['lastName'] as String,
      kycStatus: json['kycStatus'] as String,
    );

Map<String, dynamic> _$DashboardUserToJson(_DashboardUser instance) =>
    <String, dynamic>{
      'firstName': instance.firstName,
      'lastName': instance.lastName,
      'kycStatus': instance.kycStatus,
    };

_WalletSummary _$WalletSummaryFromJson(Map<String, dynamic> json) =>
    _WalletSummary(
      status: json['status'] as String,
      availableBalance: Money.fromJson(
        json['availableBalance'] as Map<String, dynamic>,
      ),
      reservedBalance: Money.fromJson(
        json['reservedBalance'] as Map<String, dynamic>,
      ),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$WalletSummaryToJson(_WalletSummary instance) =>
    <String, dynamic>{
      'status': instance.status,
      'availableBalance': instance.availableBalance.toJson(),
      'reservedBalance': instance.reservedBalance.toJson(),
      'updatedAt': instance.updatedAt.toIso8601String(),
    };

_AlertAction _$AlertActionFromJson(Map<String, dynamic> json) => _AlertAction(
  label: json['label'] as String,
  deepLink: json['deepLink'] as String,
);

Map<String, dynamic> _$AlertActionToJson(_AlertAction instance) =>
    <String, dynamic>{'label': instance.label, 'deepLink': instance.deepLink};

_DashboardAlert _$DashboardAlertFromJson(Map<String, dynamic> json) =>
    _DashboardAlert(
      code: json['code'] as String,
      severity: json['severity'] as String,
      title: json['title'] as String,
      message: json['message'] as String,
      action: json['action'] == null
          ? null
          : AlertAction.fromJson(json['action'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DashboardAlertToJson(_DashboardAlert instance) =>
    <String, dynamic>{
      'code': instance.code,
      'severity': instance.severity,
      'title': instance.title,
      'message': instance.message,
      'action': instance.action?.toJson(),
    };

_Dashboard _$DashboardFromJson(Map<String, dynamic> json) => _Dashboard(
  generatedAt: DateTime.parse(json['generatedAt'] as String),
  user: DashboardUser.fromJson(json['user'] as Map<String, dynamic>),
  wallet: WalletSummary.fromJson(json['wallet'] as Map<String, dynamic>),
  contribution: json['contribution'] as Map<String, dynamic>?,
  eligibility: json['eligibility'] as Map<String, dynamic>?,
  nextDraw: json['nextDraw'] as Map<String, dynamic>?,
  training: json['training'] as Map<String, dynamic>?,
  solidarity: json['solidarity'] as Map<String, dynamic>?,
  alerts: (json['alerts'] as List<dynamic>)
      .map((e) => DashboardAlert.fromJson(e as Map<String, dynamic>))
      .toList(),
  features: Map<String, bool>.from(json['features'] as Map),
);

Map<String, dynamic> _$DashboardToJson(_Dashboard instance) =>
    <String, dynamic>{
      'generatedAt': instance.generatedAt.toIso8601String(),
      'user': instance.user.toJson(),
      'wallet': instance.wallet.toJson(),
      'contribution': instance.contribution,
      'eligibility': instance.eligibility,
      'nextDraw': instance.nextDraw,
      'training': instance.training,
      'solidarity': instance.solidarity,
      'alerts': instance.alerts.map((e) => e.toJson()).toList(),
      'features': instance.features,
    };
