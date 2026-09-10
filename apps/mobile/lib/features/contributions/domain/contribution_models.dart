// Modèles de la contribution quotidienne (GET /v1/contributions).

import '../../../core/data/money.dart';

class ContributionDay {
  const ContributionDay({required this.date, required this.status});

  /// AAAA-MM-JJ, jour du Cameroun.
  final String date;

  /// PAID, DUE, MISSED ou NOT_STARTED.
  final String status;

  factory ContributionDay.fromJson(Map<String, dynamic> json) =>
      ContributionDay(date: json['date'] as String, status: json['status'] as String);
}

class ContributionItem {
  const ContributionItem({
    required this.id,
    required this.date,
    required this.amount,
    required this.source,
    required this.paidAt,
  });

  final String id;
  final String date;
  final Money amount;

  /// MANUAL ou AUTO.
  final String source;
  final DateTime paidAt;

  factory ContributionItem.fromJson(Map<String, dynamic> json) => ContributionItem(
        id: json['id'] as String,
        date: json['date'] as String,
        amount: Money.fromJson(json['amount'] as Map<String, dynamic>),
        source: json['source'] as String,
        paidAt: DateTime.parse(json['paidAt'] as String),
      );
}

class ContributionPlan {
  const ContributionPlan({required this.status, required this.autoDebit, required this.startedOn});

  final String status;
  final bool autoDebit;
  final String startedOn;

  factory ContributionPlan.fromJson(Map<String, dynamic> json) => ContributionPlan(
        status: json['status'] as String,
        autoDebit: json['autoDebit'] as bool,
        startedOn: json['startedOn'] as String,
      );
}

class ContributionOverview {
  const ContributionOverview({
    required this.eligible,
    required this.ineligibilityReasons,
    required this.dailyAmount,
    required this.plan,
    required this.todayDate,
    required this.todayStatus,
    required this.streak,
    required this.monthPaidDays,
    required this.monthExpectedDays,
    required this.monthTotal,
    required this.totalPaid,
    required this.calendar,
    required this.payableDates,
    required this.nextDueDate,
    required this.autoDebitHour,
    required this.recent,
  });

  final bool eligible;
  final List<String> ineligibilityReasons;
  final Money dailyAmount;
  final ContributionPlan? plan;
  final String todayDate;
  final String todayStatus;
  final int streak;
  final int monthPaidDays;
  final int monthExpectedDays;
  final Money monthTotal;
  final Money totalPaid;
  final List<ContributionDay> calendar;
  final List<String> payableDates;
  final String nextDueDate;
  final int autoDebitHour;
  final List<ContributionItem> recent;

  bool get todayPaid => todayStatus == 'PAID';
  bool get needsKyc => ineligibilityReasons.contains('KYC_NOT_APPROVED');

  /// Jours manqués encore rattrapables (hors aujourd'hui).
  List<String> get catchUpDates => payableDates.where((d) => d != todayDate).toList();

  factory ContributionOverview.fromJson(Map<String, dynamic> json) {
    final eligibility = json['eligibility'] as Map<String, dynamic>;
    final today = json['today'] as Map<String, dynamic>;
    final month = json['month'] as Map<String, dynamic>;
    return ContributionOverview(
      eligible: eligibility['eligible'] as bool,
      ineligibilityReasons: (eligibility['reasons'] as List<dynamic>).cast<String>(),
      dailyAmount: Money.fromJson(json['dailyAmount'] as Map<String, dynamic>),
      plan: json['plan'] == null ? null : ContributionPlan.fromJson(json['plan'] as Map<String, dynamic>),
      todayDate: today['date'] as String,
      todayStatus: today['status'] as String,
      streak: (json['streak'] as num).toInt(),
      monthPaidDays: (month['paidDays'] as num).toInt(),
      monthExpectedDays: (month['expectedDays'] as num).toInt(),
      monthTotal: Money.fromJson(month['totalPaid'] as Map<String, dynamic>),
      totalPaid: Money.fromJson(json['totalPaid'] as Map<String, dynamic>),
      calendar: (json['calendar'] as List<dynamic>).map((e) => ContributionDay.fromJson(e as Map<String, dynamic>)).toList(),
      payableDates: (json['payableDates'] as List<dynamic>).cast<String>(),
      nextDueDate: json['nextDueDate'] as String,
      autoDebitHour: (json['autoDebitHour'] as num).toInt(),
      recent: (json['recent'] as List<dynamic>).map((e) => ContributionItem.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}
