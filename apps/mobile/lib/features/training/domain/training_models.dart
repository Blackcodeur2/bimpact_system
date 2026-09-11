import '../../../core/data/json.dart';

// Formation entrepreneuriale (cahier §7.13-7.16). Statuts et scores sont calculés par le serveur.

class TrainingCurrent {
  const TrainingCurrent({required this.moduleId, required this.month, required this.title, required this.quizReady, this.nextLessonId, this.nextLessonTitle});
  final String moduleId;
  final int month;
  final String title;
  final String? nextLessonId;
  final String? nextLessonTitle;
  final bool quizReady;

  factory TrainingCurrent.fromJson(Map<String, dynamic> json) {
    final next = json['nextLesson'] as Map<String, dynamic>?;
    return TrainingCurrent(
      moduleId: json['moduleId'] as String,
      month: (json['month'] as num).toInt(),
      title: json['title'] as String,
      nextLessonId: next?['id'] as String?,
      nextLessonTitle: next?['title'] as String?,
      quizReady: json['quizReady'] as bool? ?? false,
    );
  }
}

class TrainingSummary {
  const TrainingSummary({
    required this.totalModules,
    required this.completedModules,
    required this.progressPercent,
    required this.certified,
    this.current,
  });

  final int totalModules;
  final int completedModules;
  final int progressPercent;
  final bool certified;
  final TrainingCurrent? current;

  factory TrainingSummary.fromJson(Map<String, dynamic> json) => TrainingSummary(
        totalModules: (json['totalModules'] as num?)?.toInt() ?? 0,
        completedModules: (json['completedModules'] as num?)?.toInt() ?? 0,
        progressPercent: (json['progressPercent'] as num?)?.toInt() ?? 0,
        certified: json['certified'] as bool? ?? false,
        current: json['current'] == null ? null : TrainingCurrent.fromJson(json['current'] as Map<String, dynamic>),
      );
}

class TrainingModuleItem {
  const TrainingModuleItem({
    required this.id,
    required this.month,
    required this.title,
    required this.description,
    required this.durationMinutes,
    required this.totalLessons,
    required this.completedLessons,
    required this.status,
    required this.hasQuiz,
    this.bestScore,
  });

  final String id;
  final int month;
  final String title;
  final String description;
  final int durationMinutes;
  final int totalLessons;
  final int completedLessons;

  /// LOCKED, AVAILABLE, IN_PROGRESS, COMPLETED
  final String status;
  final bool hasQuiz;
  final int? bestScore;

  bool get isLocked => status == 'LOCKED';
  bool get isCompleted => status == 'COMPLETED';

  factory TrainingModuleItem.fromJson(Map<String, dynamic> json) => TrainingModuleItem(
        id: json['id'] as String,
        month: (json['month'] as num).toInt(),
        title: json['title'] as String,
        description: json['description'] as String,
        durationMinutes: (json['durationMinutes'] as num).toInt(),
        totalLessons: (json['totalLessons'] as num).toInt(),
        completedLessons: (json['completedLessons'] as num).toInt(),
        status: json['status'] as String,
        hasQuiz: json['hasQuiz'] as bool? ?? json['quiz'] != null,
        bestScore: (json['bestScore'] as num?)?.toInt(),
      );
}

class TrainingOverview {
  const TrainingOverview({required this.summary, required this.modules});
  final TrainingSummary summary;
  final List<TrainingModuleItem> modules;

  factory TrainingOverview.fromJson(Map<String, dynamic> json) => TrainingOverview(
        summary: TrainingSummary.fromJson(json['summary'] as Map<String, dynamic>),
        modules: listOf(json['modules'], TrainingModuleItem.fromJson),
      );
}

class LessonItem {
  const LessonItem({required this.id, required this.title, required this.durationMinutes, required this.isCompleted, required this.progressPercent, this.description});
  final String id;
  final String title;
  final String? description;
  final int durationMinutes;
  final bool isCompleted;
  final int progressPercent;

  factory LessonItem.fromJson(Map<String, dynamic> json) => LessonItem(
        id: json['id'] as String,
        title: json['title'] as String,
        description: json['description'] as String?,
        durationMinutes: (json['durationMinutes'] as num).toInt(),
        isCompleted: json['isCompleted'] as bool? ?? false,
        progressPercent: (json['progressPercent'] as num?)?.toInt() ?? 0,
      );
}

class ModuleQuizInfo {
  const ModuleQuizInfo({
    required this.title,
    required this.passScore,
    required this.available,
    required this.attemptsLeftToday,
    this.bestScore,
    this.lastScore,
    this.lastPassed,
  });

  final String title;
  final int passScore;
  final bool available;
  final int attemptsLeftToday;
  final int? bestScore;
  final int? lastScore;
  final bool? lastPassed;

  factory ModuleQuizInfo.fromJson(Map<String, dynamic> json) {
    final last = json['lastAttempt'] as Map<String, dynamic>?;
    return ModuleQuizInfo(
      title: json['title'] as String,
      passScore: (json['passScore'] as num).toInt(),
      available: json['available'] as bool? ?? false,
      attemptsLeftToday: (json['attemptsLeftToday'] as num?)?.toInt() ?? 0,
      bestScore: (json['bestScore'] as num?)?.toInt(),
      lastScore: (last?['score'] as num?)?.toInt(),
      lastPassed: last?['passed'] as bool?,
    );
  }
}

class ModuleDetail {
  const ModuleDetail({required this.module, required this.lessons, this.quiz});
  final TrainingModuleItem module;
  final List<LessonItem> lessons;
  final ModuleQuizInfo? quiz;

