class ProjectMilestoneItem {
  const ProjectMilestoneItem({
    required this.id,
    required this.title,
    this.targetDate,
    required this.amount,
    required this.isCompleted,
    this.completedAt,
  });

  final String id;
  final String title;
  final DateTime? targetDate;
  final double amount;
  final bool isCompleted;
  final DateTime? completedAt;

  factory ProjectMilestoneItem.fromJson(Map<String, dynamic> json) => ProjectMilestoneItem(
        id: json['id'] as String,
        title: json['title'] as String,
        targetDate: json['targetDate'] != null ? DateTime.parse(json['targetDate'] as String) : null,
        amount: double.tryParse(json['amount'].toString()) ?? 0.0,
        isCompleted: json['isCompleted'] as bool? ?? false,
        completedAt: json['completedAt'] != null ? DateTime.parse(json['completedAt'] as String) : null,
      );
}

class ProjectItem {
  const ProjectItem({
    required this.id,
    required this.title,
    required this.sector,
    required this.city,
    this.locationDetail,
    required this.estimatedBudget,
    required this.personalContribution,
    required this.grantRequested,
    required this.status,
    required this.description,
    this.reviewFeedback,
    required this.createdAt,
    required this.milestones,
  });

  final String id;
  final String title;
  final String sector;
  final String city;
  final String? locationDetail;
  final double estimatedBudget;
  final double personalContribution;
  final double grantRequested;
  final String status; // DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, FUNDED
  final String description;
  final String? reviewFeedback;
  final DateTime createdAt;
  final List<ProjectMilestoneItem> milestones;

  String get statusLabel => switch (status) {
        'DRAFT' => 'Brouillon',
        'SUBMITTED' => 'Soumis',
        'UNDER_REVIEW' => 'En cours d’instruction',
        'APPROVED' => 'Approuvé par le comité',
        'REJECTED' => 'Refusé',
        'FUNDED' => 'Financé',
        _ => status,
      };

  factory ProjectItem.fromJson(Map<String, dynamic> json) => ProjectItem(
        id: json['id'] as String,
        title: json['title'] as String,
        sector: json['sector'] as String,
        city: json['city'] as String,
        locationDetail: json['locationDetail'] as String?,
        estimatedBudget: double.tryParse(json['estimatedBudget'].toString()) ?? 0.0,
        personalContribution: double.tryParse(json['personalContribution'].toString()) ?? 0.0,
        grantRequested: double.tryParse(json['grantRequested'].toString()) ?? 0.0,
        status: json['status'] as String,
        description: json['description'] as String,
        reviewFeedback: json['reviewFeedback'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
        milestones: (json['milestones'] as List<dynamic>? ?? [])
            .map((m) => ProjectMilestoneItem.fromJson(m as Map<String, dynamic>))
            .toList(),
      );
}
