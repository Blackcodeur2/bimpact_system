import '../../../core/data/json.dart';
import '../../../core/data/money.dart';
import '../../../core/widgets/status_badge.dart';

// Accidents et solidarité volontaire. Les montants restent des chaînes décimales venues du serveur.

class SolidarityRules {
  const SolidarityRules({
    required this.collectionsEnabled,
    required this.contributionPerClaim,
    required this.maxAssistance,
    required this.waitingDays,
    required this.rulesVersion,
  });

  final bool collectionsEnabled;
  final Money contributionPerClaim;
  final Money maxAssistance;
  final int waitingDays;
  final String rulesVersion;

  factory SolidarityRules.fromJson(Map<String, dynamic> json) => SolidarityRules(
        collectionsEnabled: json['collectionsEnabled'] as bool? ?? false,
        contributionPerClaim: Money.fromJson(json['contributionPerClaim'] as Map<String, dynamic>),
        maxAssistance: Money.fromJson(json['maxAssistance'] as Map<String, dynamic>),
        waitingDays: (json['waitingDays'] as num).toInt(),
        rulesVersion: json['rulesVersion'] as String,
      );
}

class SolidarityMembership {
  const SolidarityMembership({required this.status, required this.joinedAt, required this.rulesVersion, required this.rulesUpToDate, this.leftAt});

  final String status;
  final DateTime joinedAt;
  final DateTime? leftAt;
  final String rulesVersion;
  final bool rulesUpToDate;

  bool get isActive => status == 'ACTIVE';

  factory SolidarityMembership.fromJson(Map<String, dynamic> json) => SolidarityMembership(
        status: json['status'] as String,
        joinedAt: DateTime.parse(json['joinedAt'] as String),
        leftAt: dateOrNull(json['leftAt']),
        rulesVersion: json['rulesVersion'] as String,
        rulesUpToDate: json['rulesUpToDate'] as bool? ?? true,
      );
}

class SolidarityStatus {
  const SolidarityStatus({
    required this.rules,
    required this.rulesText,
    required this.canJoin,
    required this.covered,
    required this.reasons,
    required this.fundBalance,
    required this.activeMembers,
    this.membership,
    this.coveredFrom,
  });

  final SolidarityRules rules;
  final List<String> rulesText;
  final SolidarityMembership? membership;
  final bool canJoin;
  final bool covered;
  final DateTime? coveredFrom;
  final List<String> reasons;
  final Money fundBalance;
  final int activeMembers;

  bool get isMember => membership?.isActive ?? false;
  bool get kycRequired => reasons.contains('KYC_NOT_APPROVED');

  factory SolidarityStatus.fromJson(Map<String, dynamic> json) {
    final fund = json['fund'] as Map<String, dynamic>;
    return SolidarityStatus(
      rules: SolidarityRules.fromJson(json['rules'] as Map<String, dynamic>),
      rulesText: (json['rulesText'] as List<dynamic>).cast<String>(),
      membership: json['membership'] == null ? null : SolidarityMembership.fromJson(json['membership'] as Map<String, dynamic>),
      canJoin: json['canJoin'] as bool? ?? false,
      covered: json['covered'] as bool? ?? false,
      coveredFrom: dateOrNull(json['coveredFrom']),
      reasons: (json['reasons'] as List<dynamic>).cast<String>(),
      fundBalance: Money.fromJson(fund['balance'] as Map<String, dynamic>),
      activeMembers: (fund['activeMembers'] as num).toInt(),
    );
  }
}

const accidentDocumentTypes = {
  'BULLETIN_ENTREE': 'Bulletin d’entrée à l’hôpital',
  'ORDONNANCE': 'Ordonnance',
  'FACTURE_HOPITAL': 'Facture',
  'CONSTAT_POLICE': 'Constat de police',
  'PHOTO_MOTO': 'Photo de la moto',
  'AUTRE': 'Autre justificatif',
};

const accidentSeverities = {
  'LIGHT': ('Léger', 'Plaies, soins simples'),
  'MODERATE': ('Moyen', 'Entorse, radiographie, plâtre'),
  'SEVERE': ('Grave', 'Fracture, hospitalisation'),
};

String accidentStatusLabel(String status) => switch (status) {
      'SUBMITTED' => 'Déclaration reçue',
      'DOCUMENTS_PENDING' => 'Justificatifs demandés',
      'INVESTIGATING' => 'En cours d’examen',
      'APPROVED' => 'Aide accordée',
      'REJECTED' => 'Non retenu',
      'DISBURSED' => 'Aide versée',
      'CLOSED' => 'Clôturé',
      _ => status,
    };

