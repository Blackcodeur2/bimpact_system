// Entreprises des porteurs de projet, équipe, offres d'emploi et candidatures (cahier §7.19-7.20).

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/json.dart';
import '../../core/network/api_client.dart';
import '../../core/providers.dart';
import '../../core/widgets/status_badge.dart';

String applicationStatusLabel(String status) => switch (status) {
      'PENDING' => 'Envoyée',
      'SHORTLISTED' => 'Présélectionnée',
      'CONTACTED' => 'Prise de contact',
      'HIRED' => 'Retenue',
      'REJECTED' => 'Non retenue',
      'WITHDRAWN' => 'Retirée',
      _ => status,
    };

BadgeTone applicationStatusTone(String status) => switch (status) {
      'SHORTLISTED' || 'CONTACTED' => BadgeTone.info,
      'HIRED' => BadgeTone.success,
      'REJECTED' => BadgeTone.danger,
      'WITHDRAWN' => BadgeTone.neutral,
      _ => BadgeTone.warning,
    };

/// Libellé de l'action employeur qui mène à ce statut.
String applicationActionLabel(String status) => switch (status) {
      'SHORTLISTED' => 'Présélectionner',
      'CONTACTED' => 'Contacter le candidat',
      'HIRED' => 'Retenir (ajouter à l’équipe)',
      'REJECTED' => 'Ne pas retenir',
      _ => status,
    };

class CompanySummary {
  const CompanySummary({
    required this.id,
    required this.name,
    required this.sector,
    required this.city,
    required this.status,
    required this.isOwner,
    required this.membersCount,
    required this.openJobsCount,
  });

  final String id;
  final String name;
  final String sector;
  final String city;
  final String status;
  final bool isOwner;
  final int membersCount;
  final int openJobsCount;

  factory CompanySummary.fromJson(Map<String, dynamic> json) => CompanySummary(
        id: json['id'] as String,
        name: json['name'] as String,
        sector: json['sector'] as String,
        city: json['city'] as String,
        status: json['status'] as String,
        isOwner: json['isOwner'] as bool? ?? false,
        membersCount: (json['membersCount'] as num?)?.toInt() ?? 0,
        openJobsCount: (json['openJobsCount'] as num?)?.toInt() ?? 0,
      );
}

class CompanyMember {
  const CompanyMember({required this.id, required this.fullName, required this.role, required this.joinedAt, required this.isOwner});
  final String id;
  final String fullName;
  final String role;
  final DateTime joinedAt;
  final bool isOwner;

  factory CompanyMember.fromJson(Map<String, dynamic> json) => CompanyMember(
        id: json['id'] as String,
        fullName: json['fullName'] as String,
        role: json['role'] as String,
        joinedAt: DateTime.parse(json['joinedAt'] as String),
        isOwner: json['isOwner'] as bool? ?? false,
      );
}

class CompanyJob {
  const CompanyJob({
    required this.id,
    required this.title,
    required this.sector,
    required this.location,
    required this.slots,
    required this.isActive,
    required this.createdAt,
    this.applicationsTotal,
    this.applicationsPending,
  });

  final String id;
  final String title;
  final String sector;
  final String location;
  final int slots;
  final bool isActive;
  final DateTime createdAt;
  final int? applicationsTotal;
  final int? applicationsPending;

  factory CompanyJob.fromJson(Map<String, dynamic> json) {
    final applications = json['applications'] as Map<String, dynamic>?;
    return CompanyJob(
      id: json['id'] as String,
      title: json['title'] as String,
      sector: json['sector'] as String,
      location: json['location'] as String,
      slots: (json['slots'] as num).toInt(),
      isActive: json['isActive'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
      applicationsTotal: (applications?['total'] as num?)?.toInt(),
      applicationsPending: (applications?['pending'] as num?)?.toInt(),
    );
  }
}

class CompanyDetail {
  const CompanyDetail({
    required this.id,
    required this.name,
    required this.sector,
    required this.city,
    required this.status,
    required this.isOwner,
    required this.members,
    required this.jobs,
    required this.createdAt,
    this.description,
    this.phone,
    this.projectId,
    this.projectTitle,
  });

  final String id;
  final String name;
  final String sector;
  final String city;
  final String? description;
  final String? phone;
  final String status;
  final bool isOwner;
  final String? projectId;
  final String? projectTitle;
  final List<CompanyMember> members;
  final List<CompanyJob> jobs;
  final DateTime createdAt;

  bool get isActive => status == 'ACTIVE';

