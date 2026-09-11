import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/app_failure.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/states.dart';
import '../application/training_providers.dart';
import '../domain/training_models.dart';

/// Quiz de validation (cahier §7.15) : les réponses sont corrigées par le serveur.
class QuizScreen extends ConsumerStatefulWidget {
  const QuizScreen({super.key, required this.moduleId});
  final String moduleId;

  @override
  ConsumerState<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends ConsumerState<QuizScreen> {
  final _answers = <String, int>{};
  QuizResult? _result;
  bool _submitting = false;
  String? _error;

  Future<void> _submit(QuizData quiz) async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final result = await ref.read(trainingRepositoryProvider).submitQuiz(widget.moduleId, _answers);
      ref
        ..invalidate(trainingOverviewProvider)
        ..invalidate(moduleDetailProvider(widget.moduleId))
        ..invalidate(certificatesProvider);
      setState(() => _result = result);
    } on NetworkFailure {
      setState(() => _error = 'Le quiz est corrigé par le serveur : connectez-vous au réseau pour envoyer vos réponses.');
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final quiz = ref.watch(quizProvider(widget.moduleId));
    return Scaffold(
      appBar: AppBar(title: const Text('Quiz')),
      body: quiz.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 4)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(quizProvider(widget.moduleId))),
        data: (q) => _result == null ? _questions(q) : _resultView(q, _result!),
      ),
    );
  }

  Widget _questions(QuizData quiz) {
    final complete = quiz.questions.every((question) => _answers.containsKey(question.id));
    return Column(children: [
      Expanded(
        child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
          Text(quiz.title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          Text('Score requis : ${quiz.passScore} % · ${quiz.attemptsLeftToday} tentative${quiz.attemptsLeftToday > 1 ? 's' : ''} restante${quiz.attemptsLeftToday > 1 ? 's' : ''} aujourd’hui',
              style: const TextStyle(color: BColors.textMuted)),
          const SizedBox(height: BSpace.x4),
          for (final (index, question) in quiz.questions.indexed)
            Card(
              margin: const EdgeInsets.only(bottom: BSpace.x3),
              child: Padding(
                padding: const EdgeInsets.all(BSpace.x4),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${index + 1}. ${question.question}', style: const TextStyle(fontWeight: FontWeight.w800, height: 1.35)),
                  const SizedBox(height: BSpace.x2),
                  RadioGroup<int>(
                    groupValue: _answers[question.id],
                    onChanged: (value) {
                      if (value != null) setState(() => _answers[question.id] = value);
                    },
                    child: Column(children: [
                      for (final (optionIndex, option) in question.options.indexed)
                        RadioListTile<int>(contentPadding: EdgeInsets.zero, value: optionIndex, title: Text(option)),
                    ]),
                  ),
                ]),
              ),
            ),
        ]),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(BSpace.x4),
          child: Column(children: [
            if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x3)],
            LoadingButton(
              label: complete ? 'Valider mes réponses' : 'Répondez à toutes les questions',
              loading: _submitting,
              onPressed: complete && quiz.attemptsLeftToday > 0 ? () => _submit(quiz) : null,
            ),
          ]),
        ),
      ),
    ]);
  }

  Widget _resultView(QuizData quiz, QuizResult result) {
    final byId = {for (final item in result.results) item.questionId: item};
    return ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(BSpace.x6),
          child: Column(children: [
            Icon(result.passed ? Icons.emoji_events_rounded : Icons.replay_rounded, size: 56, color: result.passed ? BColors.growth600 : BColors.warning700),
            const SizedBox(height: BSpace.x3),
            Text(result.passed ? 'Quiz validé !' : 'Pas encore validé', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: BSpace.x2),
            Text('Score : ${result.score} % (${result.correctCount}/${result.totalQuestions}) · requis : ${result.passScore} %', textAlign: TextAlign.center),
            if (!result.passed) ...[
              const SizedBox(height: BSpace.x2),
              Text(
                'Relisez les leçons puis réessayez. Il vous reste ${result.attemptsLeftToday} tentative${result.attemptsLeftToday > 1 ? 's' : ''} aujourd’hui.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: BColors.textMuted),
              ),
            ],
          ]),
        ),
      ),
      if (result.certificate != null) ...[
        const SizedBox(height: BSpace.x3),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: BColors.accent500),
          onPressed: () => context.pushReplacement('/training/certificate'),
          icon: const Icon(Icons.workspace_premium_rounded),
          label: const Text('Voir mon certificat'),
        ),
      ],
      const SizedBox(height: BSpace.x4),
      for (final (index, question) in quiz.questions.indexed)
        if (byId[question.id] case final QuestionResult item)
          Card(
            margin: const EdgeInsets.only(bottom: BSpace.x3),
            child: Padding(
              padding: const EdgeInsets.all(BSpace.x4),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(item.isCorrect ? Icons.check_circle_rounded : Icons.cancel_rounded, color: item.isCorrect ? BColors.growth600 : BColors.danger500),
                  const SizedBox(width: BSpace.x2),
                  Expanded(child: Text('${index + 1}. ${question.question}', style: const TextStyle(fontWeight: FontWeight.w700))),
                ]),
                if (item.correctIndex != null && item.correctIndex! < question.options.length) ...[
                  const SizedBox(height: BSpace.x2),
                  Text('Bonne réponse : ${question.options[item.correctIndex!]}', style: const TextStyle(color: BColors.growth700, fontWeight: FontWeight.w600)),
                ],
                if (item.explanation != null) ...[const SizedBox(height: BSpace.x1), Text(item.explanation!, style: const TextStyle(color: BColors.textMuted))],
              ]),
            ),
          ),
      const SizedBox(height: BSpace.x2),
      OutlinedButton(onPressed: () => context.pushReplacement('/training/module/${widget.moduleId}'), child: const Text('Retour au module')),
    ]);
  }
}
