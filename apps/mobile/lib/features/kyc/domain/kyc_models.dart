// Modèles du domaine KYC pour l'application mobile.

class KycIdentity {
  const KycIdentity({
    this.firstName,
    this.lastName,
    this.birthDate,
    this.idDocumentType,
    this.idDocumentNumber,
    this.idDocumentExpiry,
  });

  final String? firstName;
  final String? lastName;
  final String? birthDate;
  final String? idDocumentType;
  final String? idDocumentNumber;
  final String? idDocumentExpiry;

  factory KycIdentity.fromJson(Map<String, dynamic> json) {
    return KycIdentity(
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      birthDate: json['birthDate'] as String?,
      idDocumentType: json['idDocumentType'] as String?,
      idDocumentNumber: json['idDocumentNumber'] as String?,
      idDocumentExpiry: json['idDocumentExpiry'] as String?,
    );
  }
}

class KycLocation {
  const KycLocation({
    this.city,
    this.district,
    this.addressHint,
  });

  final String? city;
  final String? district;
  final String? addressHint;

  factory KycLocation.fromJson(Map<String, dynamic> json) {
    return KycLocation(
      city: json['city'] as String?,
      district: json['district'] as String?,
      addressHint: json['addressHint'] as String?,
    );
  }
}

class KycVehicle {
  const KycVehicle({
    this.plate,
    this.model,
    this.ownership,
  });

  final String? plate;
  final String? model;
  final String? ownership;

  factory KycVehicle.fromJson(Map<String, dynamic> json) {
    return KycVehicle(
      plate: json['plate'] as String?,
      model: json['model'] as String?,
      ownership: json['ownership'] as String?,
    );
  }
}

class KycDocument {
  const KycDocument({
    required this.id,
    required this.type,
    required this.status,
    required this.mimeType,
    required this.sizeBytes,
    required this.uploadedAt,
    this.rejectionReason,
    required this.url,
    required this.urlExpiresAt,
  });

  final String id;
  final String type;
  final String status;
  final String mimeType;
  final int sizeBytes;
  final DateTime uploadedAt;
  final String? rejectionReason;
  final String url;
  final DateTime urlExpiresAt;

  bool get isImage => mimeType.startsWith('image/');
  bool get isRejected => status == 'REJECTED';

  factory KycDocument.fromJson(Map<String, dynamic> json) {
    return KycDocument(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? '',
      status: json['status'] as String? ?? '',
      mimeType: json['mimeType'] as String? ?? '',
      sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
      uploadedAt: json['uploadedAt'] != null
          ? DateTime.tryParse(json['uploadedAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      rejectionReason: json['rejectionReason'] as String?,
      url: json['url'] as String? ?? '',
      urlExpiresAt: json['urlExpiresAt'] != null
          ? DateTime.tryParse(json['urlExpiresAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class KycRequirements {
  const KycRequirements({
    required this.identity,
    required this.location,
    required this.vehicle,
    required this.documents,
    required this.completion,
    required this.missing,
  });

  final bool identity;
  final bool location;
  final bool vehicle;
  final bool documents;
  final int completion;
  final List<String> missing;

  factory KycRequirements.fromJson(Map<String, dynamic> json) {
    return KycRequirements(
      identity: json['identity'] as bool? ?? false,
      location: json['location'] as bool? ?? false,
      vehicle: json['vehicle'] as bool? ?? false,
      documents: json['documents'] as bool? ?? false,
      completion: (json['completion'] as num?)?.toInt() ?? 0,
      missing: (json['missing'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? const [],
    );
  }
}

class KycSubmission {
  const KycSubmission({
    required this.count,
    this.submittedAt,
    this.reviewedAt,
    this.decisionReason,
  });

  final int count;
  final DateTime? submittedAt;
  final DateTime? reviewedAt;
  final String? decisionReason;

  factory KycSubmission.fromJson(Map<String, dynamic> json) {
    return KycSubmission(
      count: (json['count'] as num?)?.toInt() ?? 0,
      submittedAt: json['submittedAt'] != null ? DateTime.tryParse(json['submittedAt'].toString()) : null,
      reviewedAt: json['reviewedAt'] != null ? DateTime.tryParse(json['reviewedAt'].toString()) : null,
      decisionReason: json['decisionReason'] as String?,
    );
  }
}

/// Dossier de vérification d'identité (GET /v1/kyc). Le serveur décide de ce qui est modifiable ou soumettable.
class KycDossier {
  const KycDossier({
    required this.status,
    required this.editable,
    required this.canSubmit,
    required this.identity,
    required this.location,
    required this.vehicle,
    required this.documents,
    required this.requiredDocuments,
    required this.requirements,
    required this.submission,
  });

  final String status;
  final bool editable;
  final bool canSubmit;
  final KycIdentity identity;
  final KycLocation location;
  final KycVehicle vehicle;
  final List<KycDocument> documents;
  final List<String> requiredDocuments;
  final KycRequirements requirements;
  final KycSubmission submission;

  factory KycDossier.fromJson(Map<String, dynamic> json) {
    return KycDossier(
      status: json['status'] as String? ?? 'NOT_STARTED',
      editable: json['editable'] as bool? ?? true,
      canSubmit: json['canSubmit'] as bool? ?? false,
      identity: json['identity'] != null
          ? KycIdentity.fromJson(json['identity'] as Map<String, dynamic>)
          : const KycIdentity(),
      location: json['location'] != null
          ? KycLocation.fromJson(json['location'] as Map<String, dynamic>)
          : const KycLocation(),
      vehicle: json['vehicle'] != null
          ? KycVehicle.fromJson(json['vehicle'] as Map<String, dynamic>)
          : const KycVehicle(),
      documents: (json['documents'] as List<dynamic>?)
              ?.map((e) => KycDocument.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      requiredDocuments: (json['requiredDocuments'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      requirements: json['requirements'] != null
          ? KycRequirements.fromJson(json['requirements'] as Map<String, dynamic>)
          : const KycRequirements(
              identity: false,
              location: false,
              vehicle: false,
              documents: false,
              completion: 0,
              missing: [],
            ),
      submission: json['submission'] != null
          ? KycSubmission.fromJson(json['submission'] as Map<String, dynamic>)
          : const KycSubmission(count: 0),
    );
  }

  KycDocument? documentOf(String type) {
    for (final document in documents) {
      if (document.type == type) return document;
    }
    return null;
  }

  int get usableRequiredDocuments =>
      requiredDocuments.where((type) {
        final doc = documentOf(type);
        return doc != null && !doc.isRejected;
      }).length;

  bool get isUnderReview => status == 'SUBMITTED' || status == 'UNDER_REVIEW';
}
