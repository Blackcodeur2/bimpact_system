class CoverageStatus {
  const CoverageStatus({
    required this.isCovered,
    required this.paidDaysLast30Days,
    required this.minRequiredDays,
    required this.maxCoverageAmount,
    required this.currency,
    required this.emergencyPhone,
    required this.guarantees,
  });

  final bool isCovered;
  final int paidDaysLast30Days;
  final int minRequiredDays;
  final double maxCoverageAmount;
  final String currency;
  final String emergencyPhone;
  final List<String> guarantees;

  factory CoverageStatus.fromJson(Map<String, dynamic> json) => CoverageStatus(
        isCovered: json['isCovered'] as bool? ?? false,
        paidDaysLast30Days: (json['paidDaysLast30Days'] as num?)?.toInt() ?? 0,
        minRequiredDays: (json['minRequiredDays'] as num?)?.toInt() ?? 5,
        maxCoverageAmount: double.tryParse(json['maxCoverageAmount'].toString()) ?? 150000.0,
        currency: json['currency'] as String? ?? 'XAF',
        emergencyPhone: json['emergencyPhone'] as String? ?? '+237699000000',
        guarantees: (json['guarantees'] as List<dynamic>? ?? []).map((e) => e.toString()).toList(),
      );
}

class AccidentClaimItem {
  const AccidentClaimItem({
    required this.id,
    required this.reference,
    required this.date,
    required this.location,
    required this.severity,
    required this.thirdPartyInvolved,
    this.hospitalName,
    required this.description,
    required this.status,
    required this.requestedAmount,
    this.approvedAmount,
    this.reviewNotes,
    required this.createdAt,
  });

  final String id;
  final String reference;
  final DateTime date;
  final String location;
  final String severity; // LIGHT, MODERATE, SEVERE
  final bool thirdPartyInvolved;
  final String? hospitalName;
  final String description;
  final String status; // SUBMITTED, INVESTIGATING, APPROVED, REJECTED, DISBURSED
  final double requestedAmount;
  final double? approvedAmount;
  final String? reviewNotes;
  final DateTime createdAt;

  String get statusLabel => switch (status) {
        'SUBMITTED' => 'Dossier déposé',
        'INVESTIGATING' => 'En cours d’expertise',
        'APPROVED' => 'Prise en charge accordée',
        'REJECTED' => 'Dossier rejeté',
        'DISBURSED' => 'Fonds versés',
        _ => status,
      };

  String get severityLabel => switch (severity) {
        'LIGHT' => 'Léger (soins ambulatoires)',
        'MODERATE' => 'Moyen (radiographies / plâtre)',
        'SEVERE' => 'Grave (hospitalisation)',
        _ => severity,
      };

  factory AccidentClaimItem.fromJson(Map<String, dynamic> json) => AccidentClaimItem(
        id: json['id'] as String,
        reference: json['reference'] as String,
        date: DateTime.parse(json['date'] as String),
        location: json['location'] as String,
        severity: json['severity'] as String,
        thirdPartyInvolved: json['thirdPartyInvolved'] as bool? ?? false,
        hospitalName: json['hospitalName'] as String?,
        description: json['description'] as String,
        status: json['status'] as String,
        requestedAmount: double.tryParse(json['requestedAmount'].toString()) ?? 0.0,
        approvedAmount: json['approvedAmount'] != null ? double.tryParse(json['approvedAmount'].toString()) : null,
        reviewNotes: json['reviewNotes'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}
