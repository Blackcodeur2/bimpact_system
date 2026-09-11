import '../../../core/data/json.dart';
import '../../../core/data/money.dart';
import '../../../core/widgets/status_badge.dart';

// Projets d'entreprise (cahier §7.17-7.18). Montants en chaînes décimales ; la complétude est évaluée par le serveur.

String projectStatusLabel(String status) => switch (status) {
      'DRAFT' => 'Brouillon',
      'SUBMITTED' => 'Soumis au comité',
      'UNDER_REVIEW' => 'En cours d’examen',
      'CHANGES_REQUESTED' => 'Corrections demandées',
      'APPROVED' => 'Approuvé',
      'REJECTED' => 'Non retenu',
      'FUNDED' => 'Financé',
      'ACTIVE' => 'En activité',
      'COMPLETED' => 'Terminé',
      _ => status,
    };

BadgeTone projectStatusTone(String status) => switch (status) {
      'CHANGES_REQUESTED' => BadgeTone.warning,
      'APPROVED' || 'FUNDED' || 'ACTIVE' || 'COMPLETED' => BadgeTone.success,
      'REJECTED' => BadgeTone.danger,
      'DRAFT' => BadgeTone.neutral,
      _ => BadgeTone.info,
    };

const projectFieldLabels = {
  'sector': 'Secteur d’activité',
  'city': 'Ville',
  'problem': 'Problème à résoudre',
  'solution': 'Solution proposée',
  'market': 'Clients visés',
  'description': 'Description du projet',
  'estimatedBudget': 'Budget total',
  'grantRequested': 'Subvention demandée',
  'budgetLines': 'Détail du budget',
};

const projectIssueLabels = {
  'BUDGET_LINES_MISMATCH': 'Le détail du budget ne correspond pas au budget total.',
  'FINANCING_UNBALANCED': 'Apport personnel + subvention demandée doivent être égaux au budget total.',
  'GRANT_ABOVE_BUDGET': 'La subvention demandée dépasse le budget total.',
};

const projectDocumentTypes = {
  'BUSINESS_PLAN': 'Plan d’affaires',
  'QUOTE': 'Devis',
  'PHOTO': 'Photo (local, matériel…)',
  'OTHER': 'Autre document',
};

/// Une entreprise ne peut être créée qu'à partir d'un projet approuvé.
const companyEligibleProjectStatuses = {'APPROVED', 'FUNDED', 'ACTIVE', 'COMPLETED'};

class BudgetLine {
  const BudgetLine({required this.label, required this.amount});
  final String label;
  final Money amount;

  factory BudgetLine.fromJson(Map<String, dynamic> json) =>
      BudgetLine(label: json['label'] as String, amount: Money.fromJson(json['amount'] as Map<String, dynamic>));
}

class TeamMember {
  const TeamMember({required this.fullName, required this.role});
  final String fullName;
  final String role;

  factory TeamMember.fromJson(Map<String, dynamic> json) => TeamMember(fullName: json['fullName'] as String, role: json['role'] as String? ?? '');
}

class ProjectReviewItem {
  const ProjectReviewItem({required this.decision, required this.reason, required this.createdAt, this.score});
  final String decision;
  final String reason;
  final int? score;
  final DateTime createdAt;

  String get decisionLabel => switch (decision) {
        'APPROVED' => 'Approuvé',
        'REJECTED' => 'Non retenu',
        'CHANGES_REQUESTED' => 'Corrections demandées',
        _ => decision,
      };

