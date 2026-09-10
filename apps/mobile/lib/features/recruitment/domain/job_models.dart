class JobOfferItem {
  const JobOfferItem({
    required this.id,
    required this.title,
    required this.company,
    required this.sector,
    required this.location,
    this.salaryHint,
    this.requirements,
    required this.description,
    required this.createdAt,
    required this.hasApplied,
    this.applicationStatus,
  });

  final String id;
  final String title;
  final String company;
  final String sector;
  final String location;
  final String? salaryHint;
  final String? requirements;
  final String description;
  final DateTime createdAt;
  final bool hasApplied;
  final String? applicationStatus;

  factory JobOfferItem.fromJson(Map<String, dynamic> json) => JobOfferItem(
        id: json['id'] as String,
        title: json['title'] as String,
        company: json['company'] as String,
        sector: json['sector'] as String,
        location: json['location'] as String,
        salaryHint: json['salaryHint'] as String?,
        requirements: json['requirements'] as String?,
        description: json['description'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        hasApplied: json['hasApplied'] as bool? ?? false,
        applicationStatus: json['applicationStatus'] as String?,
      );
}
