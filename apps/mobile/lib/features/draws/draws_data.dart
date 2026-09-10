// Tirages et parcours programme : modèles, accès API et providers.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/providers.dart';

DateTime? _date(Object? value) => value == null ? null : DateTime.parse(value as String);

class DrawInfo {
  const DrawInfo({
    required this.id,
    required this.code,
    required this.title,
    required this.status,
    required this.scheduledAt,
    required this.winnerCount,
    required this.minPaidDays,
    required this.windowDays,
    this.eligibleCount,
    this.snapshotAt,
    this.snapshotHash,
    this.seedCommitment,
    this.publishedAt,
  });

  final String id;
  final String code;
  final String title;

  /// DRAFT, FROZEN, EXECUTED, PUBLISHED, CANCELLED
  final String status;
  final DateTime scheduledAt;
  final int winnerCount;
  final int minPaidDays;
  final int windowDays;
  final int? eligibleCount;
  final DateTime? snapshotAt;
  final String? snapshotHash;
  final String? seedCommitment;
  final DateTime? publishedAt;

  bool get isPublished => status == 'PUBLISHED';
  bool get isFrozen => status == 'FROZEN' || status == 'EXECUTED';

  factory DrawInfo.fromJson(Map<String, dynamic> json) => DrawInfo(
        id: json['id'] as String,
        code: json['code'] as String,
        title: json['title'] as String,
        status: json['status'] as String,
        scheduledAt: DateTime.parse(json['scheduledAt'] as String),
        winnerCount: (json['winnerCount'] as num).toInt(),
        minPaidDays: (json['minPaidDays'] as num).toInt(),
        windowDays: (json['windowDays'] as num).toInt(),
        eligibleCount: (json['eligibleCount'] as num?)?.toInt(),
        snapshotAt: _date(json['snapshotAt']),
        snapshotHash: json['snapshotHash'] as String?,
        seedCommitment: json['seedCommitment'] as String?,
        publishedAt: _date(json['publishedAt']),
      );
}

class DrawEligibility {
  const DrawEligibility({
    required this.eligible,
    required this.paidDays,
    required this.requiredDays,
    required this.windowDays,
    required this.reasons,
  });

  final bool eligible;
  final int paidDays;
  final int requiredDays;
  final int windowDays;
  final List<String> reasons;

  factory DrawEligibility.fromJson(Map<String, dynamic> json) => DrawEligibility(
        eligible: json['eligible'] as bool,
        paidDays: (json['paidDays'] as num).toInt(),
        requiredDays: (json['requiredDays'] as num).toInt(),
        windowDays: (json['windowDays'] as num).toInt(),
        reasons: (json['reasons'] as List<dynamic>).cast<String>(),
      );
}

class NextDraw {
  const NextDraw({required this.draw, required this.eligibility, this.included, this.participantToken});

  final DrawInfo? draw;
  final DrawEligibility eligibility;

  /// Renseigné une fois la liste des participants figée.
  final bool? included;
  final String? participantToken;

  factory NextDraw.fromJson(Map<String, dynamic> json) {
    final participation = json['participation'] as Map<String, dynamic>?;
    return NextDraw(
      draw: json['draw'] == null ? null : DrawInfo.fromJson(json['draw'] as Map<String, dynamic>),
      eligibility: DrawEligibility.fromJson(json['eligibility'] as Map<String, dynamic>),
      included: participation?['included'] as bool?,
      participantToken: participation?['participantToken'] as String?,
    );
  }
}

class DrawDetail {
  const DrawDetail({required this.draw, required this.included, this.participantToken, this.selected, this.rank});

  final DrawInfo draw;
  final bool included;
  final String? participantToken;
  final bool? selected;
  final int? rank;

  factory DrawDetail.fromJson(Map<String, dynamic> json) {
    final result = json['myResult'] as Map<String, dynamic>;
    return DrawDetail(
      draw: DrawInfo.fromJson(json['draw'] as Map<String, dynamic>),
      included: result['included'] as bool,
      participantToken: result['participantToken'] as String?,
      selected: result['selected'] as bool?,
      rank: (result['rank'] as num?)?.toInt(),
    );
  }
}

class DrawWinnerToken {
  const DrawWinnerToken({required this.rank, required this.token, required this.score});
  final int rank;
  final String token;
  final String score;
}

class DrawAudit {
  const DrawAudit({
    required this.algorithmVersion,
    required this.method,
    required this.participantsCount,
    required this.winners,
    this.snapshotHash,
    this.seedCommitment,
    this.seed,
    this.resultHash,
    this.checks,
  });

  final String algorithmVersion;
  final String method;
  final int participantsCount;
  final List<DrawWinnerToken> winners;
  final String? snapshotHash;
  final String? seedCommitment;
  final String? seed;
  final String? resultHash;

  /// Vérifications recalculées : liste, graine, gagnants, empreinte des résultats.
  final Map<String, bool>? checks;

  bool get valid => checks?['valid'] ?? false;

