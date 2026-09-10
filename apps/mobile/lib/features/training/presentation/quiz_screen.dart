import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../application/training_providers.dart';
import '../domain/training_models.dart';

class QuizScreen extends ConsumerStatefulWidget {
  const QuizScreen({super.key, required this.moduleId});
  final String moduleId;

  @override
  ConsumerState<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends ConsumerState<QuizScreen> {
  final Map<String, int> _selectedAnswers = {};
  bool _isSubmitting = false;
  Map<String, dynamic>? _result;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Validation du Quiz'),
      ),
      body: FutureBuilder<QuizData>(
        future: ref.read(trainingRepositoryProvider).getQuiz(widget.moduleId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: AppErrorState(
                message: 'Impossible de charger le quiz.',
                onRetry: () => setState(() {}),
              ),
            );
          }

          final quiz = snapshot.data!;

          if (_result != null) {
            return _buildResultView(context, quiz);
          }

          final allAnswered = quiz.questions.every((q) => _selectedAnswers.containsKey(q.id));

          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(BSpace.x4),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(BSpace.x4),
                      decoration: BoxDecoration(
                        color: BColors.brandOrange.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(BRadius.md),
                        border: Border.all(color: BColors.brandOrange.withValues(alpha: 0.3)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.info_outline, color: BColors.brandOrange),
                          const SizedBox(width: BSpace.x3),
                          Expanded(
                            child: Text(
                              'Score minimum requis pour valider : ${quiz.passScore}%\nRépondez à toutes les questions ci-dessous.',
                              style: const TextStyle(fontSize: 13, height: 1.4, color: BColors.textPrimary),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: BSpace.x4),

                    ...quiz.questions.asMap().entries.map((entry) {
                      final index = entry.key;
                      final question = entry.value;
                      return _buildQuestionCard(index + 1, question);
                    }),
                  ],
                ),
              ),

              Container(
                padding: const EdgeInsets.all(BSpace.x4),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: BColors.border)),
                ),
                child: SafeArea(
                  child: SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: allAnswered ? BColors.brandOrange : Colors.grey,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                      ),
                      onPressed: (!allAnswered || _isSubmitting)
                          ? null
                          : () => _submitQuiz(quiz),
                      child: _isSubmitting
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text('Valider mes réponses', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildQuestionCard(int number, QuizQuestionItem q) {
    final selectedIndex = _selectedAnswers[q.id];

    return Container(
      margin: const EdgeInsets.only(bottom: BSpace.x4),
      padding: const EdgeInsets.all(BSpace.x4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(BRadius.lg),
        border: Border.all(color: BColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 12,
                backgroundColor: BColors.primaryNavy,
                child: Text('$number', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(width: BSpace.x3),
              Expanded(
                child: Text(
                  q.question,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: BColors.textPrimary),
                ),
              ),
            ],
          ),
          const SizedBox(height: BSpace.x3),
          ...q.options.asMap().entries.map((optEntry) {
            final optIndex = optEntry.key;
            final optText = optEntry.value;
            final isSelected = selectedIndex == optIndex;

            return Padding(
              padding: const EdgeInsets.only(bottom: BSpace.x2),
              child: InkWell(
                borderRadius: BorderRadius.circular(BRadius.md),
                onTap: () => setState(() => _selectedAnswers[q.id] = optIndex),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: BSpace.x3, vertical: BSpace.x3),
                  decoration: BoxDecoration(
                    color: isSelected ? BColors.brandBlue.withValues(alpha: 0.1) : BColors.surface,
                    borderRadius: BorderRadius.circular(BRadius.md),
                    border: Border.all(
                      color: isSelected ? BColors.brandBlue : BColors.border,
                      width: isSelected ? 1.5 : 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        isSelected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                        color: isSelected ? BColors.brandBlue : Colors.grey,
                        size: 20,
                      ),
                      const SizedBox(width: BSpace.x3),
                      Expanded(
                        child: Text(
                          optText,
                          style: TextStyle(
                            fontSize: 14,
                            color: isSelected ? BColors.primaryNavy : BColors.textPrimary,
                            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  Future<void> _submitQuiz(QuizData quiz) async {
    setState(() => _isSubmitting = true);
    try {
      final answersList = _selectedAnswers.entries
          .map((e) => {'questionId': e.key, 'selectedIndex': e.value})
          .toList();

      final res = await ref.read(trainingRepositoryProvider).submitQuiz(widget.moduleId, answersList);
      ref.invalidate(trainingModulesProvider);
      ref.invalidate(certificatesProvider);

      setState(() => _result = res);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur: $e')));
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  Widget _buildResultView(BuildContext context, QuizData quiz) {
    final passed = (_result!['passed'] as bool?) ?? false;
    final score = (_result!['score'] as num?)?.toInt() ?? 0;
    final passScore = (_result!['passScore'] as num?)?.toInt() ?? 70;
    final certIssued = (_result!['certificationIssued'] as bool?) ?? false;

    return ListView(
      padding: const EdgeInsets.all(BSpace.x6),
      children: [
        Center(
          child: Column(
            children: [
              CircleAvatar(
                radius: 40,
                backgroundColor: passed ? BColors.brandGreen.withValues(alpha: 0.15) : Colors.red.withValues(alpha: 0.15),
                child: Icon(
                  passed ? Icons.check_circle : Icons.cancel,
                  color: passed ? BColors.brandGreen : Colors.red,
                  size: 48,
                ),
              ),
              const SizedBox(height: BSpace.x4),
              Text(
                passed ? 'Félicitations ! Quiz Validé' : 'Score insuffisant',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: BSpace.x2),
              Text(
                'Votre score : $score% (Minimum requis : $passScore%)',
                style: TextStyle(
                  fontSize: 15,
                  color: passed ? BColors.brandGreen : Colors.red,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (certIssued) ...[
                const SizedBox(height: BSpace.x4),
                Container(
                  padding: const EdgeInsets.all(BSpace.x4),
                  decoration: BoxDecoration(
                    color: BColors.brandOrange.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(BRadius.lg),
                    border: Border.all(color: BColors.brandOrange),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.workspace_premium, color: BColors.brandOrange, size: 32),
                      SizedBox(width: BSpace.x3),
                      Expanded(
                        child: Text(
                          '🎓 Vous venez de débloquer votre Certificat d’Entrepreneur Benskin Impact !',
                          style: TextStyle(color: BColors.primaryNavy, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: BSpace.x6),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: passed ? BColors.brandGreen : BColors.brandBlue,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: () {
                    if (certIssued) {
                      context.pushReplacement('/training/certificate');
                    } else {
                      context.pop();
                    }
                  },
                  child: Text(passed ? 'Retour aux modules' : 'Recommencer le quiz'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