BadgeTone accidentStatusTone(String status) => switch (status) {
      'DOCUMENTS_PENDING' => BadgeTone.warning,
      'APPROVED' || 'DISBURSED' => BadgeTone.success,
      'REJECTED' => BadgeTone.danger,
      'CLOSED' => BadgeTone.neutral,
      _ => BadgeTone.info,
    };

class AccidentSummary {
  const AccidentSummary({
    required this.id,
    required this.reference,
    required this.date,
    required this.location,
    required this.severity,
    required this.status,
    required this.requestedAmount,
    required this.createdAt,
    this.approvedAmount,
    this.disbursedAmount,
    this.documentsCount = 0,
  });

  final String id;
  final String reference;
  final DateTime date;
  final String location;
  final String severity;
  final String status;
  final Money requestedAmount;
  final Money? approvedAmount;
  final Money? disbursedAmount;
  final DateTime createdAt;
  final int documentsCount;

  String get severityLabel => accidentSeverities[severity]?.$1 ?? severity;

  factory AccidentSummary.fromJson(Map<String, dynamic> json) => AccidentSummary(
        id: json['id'] as String,
        reference: json['reference'] as String,
        date: DateTime.parse(json['date'] as String),
        location: json['location'] as String,
        severity: json['severity'] as String,
        status: json['status'] as String,
        requestedAmount: Money.fromJson(json['requestedAmount'] as Map<String, dynamic>),
        approvedAmount: moneyOrNull(json['approvedAmount']),
        disbursedAmount: moneyOrNull(json['disbursedAmount']),
        createdAt: DateTime.parse(json['createdAt'] as String),
        documentsCount: (json['documentsCount'] as num?)?.toInt() ?? 0,
      );
}

class ClaimDocument {
  const ClaimDocument({required this.id, required this.type, required this.mimeType, required this.uploadedAt, required this.url});

  final String id;
  final String type;
  final String mimeType;
  final DateTime uploadedAt;
  final String url;

  bool get isImage => mimeType.startsWith('image/');
  String get typeLabel => accidentDocumentTypes[type] ?? type;

  factory ClaimDocument.fromJson(Map<String, dynamic> json) => ClaimDocument(
        id: json['id'] as String,
        type: json['type'] as String,
        mimeType: json['mimeType'] as String,
        uploadedAt: DateTime.parse(json['uploadedAt'] as String),
        url: json['url'] as String,
      );
}

class ClaimEvent {
  const ClaimEvent({required this.id, required this.type, required this.actorType, required this.createdAt, this.status, this.message});

  final String id;
  final String type;
  final String? status;
  final String? message;
  final String actorType;
  final DateTime createdAt;

  String get title => switch (type) {
        'SUBMITTED' => 'Déclaration enregistrée',
        'DOCUMENT_ADDED' => 'Justificatif ajouté',
        'DOCUMENTS_REQUESTED' => 'Justificatifs demandés par le comité',
        'MEMBER_MESSAGE' => 'Votre message',
        'INVESTIGATION_STARTED' => 'Examen du dossier',
        'APPROVED' => 'Décision : aide accordée',
        'REJECTED' => 'Décision : dossier non retenu',
        'DISBURSED' => 'Aide versée',
        'DISBURSEMENT_PENDING' => 'Versement en attente',
        'CLOSED' => 'Dossier clôturé',
        _ => type,
      };

  factory ClaimEvent.fromJson(Map<String, dynamic> json) => ClaimEvent(
        id: json['id'] as String,
        type: json['type'] as String,
        status: json['status'] as String?,
        message: json['message'] as String?,
        actorType: json['actorType'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class AccidentDetail {
  const AccidentDetail({
    required this.summary,
    required this.thirdPartyInvolved,
    required this.description,
    required this.solidarityEligible,
    required this.canAddDocuments,
    required this.documents,
    required this.timeline,
    this.hospitalName,
    this.decisionReason,
  });

  final AccidentSummary summary;
  final bool thirdPartyInvolved;
  final String? hospitalName;
  final String description;
  final String? decisionReason;
  final bool solidarityEligible;
  final bool canAddDocuments;
  final List<ClaimDocument> documents;
  final List<ClaimEvent> timeline;

  factory AccidentDetail.fromJson(Map<String, dynamic> json) => AccidentDetail(
        summary: AccidentSummary.fromJson(json),
        thirdPartyInvolved: json['thirdPartyInvolved'] as bool? ?? false,
        hospitalName: json['hospitalName'] as String?,
        description: json['description'] as String,
        decisionReason: json['decisionReason'] as String?,
        solidarityEligible: json['solidarityEligible'] as bool? ?? false,
        canAddDocuments: json['canAddDocuments'] as bool? ?? false,
        documents: listOf(json['documents'], ClaimDocument.fromJson),
        timeline: listOf(json['timeline'], ClaimEvent.fromJson),
      );
}
