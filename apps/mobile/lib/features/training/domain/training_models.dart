class TrainingModuleItem {
  const TrainingModuleItem({
    required this.id,
    required this.month,
    required this.title,
    required this.description,
    required this.durationMinutes,
    required this.order,
    this.iconName,
    required this.totalLessons,
    required this.completedLessons,
    required this.progressPercent,
    required this.status,
    this.latestQuizScore,
  });

  final String id;
  final int month;
  final String title;
  final String description;
  final int durationMinutes;
  final int order;
  final String? iconName;
  final int totalLessons;
  final int completedLessons;
  final int progressPercent;
  final String status; // COMPLETED, IN_PROGRESS, LOCKED
  final int? latestQuizScore;

  bool get isCompleted => status == 'COMPLETED';
  bool get isInProgress => status == 'IN_PROGRESS';
  bool get isLocked => status == 'LOCKED';

  factory TrainingModuleItem.fromJson(Map<String, dynamic> json) => TrainingModuleItem(
        id: json['id'] as String,
        month: (json['month'] as num).toInt(),
        title: json['title'] as String,
        description: json['description'] as String,
        durationMinutes: (json['durationMinutes'] as num).toInt(),
        order: (json['order'] as num).toInt(),
        iconName: json['iconName'] as String?,
        totalLessons: (json['totalLessons'] as num).toInt(),
        completedLessons: (json['completedLessons'] as num).toInt(),
        progressPercent: (json['progressPercent'] as num).toInt(),
        status: json['status'] as String,
        latestQuizScore: (json['latestQuizScore'] as num?)?.toInt(),
      );
}

class LessonDetail {
  const LessonDetail({
    required this.id,
    required this.moduleId,
    required this.moduleMonth,
    required this.moduleTitle,
    required this.title,
    this.description,
    required this.durationMinutes,
    required this.contentType,
    this.audioUrl,
    required this.markdownContent,
    required this.order,
    required this.isCompleted,
  });

  final String id;
  final String moduleId;
  final int moduleMonth;
  final String moduleTitle;
  final String title;
  final String? description;
  final int durationMinutes;
  final String contentType;
  final String? audioUrl;
  final String markdownContent;
  final int order;
  final bool isCompleted;

  factory LessonDetail.fromJson(Map<String, dynamic> json) => LessonDetail(
        id: json['id'] as String,
        moduleId: json['moduleId'] as String,
        moduleMonth: (json['moduleMonth'] as num).toInt(),
        moduleTitle: json['moduleTitle'] as String,
        title: json['title'] as String,
        description: json['description'] as String?,
        durationMinutes: (json['durationMinutes'] as num).toInt(),
        contentType: json['contentType'] as String,
        audioUrl: json['audioUrl'] as String?,
        markdownContent: json['markdownContent'] as String,
        order: (json['order'] as num).toInt(),
        isCompleted: json['isCompleted'] as bool,
      );
}

class QuizQuestionItem {
  const QuizQuestionItem({
    required this.id,
    required this.question,
    required this.options,
    required this.order,
  });

  final String id;
  final String question;
  final List<String> options;
  final int order;

  factory QuizQuestionItem.fromJson(Map<String, dynamic> json) => QuizQuestionItem(
        id: json['id'] as String,
        question: json['question'] as String,
        options: (json['options'] as List<dynamic>).map((e) => e.toString()).toList(),
        order: (json['order'] as num).toInt(),
      );
}

class QuizData {
  const QuizData({
    required this.id,
    required this.moduleId,
    required this.title,
    required this.passScore,
    required this.questions,
  });

  final String id;
  final String moduleId;
  final String title;
  final int passScore;
  final List<QuizQuestionItem> questions;

  factory QuizData.fromJson(Map<String, dynamic> json) => QuizData(
        id: json['id'] as String,
        moduleId: json['moduleId'] as String,
        title: json['title'] as String,
        passScore: (json['passScore'] as num).toInt(),
        questions: (json['questions'] as List<dynamic>)
            .map((q) => QuizQuestionItem.fromJson(q as Map<String, dynamic>))
            .toList(),
      );
}

class CertificateItem {
  const CertificateItem({
    required this.id,
    required this.certificateNumber,
    required this.title,
    required this.issuedAt,
    required this.verificationHash,
  });

  final String id;
  final String certificateNumber;
  final String title;
  final DateTime issuedAt;
  final String verificationHash;

  factory CertificateItem.fromJson(Map<String, dynamic> json) => CertificateItem(
        id: json['id'] as String,
        certificateNumber: json['certificateNumber'] as String,
        title: json['title'] as String,
        issuedAt: DateTime.parse(json['issuedAt'] as String),
        verificationHash: json['verificationHash'] as String,
      );
}