  factory DrawAudit.fromJson(Map<String, dynamic> json) => DrawAudit(
        algorithmVersion: json['algorithmVersion'] as String,
        method: json['method'] as String,
        participantsCount: (json['participants'] as List<dynamic>).length,
        winners: (json['winners'] as List<dynamic>)
            .map((w) => w as Map<String, dynamic>)
            .map((w) => DrawWinnerToken(rank: (w['rank'] as num).toInt(), token: w['token'] as String, score: w['score'] as String))
            .toList(),
        snapshotHash: json['snapshotHash'] as String?,
        seedCommitment: json['seedCommitment'] as String?,
        seed: json['seed'] as String?,
        resultHash: json['resultHash'] as String?,
        checks: (json['verification'] as Map<String, dynamic>?)?.map((k, v) => MapEntry(k, v as bool)),
      );
}

class ProgramMilestone {
  const ProgramMilestone({
    required this.code,
    required this.title,
    required this.status,
    required this.detail,
    this.progressCurrent,
    this.progressTarget,
    this.actionLabel,
    this.actionLink,
  });

  final String code;
  final String title;

  /// DONE, IN_PROGRESS, TODO, LOCKED
  final String status;
  final String detail;
  final int? progressCurrent;
  final int? progressTarget;
  final String? actionLabel;
  final String? actionLink;

  factory ProgramMilestone.fromJson(Map<String, dynamic> json) {
    final progress = json['progress'] as Map<String, dynamic>?;
    final action = json['action'] as Map<String, dynamic>?;
    return ProgramMilestone(
      code: json['code'] as String,
      title: json['title'] as String,
      status: json['status'] as String,
      detail: json['detail'] as String,
      progressCurrent: (progress?['current'] as num?)?.toInt(),
      progressTarget: (progress?['target'] as num?)?.toInt(),
      actionLabel: action?['label'] as String?,
      actionLink: action?['deepLink'] as String?,
    );
  }
}

class ProgramOverview {
  const ProgramOverview({
    required this.programStatus,
    required this.completionPercent,
    required this.milestones,
    this.beneficiaryStatus,
    this.mentorName,
    this.drawTitle,
    this.nextActionLabel,
    this.nextActionLink,
  });

  final String programStatus;
  final int completionPercent;
  final List<ProgramMilestone> milestones;
  final String? beneficiaryStatus;
  final String? mentorName;
  final String? drawTitle;
  final String? nextActionLabel;
  final String? nextActionLink;

  factory ProgramOverview.fromJson(Map<String, dynamic> json) {
    final beneficiary = json['beneficiary'] as Map<String, dynamic>?;
    final next = json['nextAction'] as Map<String, dynamic>?;
    return ProgramOverview(
      programStatus: json['programStatus'] as String,
      completionPercent: (json['completionPercent'] as num).toInt(),
      milestones: (json['milestones'] as List<dynamic>).map((m) => ProgramMilestone.fromJson(m as Map<String, dynamic>)).toList(),
      beneficiaryStatus: beneficiary?['status'] as String?,
      mentorName: beneficiary?['mentorName'] as String?,
      drawTitle: beneficiary?['drawTitle'] as String?,
      nextActionLabel: next?['label'] as String?,
      nextActionLink: next?['deepLink'] as String?,
    );
  }
}

class DrawsRepository {
  DrawsRepository({required this.client});
  final ApiClient client;

  Future<NextDraw> next() => client.call((dio) => dio.get('/draws/next'), (json) => NextDraw.fromJson(json as Map<String, dynamic>));

  Future<List<DrawInfo>> published() => client.call(
        (dio) => dio.get('/draws', queryParameters: {'limit': 20}),
        (json) => ((json as Map<String, dynamic>)['items'] as List<dynamic>)
            .map((e) => DrawInfo.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Future<DrawDetail> detail(String id) =>
      client.call((dio) => dio.get('/draws/$id'), (json) => DrawDetail.fromJson(json as Map<String, dynamic>));

  Future<DrawAudit> audit(String id) =>
      client.call((dio) => dio.get('/draws/$id/audit'), (json) => DrawAudit.fromJson(json as Map<String, dynamic>));

  Future<ProgramOverview> program() =>
      client.call((dio) => dio.get('/program/me'), (json) => ProgramOverview.fromJson(json as Map<String, dynamic>));
}

final drawsRepositoryProvider = Provider<DrawsRepository>((ref) => DrawsRepository(client: ref.watch(apiClientProvider)));

final nextDrawProvider = FutureProvider.autoDispose<NextDraw>((ref) => ref.watch(drawsRepositoryProvider).next());

final publishedDrawsProvider = FutureProvider.autoDispose<List<DrawInfo>>((ref) => ref.watch(drawsRepositoryProvider).published());

final drawDetailProvider = FutureProvider.autoDispose.family<DrawDetail, String>(
  (ref, id) => ref.watch(drawsRepositoryProvider).detail(id),
);

final drawAuditProvider = FutureProvider.autoDispose.family<DrawAudit, String>(
  (ref, id) => ref.watch(drawsRepositoryProvider).audit(id),
);

final programProvider = FutureProvider.autoDispose<ProgramOverview>((ref) => ref.watch(drawsRepositoryProvider).program());
