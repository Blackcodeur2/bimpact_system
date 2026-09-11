import '../../../core/data/json.dart';

// Offres d'emploi publiées par les entreprises du programme et candidatures du membre (cahier §7.20).

class JobApplicationRef {
  const JobApplicationRef({required this.id, required this.status, required this.createdAt});
  final String id;
  final String status;
  final DateTime createdAt;

  factory JobApplicationRef.fromJson(Map<String, dynamic> json) =>
      JobApplicationRef(id: json['id'] as String, status: json['status'] as String, createdAt: DateTime.parse(json['createdAt'] as String));
}

class JobOfferItem {
  const JobOfferItem({
    required this.id,
    required this.title,
    required this.company,
    required this.sector,
    required this.location,
    required this.skills,
    required this.slots,
    required this.description,
    required this.isActive,
    required this.createdAt,
    required this.isOwnCompany,
    this.companyId,
    this.salaryHint,
    this.requirements,
    this.application,
  });

  final String id;
  final String title;
  final String company;
  final String? companyId;
  final String sector;
  final String location;
  final String? salaryHint;
  final String? requirements;
  final List<String> skills;
  final int slots;
  final String description;
  final bool isActive;
  final DateTime createdAt;
  final bool isOwnCompany;
  final JobApplicationRef? application;

  bool get hasApplied => application != null && application!.status != 'WITHDRAWN';

  factory JobOfferItem.fromJson(Map<String, dynamic> json) => JobOfferItem(
        id: json['id'] as String,
        title: json['title'] as String,
        company: json['company'] as String,
        companyId: json['companyId'] as String?,
        sector: json['sector'] as String,
        location: json['location'] as String,
        salaryHint: json['salaryHint'] as String?,
        requirements: json['requirements'] as String?,
        skills: (json['skills'] as List<dynamic>? ?? const []).cast<String>(),
        slots: (json['slots'] as num?)?.toInt() ?? 1,
        description: json['description'] as String,
        isActive: json['isActive'] as bool? ?? true,
        createdAt: DateTime.parse(json['createdAt'] as String),
        isOwnCompany: json['isOwnCompany'] as bool? ?? false,
        application: json['application'] == null ? null : JobApplicationRef.fromJson(json['application'] as Map<String, dynamic>),
      );
}

class MyJobApplication {
  const MyJobApplication({
    required this.id,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required this.canWithdraw,
    required this.offerTitle,
    required this.company,
    required this.location,
    required this.offerActive,
    this.message,
  });

  final String id;
  final String status;
  final String? message;
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool canWithdraw;
  final String offerTitle;
  final String company;
  final String location;
  final bool offerActive;

  factory MyJobApplication.fromJson(Map<String, dynamic> json) {
    final offer = json['offer'] as Map<String, dynamic>;
    return MyJobApplication(
      id: json['id'] as String,
      status: json['status'] as String,
      message: json['message'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      canWithdraw: json['canWithdraw'] as bool? ?? false,
      offerTitle: offer['title'] as String,
      company: offer['company'] as String,
      location: offer['location'] as String,
      offerActive: offer['isActive'] as bool? ?? false,
    );
  }
}

class JobOffersState {
  const JobOffersState({required this.items, this.nextCursor, this.loadingMore = false});
  final List<JobOfferItem> items;
  final String? nextCursor;
  final bool loadingMore;

  JobOffersState copyWith({List<JobOfferItem>? items, String? Function()? nextCursor, bool? loadingMore}) => JobOffersState(
        items: items ?? this.items,
        nextCursor: nextCursor != null ? nextCursor() : this.nextCursor,
        loadingMore: loadingMore ?? this.loadingMore,
      );

  static JobOffersState fromPage(PageResult<JobOfferItem> page) => JobOffersState(items: page.items, nextCursor: page.nextCursor);
}