  factory CompanyDetail.fromJson(Map<String, dynamic> json) {
    final project = json['project'] as Map<String, dynamic>?;
    return CompanyDetail(
      id: json['id'] as String,
      name: json['name'] as String,
      sector: json['sector'] as String,
      city: json['city'] as String,
      description: json['description'] as String?,
      phone: json['phone'] as String?,
      status: json['status'] as String,
      isOwner: json['isOwner'] as bool? ?? false,
      projectId: project?['id'] as String?,
      projectTitle: project?['title'] as String?,
      members: listOf(json['members'], CompanyMember.fromJson),
      jobs: listOf(json['jobs'], CompanyJob.fromJson),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class JobApplicant {
  const JobApplicant({
    required this.id,
    required this.status,
    required this.createdAt,
    required this.allowedTransitions,
    required this.identityVerified,
    this.message,
    this.firstName,
    this.lastName,
    this.city,
    this.phone,
  });

  final String id;
  final String status;
  final String? message;
  final DateTime createdAt;
  final List<String> allowedTransitions;
  final String? firstName;
  final String? lastName;
  final String? city;
  final bool identityVerified;

  /// Visible uniquement une fois la prise de contact décidée.
  final String? phone;

  String get fullName => [firstName, lastName].whereType<String>().join(' ');

  factory JobApplicant.fromJson(Map<String, dynamic> json) {
    final candidate = json['candidate'] as Map<String, dynamic>? ?? const {};
    return JobApplicant(
      id: json['id'] as String,
      status: json['status'] as String,
      message: json['message'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      allowedTransitions: (json['allowedTransitions'] as List<dynamic>? ?? const []).cast<String>(),
      firstName: candidate['firstName'] as String?,
      lastName: candidate['lastName'] as String?,
      city: candidate['city'] as String?,
      identityVerified: candidate['identityVerified'] as bool? ?? false,
      phone: candidate['phone'] as String?,
    );
  }
}

class JobApplications {
  const JobApplications({required this.jobTitle, required this.isActive, required this.items});
  final String jobTitle;
  final bool isActive;
  final List<JobApplicant> items;

  factory JobApplications.fromJson(Map<String, dynamic> json) {
    final job = json['job'] as Map<String, dynamic>;
    return JobApplications(
      jobTitle: job['title'] as String,
      isActive: job['isActive'] as bool? ?? false,
      items: listOf(json['items'], JobApplicant.fromJson),
    );
  }
}

class CompaniesRepository {
  CompaniesRepository({required this.client});
  final ApiClient client;

  CompanyDetail _detail(dynamic json) => CompanyDetail.fromJson(json as Map<String, dynamic>);

  Future<List<CompanySummary>> mine() =>
      client.call((dio) => dio.get('/companies/me'), (json) => listOf((json as Map<String, dynamic>)['items'], CompanySummary.fromJson));

  Future<CompanyDetail> company(String id) => client.call((dio) => dio.get('/companies/$id'), _detail);

  Future<CompanyDetail> create(Map<String, dynamic> body) => client.call((dio) => dio.post('/companies', data: body), _detail);

  Future<CompanyDetail> addMember(String id, {required String fullName, required String role}) =>
      client.call((dio) => dio.post('/companies/$id/members', data: {'fullName': fullName, 'role': role}), _detail);

  Future<CompanyDetail> removeMember(String id, String memberId) => client.call((dio) => dio.delete('/companies/$id/members/$memberId'), _detail);

  Future<CompanyDetail> publishJob(String id, Map<String, dynamic> body) => client.call((dio) => dio.post('/companies/$id/jobs', data: body), _detail);

  Future<CompanyDetail> closeJob(String id, String jobId) => client.call((dio) => dio.post('/companies/$id/jobs/$jobId/close'), _detail);

  Future<JobApplications> applications(String id, String jobId) => client.call(
        (dio) => dio.get('/companies/$id/jobs/$jobId/applications'),
        (json) => JobApplications.fromJson(json as Map<String, dynamic>),
      );

  Future<JobApplications> updateApplication(String id, String applicationId, String status) => client.call(
        (dio) => dio.patch('/companies/$id/applications/$applicationId', data: {'status': status}),
        (json) => JobApplications.fromJson(json as Map<String, dynamic>),
      );
}

final companiesRepositoryProvider = Provider<CompaniesRepository>((ref) => CompaniesRepository(client: ref.watch(apiClientProvider)));

final myCompaniesProvider = FutureProvider.autoDispose<List<CompanySummary>>((ref) => ref.watch(companiesRepositoryProvider).mine());

final companyProvider = FutureProvider.autoDispose.family<CompanyDetail, String>((ref, id) => ref.watch(companiesRepositoryProvider).company(id));

final jobApplicationsProvider = FutureProvider.autoDispose.family<JobApplications, (String, String)>(
  (ref, ids) => ref.watch(companiesRepositoryProvider).applications(ids.$1, ids.$2),
);
