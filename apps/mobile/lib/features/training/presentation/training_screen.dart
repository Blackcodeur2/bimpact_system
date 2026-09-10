import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';

enum ModuleStatus { completed, inProgress, locked }

class TrainingModule {
  const TrainingModule({
    required this.month,
    required this.title,
    required this.description,
    required this.status,
  });

  final int month;
  final String title;
  final String description;
  final ModuleStatus status;
}

const _modules = [
  TrainingModule(
    month: 1,
    title: 'Entrepreneuriat',
    description: 'Bases de l’esprit d’entreprise et posture du dirigeant.',
    status: ModuleStatus.completed,
  ),
  TrainingModule(
    month: 2,
    title: 'Étude de marché',
    description: 'Comprendre sa clientèle à Douala/Yaoundé et ses concurrents.',
    status: ModuleStatus.completed,
  ),
  TrainingModule(
    month: 3,
    title: 'Business Model',
    description: 'Définir une proposition de valeur rentable et pérenne.',
    status: ModuleStatus.completed,
  ),
  TrainingModule(
    month: 4,
    title: 'Finance & Trésorerie',
    description: 'Gestion des flux de trésorerie, marge nette et seuil de rentabilité.',
    status: ModuleStatus.inProgress,
  ),
  TrainingModule(
    month: 5,
    title: 'Marketing & Ventes',
    description: 'Stratégies d’acquisition clients et fidélisation locale.',
    status: ModuleStatus.locked,
  ),
  TrainingModule(
    month: 6,
    title: 'Management & Recrutement',
    description: 'Création d’emplois, formalisation juridique et encadrement.',
    status: ModuleStatus.locked,
  ),
];

/// Écran de formation entrepreneuriale (cahier §7.13 à §7.16 et design-board).
class TrainingScreen extends ConsumerStatefulWidget {
  const TrainingScreen({super.key});

  @override
  ConsumerState<TrainingScreen> createState() => _TrainingScreenState();
}