  factory ModuleDetail.fromJson(Map<String, dynamic> json) => ModuleDetail(
        module: TrainingModuleItem.fromJson(json),
        lessons: listOf(json['lessons'], LessonItem.fromJson),
        quiz: json['quiz'] == null ? null : ModuleQuizInfo.fromJson(json['quiz'] as Map<String, dynamic>),
      );
}

class LessonDetail {
  const LessonDetail({
    required this.id,
    required this.moduleId,
    required this.moduleMonth,
    required this.moduleTitle,
    required this.title,
    required this.durationMinutes,
    required this.content,
    required this.keyPoints,
    required this.isCompleted,
    required this.progressPercent,
    this.audioUrl,
    this.nextLessonId,
    this.nextLessonTitle,
  });

  final String id;
  final String moduleId;
  final int moduleMonth;
  final String moduleTitle;
  final String title;
  final int durationMinutes;
  final String? audioUrl;
  final String content;
  final List<String> keyPoints;
  final bool isCompleted;
  final int progressPercent;
  final String? nextLessonId;
  final String? nextLessonTitle;

  factory LessonDetail.fromJson(Map<String, dynamic> json) {
    final next = json['nextLesson'] as Map<String, dynamic>?;
    return LessonDetail(
      id: json['id'] as String,
      moduleId: json['moduleId'] as String,
      moduleMonth: (json['moduleMonth'] as num).toInt(),
      moduleTitle: json['moduleTitle'] as String,
      title: json['title'] as String,
      durationMinutes: (json['durationMinutes'] as num).toInt(),
      audioUrl: json['audioUrl'] as String?,
      content: json['content'] as String? ?? '',
      keyPoints: (json['keyPoints'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      isCompleted: json['isCompleted'] as bool? ?? false,
      progressPercent: (json['progressPercent'] as num?)?.toInt() ?? 0,
      nextLessonId: next?['id'] as String?,
      nextLessonTitle: next?['title'] as String?,
    );
  }
}

class QuizQuestionItem {
  const QuizQuestionItem({required this.id, required this.question, required this.options});
  final String id;
  final String question;
  final List<String> options;

  factory QuizQuestionItem.fromJson(Map<String, dynamic> json) => QuizQuestionItem(
        id: json['id'] as String,
        question: json['question'] as String,
        options: (json['options'] as List<dynamic>).map((e) => e.toString()).toList(),
      );
}

class QuizData {
  const QuizData({required this.title, required this.passScore, required this.attemptsLeftToday, required this.questions});
  final String title;
  final int passScore;
  final int attemptsLeftToday;
  final List<QuizQuestionItem> questions;

  factory QuizData.fromJson(Map<String, dynamic> json) => QuizData(
        title: json['title'] as String,
        passScore: (json['passScore'] as num).toInt(),
        attemptsLeftToday: (json['attemptsLeftToday'] as num?)?.toInt() ?? 0,
        questions: listOf(json['questions'], QuizQuestionItem.fromJson),
      );
}

class QuestionResult {
  const QuestionResult({required this.questionId, required this.isCorrect, this.correctIndex, this.explanation});
  final String questionId;
  final bool isCorrect;

  /// Communiqués par le serveur uniquement quand le quiz est réussi.
  final int? correctIndex;
  final String? explanation;

  factory QuestionResult.fromJson(Map<String, dynamic> json) => QuestionResult(
        questionId: json['questionId'] as String,
        isCorrect: json['isCorrect'] as bool? ?? false,
        correctIndex: (json['correctIndex'] as num?)?.toInt(),
        explanation: json['explanation'] as String?,
      );
}

class QuizResult {
  const QuizResult({
    required this.score,
    required this.passScore,
    required this.passed,
    required this.correctCount,
    required this.totalQuestions,
    required this.attemptsLeftToday,
    required this.results,
    this.certificate,
  });

  final int score;
  final int passScore;
  final bool passed;
  final int correctCount;
  final int totalQuestions;
  final int attemptsLeftToday;
  final List<QuestionResult> results;
  final CertificateItem? certificate;

  factory QuizResult.fromJson(Map<String, dynamic> json) => QuizResult(
        score: (json['score'] as num).toInt(),
        passScore: (json['passScore'] as num).toInt(),
        passed: json['passed'] as bool? ?? false,
        correctCount: (json['correctCount'] as num).toInt(),
        totalQuestions: (json['totalQuestions'] as num).toInt(),
        attemptsLeftToday: (json['attemptsLeftToday'] as num?)?.toInt() ?? 0,
        results: listOf(json['results'], QuestionResult.fromJson),
        certificate: json['certificate'] == null ? null : CertificateItem.fromJson(json['certificate'] as Map<String, dynamic>),
      );
}

class CertificateItem {
  const CertificateItem({
    required this.id,
    required this.certificateNumber,
    required this.title,
    required this.holderName,
    required this.issuedAt,
    required this.verificationCode,
    required this.revoked,
    required this.verificationPath,
  });

  final String id;
  final String certificateNumber;
  final String title;
  final String holderName;
  final DateTime issuedAt;
  final String verificationCode;
  final bool revoked;
  final String verificationPath;

  factory CertificateItem.fromJson(Map<String, dynamic> json) => CertificateItem(
        id: json['id'] as String,
        certificateNumber: json['certificateNumber'] as String,
        title: json['title'] as String,
        holderName: json['holderName'] as String,
        issuedAt: DateTime.parse(json['issuedAt'] as String),
        verificationCode: json['verificationCode'] as String,
        revoked: json['revoked'] as bool? ?? false,
        verificationPath: json['verificationPath'] as String,
      );
}
