import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';

/// Écran de gestion et soumission de projets d'entrepreneuriat (cahier §7.17, §7.18 et design-board).
class ProjectsScreen extends ConsumerStatefulWidget {
  const ProjectsScreen({super.key});

  @override
  ConsumerState<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends ConsumerState<ProjectsScreen> {
  final _projects = [
    (
      title: 'Atelier mécanique et pièces motos',
      location: 'Douala, Akwa',
      budget: '1 200 000 FCFA',
      status: 'En cours d’évaluation',
      step: 3,
      totalSteps: 6,
    ),
    (
      title: 'Flotte de livraison express moto',
      location: 'Yaoundé, Mokolo',
      budget: '850 000 FCFA',
      status: 'Brouillon',
      step: 1,
      totalSteps: 6,
    ),
  ];

  void _openNewProjectModal() {
    final formKey = GlobalKey<FormState>();
    final titleController = TextEditingController();
    final budgetController = TextEditingController();
    final cityController = TextEditingController(text: 'Douala');
    final descController = TextEditingController();

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(BRadius.xl)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: BSpace.x6,
          right: BSpace.x6,
          top: BSpace.x6,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + BSpace.x6,
        ),
        child: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: BColors.neutral300, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: BSpace.x4),
              const Text('Nouveau projet d’activité',
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: BColors.navy900)),
              const SizedBox(height: 2),
              const Text('Complétez les premières informations pour créer votre dossier.',
                  style: TextStyle(color: BColors.textMuted, fontSize: 13)),
              const SizedBox(height: BSpace.x4),
              TextFormField(
                controller: titleController,
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Indiquez un nom de projet' : null,
                decoration: InputDecoration(
                  labelText: 'Nom du projet / de l’activité',
                  hintText: 'Ex: Atelier de réparation et pneumatique',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                ),
              ),
              const SizedBox(height: BSpace.x3),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: budgetController,
                      keyboardType: TextInputType.number,
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'Indiquez un montant' : null,
                      decoration: InputDecoration(
                        labelText: 'Budget estimé',
                        suffixText: 'FCFA',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                      ),
                    ),
                  ),
                  const SizedBox(width: BSpace.x3),
                  Expanded(
                    child: TextFormField(
                      controller: cityController,
                      decoration: InputDecoration(
                        labelText: 'Ville d’implantation',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: BSpace.x3),
              TextFormField(
                controller: descController,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: 'Description synthétique',
                  hintText: 'Opportunité de marché, clients visés…',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                ),
              ),
              const SizedBox(height: BSpace.x6),
              FilledButton(
                onPressed: () {
                  if (formKey.currentState?.validate() ?? false) {
                    setState(() {
                      _projects.insert(
                        0,
                        (
                          title: titleController.text.trim(),
                          location: cityController.text.trim(),
                          budget: '${budgetController.text.trim()} FCFA',
                          status: 'En cours d’évaluation',
                          step: 1,
                          totalSteps: 6,
                        ),
                      );
                    });
                    Navigator.pop(ctx);
                    showSuccessSnackBar(context, 'Dossier de projet créé avec succès !');
                  }
                },
                child: const Text('Créer le dossier de projet'),
              ),
            ],
          ),
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
        title: const Text('Projets', style: TextStyle(fontWeight: FontWeight.w800)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openNewProjectModal,
        backgroundColor: BColors.primary500,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Nouveau projet', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BSpace.x4),
          children: [
            // Bannière d'accompagnement
            Container(
              padding: const EdgeInsets.all(BSpace.x4),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [BColors.navy800, BColors.primary600]),
                borderRadius: BorderRadius.circular(BRadius.lg),
                boxShadow: BShadow.raised,
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(BSpace.x3),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.support_agent_rounded, color: Colors.white, size: 28),
                  ),
                  const SizedBox(width: BSpace.x3),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Besoin d’aide pour monter votre projet ?',
                            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14.5)),
                        SizedBox(height: 2),
                        Text('Votre mentor BENSKIN IMPACT vous conseille à chaque étape.',
                            style: TextStyle(color: Colors.white70, fontSize: 12.5)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: BSpace.x6),
            Text('Mes projets en cours', style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: BSpace.x3),
            ..._projects.map((p) {
              return Card(
                margin: const EdgeInsets.only(bottom: BSpace.x3),
                child: Padding(
                  padding: const EdgeInsets.all(BSpace.x4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(p.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: BSpace.x2, vertical: 2),
                            decoration: BoxDecoration(
                              color: p.status.contains('évaluation') ? BColors.primary50 : BColors.neutral100,
                              borderRadius: BorderRadius.circular(BRadius.pill),
                            ),
                            child: Text(
                              p.status,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: p.status.contains('évaluation') ? BColors.primary700 : BColors.textMuted,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: BSpace.x2),
                      Row(
                        children: [
                          const Icon(Icons.place_outlined, size: 15, color: BColors.textMuted),
                          const SizedBox(width: 4),
                          Text(p.location, style: const TextStyle(color: BColors.textMuted, fontSize: 12.5)),
                          const SizedBox(width: BSpace.x3),
                          const Icon(Icons.monetization_on_outlined, size: 15, color: BColors.textMuted),
                          const SizedBox(width: 4),
                          Text(p.budget, style: const TextStyle(color: BColors.growth700, fontWeight: FontWeight.w700, fontSize: 12.5)),
                        ],
                      ),
                      const SizedBox(height: BSpace.x3),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Étape ${p.step} sur ${p.totalSteps}', style: const TextStyle(fontSize: 12, color: BColors.textMuted)),
                          Text('${((p.step / p.totalSteps) * 100).toInt()}%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                        ],
                      ),
                      const SizedBox(height: 6),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(BRadius.pill),
                        child: LinearProgressIndicator(
                          value: p.step / p.totalSteps,
                          minHeight: 6,
                          backgroundColor: BColors.neutral100,
                          valueColor: const AlwaysStoppedAnimation<Color>(BColors.growth500),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: BSpace.x8),
          ],
        ),
      ),
    );
  }
}
