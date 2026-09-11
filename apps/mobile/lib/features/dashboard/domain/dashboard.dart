import 'package:freezed_annotation/freezed_annotation.dart';

import '../../../core/data/money.dart';

part 'dashboard.freezed.dart';
part 'dashboard.g.dart';

@freezed
abstract class DashboardUser with _$DashboardUser {
  const factory DashboardUser({
    required String firstName,
    required String lastName,
    required String kycStatus,
  }) = _DashboardUser;

  factory DashboardUser.fromJson(Map<String, dynamic> json) => _$DashboardUserFromJson(json);
}

@freezed
abstract class WalletSummary with _$WalletSummary {
  const factory WalletSummary({
    required String status,
    required Money availableBalance,
    required Money reservedBalance,
    required DateTime updatedAt,
  }) = _WalletSummary;

  factory WalletSummary.fromJson(Map<String, dynamic> json) => _$WalletSummaryFromJson(json);
}

@freezed
abstract class AlertAction with _$AlertAction {
  const factory AlertAction({required String label, required String deepLink}) = _AlertAction;

  factory AlertAction.fromJson(Map<String, dynamic> json) => _$AlertActionFromJson(json);
}

@freezed
abstract class DashboardAlert with _$DashboardAlert {
  const factory DashboardAlert({
    required String code,
    required String severity,
    required String title,
    required String message,
    AlertAction? action,
  }) = _DashboardAlert;

  factory DashboardAlert.fromJson(Map<String, dynamic> json) => _$DashboardAlertFromJson(json);
}

/// Tableau de bord conducteur (GET /v1/me/dashboard) : situation réelle renvoyée par l'API.
@freezed
abstract class Dashboard with _$Dashboard {
  const Dashboard._();

  const factory Dashboard({
    required DateTime generatedAt,
    required DashboardUser user,
    required WalletSummary wallet,
    Map<String, dynamic>? contribution,
    Map<String, dynamic>? eligibility,
    Map<String, dynamic>? nextDraw,
    Map<String, dynamic>? training,
    Map<String, dynamic>? solidarity,
    required List<DashboardAlert> alerts,
    required Map<String, bool> features,
  }) = _Dashboard;

  factory Dashboard.fromJson(Map<String, dynamic> json) => _$DashboardFromJson(json);

  bool isEnabled(String feature) => features[feature] ?? false;
}