  factory ProjectReviewItem.fromJson(Map<String, dynamic> json) => ProjectReviewItem(
        decision: json['decision'] as String,
        reason: json['reason'] as String,
        score: (json['score'] as num?)?.toInt(),
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class ProjectMilestoneItem {
  const ProjectMilestoneItem({required this.id, required this.title, required this.amount, required this.isCompleted, this.targetDate});
  final String id;
  final String title;
  final DateTime? targetDate;
  final Money amount;
  final bool isCompleted;

  factory ProjectMilestoneItem.fromJson(Map<String, dynamic> json) => ProjectMilestoneItem(
        id: json['id'] as String,
        title: json['title'] as String,
        targetDate: dateOrNull(json['targetDate']),
        amount: Money.fromJson(json['amount'] as Map<String, dynamic>),
        isCompleted: json['isCompleted'] as bool? ?? false,
      );
}

class ProjectSummary {
  const ProjectSummary({
    required this.id,
    required this.title,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.sector,
    this.city,
    this.estimatedBudget,
    this.grantRequested,
    this.submittedAt,
    this.companyId,
    this.companyName,
  });

  final String id;
  final String title;
  final String? sector;
  final String? city;
  final String status;
  final Money? estimatedBudget;
  final Money? grantRequested;
  final DateTime? submittedAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? companyId;
  final String? companyName;

  factory ProjectSummary.fromJson(Map<String, dynamic> json) {
    final company = json['company'] as Map<String, dynamic>?;
    return ProjectSummary(
      id: json['id'] as String,
      title: json['title'] as String,
      sector: json['sector'] as String?,
      city: json['city'] as String?,
      status: json['status'] as String,
      estimatedBudget: moneyOrNull(json['estimatedBudget']),
      grantRequested: moneyOrNull(json['grantRequested']),
      submittedAt: dateOrNull(json['submittedAt']),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      companyId: company?['id'] as String?,
      companyName: company?['name'] as String?,
    );
  }
}

class ProjectDetail {
  const ProjectDetail({
    required this.summary,
    required this.personalContribution,
    required this.budgetLines,
    required this.teamMembers,
    required this.canEdit,
    required this.canSubmit,
    required this.canAddDocuments,
    required this.missing,
    required this.issues,
    required this.documents,
    required this.reviews,
    required this.milestones,
    this.locationDetail,
    this.problem,
    this.solution,
    this.market,
    this.description,
    this.monthlyRevenue,
    this.monthlyCosts,
    this.jobsCreated,
    this.reviewFeedback,
    this.score,
  });

  final ProjectSummary summary;
  final String? locationDetail;
  final String? problem;
  final String? solution;
  final String? market;
  final String? description;
  final Money personalContribution;
  final List<BudgetLine> budgetLines;
  final List<TeamMember> teamMembers;
  final Money? monthlyRevenue;
  final Money? monthlyCosts;
  final int? jobsCreated;
  final String? reviewFeedback;
  final int? score;
  final bool canEdit;
  final bool canSubmit;
  final bool canAddDocuments;
  final List<String> missing;
  final List<String> issues;
  final List<SignedDocument> documents;
  final List<ProjectReviewItem> reviews;
  final List<ProjectMilestoneItem> milestones;

  bool get canCreateCompany => companyEligibleProjectStatuses.contains(summary.status) && summary.companyId == null;

  factory ProjectDetail.fromJson(Map<String, dynamic> json) {
    final forecasts = json['forecasts'] as Map<String, dynamic>? ?? const {};
    final completeness = json['completeness'] as Map<String, dynamic>? ?? const {};
    return ProjectDetail(
      summary: ProjectSummary.fromJson(json),
      locationDetail: json['locationDetail'] as String?,
      problem: json['problem'] as String?,
      solution: json['solution'] as String?,
      market: json['market'] as String?,
      description: json['description'] as String?,
      personalContribution: Money.fromJson(json['personalContribution'] as Map<String, dynamic>),
      budgetLines: listOf(json['budgetLines'], BudgetLine.fromJson),
      teamMembers: listOf(json['teamMembers'], TeamMember.fromJson),
      monthlyRevenue: moneyOrNull(forecasts['monthlyRevenue']),
      monthlyCosts: moneyOrNull(forecasts['monthlyCosts']),
      jobsCreated: (forecasts['jobsCreated'] as num?)?.toInt(),
      reviewFeedback: json['reviewFeedback'] as String?,
      score: (json['score'] as num?)?.toInt(),
      canEdit: json['canEdit'] as bool? ?? false,
      canSubmit: json['canSubmit'] as bool? ?? false,
      canAddDocuments: json['canAddDocuments'] as bool? ?? false,
      missing: (completeness['missing'] as List<dynamic>? ?? const []).cast<String>(),
      issues: (completeness['issues'] as List<dynamic>? ?? const []).cast<String>(),
      documents: listOf(json['documents'], SignedDocument.fromJson),
      reviews: listOf(json['reviews'], ProjectReviewItem.fromJson),
      milestones: listOf(json['milestones'], ProjectMilestoneItem.fromJson),
    );
  }
}