class _TrainingScreenState extends ConsumerState<TrainingScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _openLesson(TrainingModule module) {
    if (module.status == ModuleStatus.locked) {
      showInfoSnackBar(context, 'Terminez les modules précédents pour débloquer ce cours.');
      return;
    }
    _showLessonBottomSheet(module);
  }

  void _showLessonBottomSheet(TrainingModule module) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(BRadius.xl)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.85,
        maxChildSize: 0.95,
        minChildSize: 0.5,
        expand: false,
        builder: (_, scrollController) => ListView(
          controller: scrollController,
          padding: const EdgeInsets.all(BSpace.x6),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: BColors.neutral300, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: BSpace.x4),
            Text('Mois ${module.month} — ${module.title}',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: BColors.navy900)),
            const SizedBox(height: BSpace.x1),
            Text(module.description, style: const TextStyle(color: BColors.textMuted, fontSize: 13.5)),
            const SizedBox(height: BSpace.x6),
            // Lecteur vidéo stylisé
            Container(
              height: 180,
              decoration: BoxDecoration(
                gradient: BColors.brandGradient,
                borderRadius: BorderRadius.circular(BRadius.lg),
                boxShadow: BShadow.card,
              ),
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(BSpace.x3),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 48),
                    ),
                    const SizedBox(height: BSpace.x2),
                    const Text('Leçon 1 : Principes clés de trésorerie',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: BSpace.x6),
            const Text('Points clés du cours', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: BSpace.x3),
            const _KeyPoint(text: 'Séparer strictement les finances de la moto et les dépenses du ménage.'),
            const _KeyPoint(text: 'Prévoir un fonds d’amortissement pour les pièces d’usure et vidanges.'),
            const _KeyPoint(text: 'Calculer sa marge nette journalière avant de fixer ses objectifs de courses.'),
            const SizedBox(height: BSpace.x6),
            FilledButton.icon(
              onPressed: () {
                Navigator.pop(ctx);
                _openQuiz();
              },
              icon: const Icon(Icons.quiz_rounded),
              label: const Text('Passer le quiz d’évaluation (Question 4/10)'),
            ),
          ],
        ),
      ),
    );
  }

  void _openQuiz() {
    int selectedAnswer = 1;
    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => AlertDialog(
          title: const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Quiz d’évaluation', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              Text('4 / 10', style: TextStyle(color: BColors.primary500, fontWeight: FontWeight.w800, fontSize: 14)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Quelle est la première étape indispensable avant d’investir dans un projet commercial ?',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
              ),
              const SizedBox(height: BSpace.x4),
              ...[
                ('A', 'Lancer la campagne marketing'),
                ('B', 'L’étude de marché et des besoins clients'),
                ('C', 'Souscrire un crédit immédiat'),
                ('D', 'Acheter le stock maximal'),
              ].map((opt) {
                final isSelected = selectedAnswer == opt.$1.codeUnitAt(0) - 'A'.codeUnitAt(0);
                return Padding(
                  padding: const EdgeInsets.only(bottom: BSpace.x2),
                  child: InkWell(
                    onTap: () => setModalState(() => selectedAnswer = opt.$1.codeUnitAt(0) - 'A'.codeUnitAt(0)),
                    borderRadius: BorderRadius.circular(BRadius.md),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: BSpace.x3, vertical: BSpace.x3),
                      decoration: BoxDecoration(
                        color: isSelected ? BColors.primary50 : BColors.neutral50,
                        border: Border.all(color: isSelected ? BColors.primary500 : BColors.border),
                        borderRadius: BorderRadius.circular(BRadius.md),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 12,
                            backgroundColor: isSelected ? BColors.primary500 : BColors.neutral300,
                            child: Text(opt.$1, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                          ),
                          const SizedBox(width: BSpace.x3),
                          Expanded(
                            child: Text(
                              opt.$2,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                                color: isSelected ? BColors.primary800 : BColors.text,
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
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Quitter')),
            FilledButton(
              onPressed: () {
                Navigator.pop(ctx);
                showSuccessSnackBar(context, 'Bonne réponse ! Progression mise à jour.');
              },
              child: const Text('Valider'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: BColors.background,
      appBar: AppBar(
        title: const Text('Formation & Parcours', style: TextStyle(fontWeight: FontWeight.w800)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
        bottom: TabBar(
          controller: _tabController,
          labelColor: BColors.primary500,
          unselectedLabelColor: BColors.textMuted,
          indicatorColor: BColors.primary500,
          tabs: const [
            Tab(text: 'Parcours'),
            Tab(text: 'Formation'),
            Tab(text: 'Projets'),
            Tab(text: 'Certificat'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // Onglet 1 : Parcours global
          ListView(
            padding: const EdgeInsets.all(BSpace.x4),
            children: [
              // Carte Progression Globale
              Container(
                padding: const EdgeInsets.all(BSpace.x6),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [BColors.navy900, BColors.primary600],
                  ),
                  borderRadius: BorderRadius.circular(BRadius.xl),
                  boxShadow: BShadow.raised,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Expanded(
                          child: Text('Formation entrepreneuriale', style: TextStyle(color: Colors.white70, fontSize: 14)),
                        ),
                        const SizedBox(width: BSpace.x2),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: BSpace.x3, vertical: 2),
                          decoration: BoxDecoration(color: BColors.growth500, borderRadius: BorderRadius.circular(BRadius.pill)),
                          child: const Text('Mois 4 en cours', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 11)),
                        ),
                      ],
                    ),
                    const SizedBox(height: BSpace.x4),
                    const Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text('68%', style: TextStyle(fontSize: 42, fontWeight: FontWeight.w900, color: Colors.white)),
                        SizedBox(width: BSpace.x2),
                        Text('de complétion', style: TextStyle(color: Colors.white70, fontSize: 15)),
                      ],
                    ),
                    const SizedBox(height: BSpace.x3),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(BRadius.pill),
                      child: const LinearProgressIndicator(
                        value: 0.68,
                        minHeight: 10,
                        backgroundColor: Colors.white24,
                        valueColor: AlwaysStoppedAnimation<Color>(BColors.growth400),
                      ),
                    ),
                    const SizedBox(height: BSpace.x4),
                    FilledButton(
                      onPressed: () => _openLesson(_modules[3]),
                      style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: BColors.navy900),
                      child: const Text('Continuer le Module 4 — Finance'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: BSpace.x6),
              Text('Programme 6 mois', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: BSpace.x3),
              ..._modules.map((m) => _ModuleCard(module: m, onTap: () => _openLesson(m))),
            ],
          ),
          // Onglet 2 : Liste des cours
          ListView(
            padding: const EdgeInsets.all(BSpace.x4),
            children: [
              Text('Modules du cursus', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: BSpace.x3),
              ..._modules.map((m) => _ModuleCard(module: m, onTap: () => _openLesson(m))),
            ],
          ),
          // Onglet 3 : Projets
          Padding(
            padding: const EdgeInsets.all(BSpace.x4),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lightbulb_outline_rounded, size: 64, color: BColors.primary500),
                const SizedBox(height: BSpace.x4),
                Text('Projets d’activité', style: text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: BSpace.x2),
                const Text(
                  'Une fois le module 4 validé, vous pourrez soumettre votre plan d’affaires pour bénéficier d’un financement et de matériel.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: BColors.textMuted, height: 1.4),
                ),
                const SizedBox(height: BSpace.x6),
                FilledButton.icon(
                  onPressed: () => context.push(Routes.projects),
                  icon: const Icon(Icons.add_business_rounded),
                  label: const Text('Accéder aux projets'),
                ),
              ],
            ),
          ),
          // Onglet 4 : Certification
          Padding(
            padding: const EdgeInsets.all(BSpace.x4),
            child: Center(
              child: Card(
                elevation: 4,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.xl)),
                child: Padding(
                  padding: const EdgeInsets.all(BSpace.x6),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.workspace_premium_rounded, size: 72, color: BColors.accent500),
                      const SizedBox(height: BSpace.x3),
                      const Text('Certificat d’Entrepreneur', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20)),
                      const SizedBox(height: BSpace.x1),
                      const Text('Programme BENSKIN IMPACT', style: TextStyle(color: BColors.textMuted, fontSize: 13)),
                      const Divider(height: BSpace.x6),
                      const Text('Délivré après complétion des 6 mois de cursus et validation du quiz final.',
                          textAlign: TextAlign.center, style: TextStyle(fontSize: 13, height: 1.4)),
                      const SizedBox(height: BSpace.x6),
                      OutlinedButton(
                        onPressed: () => showInfoSnackBar(context, 'Disponible dès l’obtention de votre certification.'),
                        child: const Text('Aperçu du certificat'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ModuleCard extends StatelessWidget {
  const _ModuleCard({required this.module, required this.onTap});
  final TrainingModule module;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (module.status) {
      ModuleStatus.completed => (Icons.check_circle_rounded, BColors.growth600),
      ModuleStatus.inProgress => (Icons.play_circle_fill_rounded, BColors.primary500),
      ModuleStatus.locked => (Icons.lock_rounded, BColors.neutral400),
    };

    return Card(
      margin: const EdgeInsets.only(bottom: BSpace.x3),
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.all(BSpace.x3),
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.15),
          child: Icon(icon, color: color, size: 24),
        ),
        title: Text(
          'Mois ${module.month} : ${module.title}',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 15,
            color: module.status == ModuleStatus.locked ? BColors.textMuted : BColors.text,
          ),
        ),
        subtitle: Text(module.description, style: const TextStyle(fontSize: 12.5, color: BColors.textMuted)),
        trailing: const Icon(Icons.chevron_right_rounded, color: BColors.neutral400),
      ),
    );
  }
}

class _KeyPoint extends StatelessWidget {
  const _KeyPoint({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BSpace.x2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.check_circle_outline_rounded, color: BColors.growth600, size: 18),
          const SizedBox(width: BSpace.x2),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13.5, height: 1.35))),
        ],
      ),
    );
  }
}
