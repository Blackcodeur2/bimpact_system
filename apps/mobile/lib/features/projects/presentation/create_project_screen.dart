import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/tokens.dart';
import '../application/projects_providers.dart';

class CreateProjectScreen extends ConsumerStatefulWidget {
  const CreateProjectScreen({super.key});

  @override
  ConsumerState<CreateProjectScreen> createState() => _CreateProjectScreenState();
}

class _CreateProjectScreenState extends ConsumerState<CreateProjectScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _sectorController = TextEditingController(text: 'Commerce & Boutique');
  final _cityController = TextEditingController(text: 'Yaoundé');
  final _locationController = TextEditingController();
  final _budgetController = TextEditingController();
  final _contributionController = TextEditingController();
  final _grantController = TextEditingController();
  final _descriptionController = TextEditingController();
  bool _isSubmitting = false;

  final _sectors = [
    'Commerce & Boutique',
    'Atelier mécanique & Pièces',
    'Flotte de livraison / Transport',
    'Agriculture & Élevage',
    'Restauration & Alimentation',
    'Services & TIC',
  ];

  @override
  void dispose() {
    _titleController.dispose();
    _sectorController.dispose();
    _cityController.dispose();
    _locationController.dispose();
    _budgetController.dispose();
    _contributionController.dispose();
    _grantController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Déposer un projet'),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(BSpace.x4),
          children: [
            Container(
              padding: const EdgeInsets.all(BSpace.x4),
              decoration: BoxDecoration(
                color: BColors.brandBlue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(BRadius.md),
              ),
              child: const Row(
                children: [
                  Icon(Icons.lightbulb_outline, color: BColors.brandBlue),
                  SizedBox(width: BSpace.x3),
                  Expanded(
                    child: Text(
                      'Remplissez les informations ci-dessous. Le comité étudiera votre dossier sous 7 jours.',
                      style: TextStyle(fontSize: 13, color: BColors.primaryNavy),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: BSpace.x4),

            // Titre
            TextFormField(
              controller: _titleController,
              decoration: const InputDecoration(
                labelText: 'Nom ou intitulé du projet *',
                hintText: 'Ex: Atelier de réparation moto Akwa Express',
                prefixIcon: Icon(Icons.business),
              ),
              validator: (v) => v == null || v.trim().isEmpty ? 'Veuillez saisir un intitulé.' : null,
            ),
            const SizedBox(height: BSpace.x3),

            // Secteur
            DropdownButtonFormField<String>(
              value: _sectorController.text,
              decoration: const InputDecoration(
                labelText: 'Secteur d’activité *',
                prefixIcon: Icon(Icons.category),
              ),
              items: _sectors.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
              onChanged: (v) {
                if (v != null) setState(() => _sectorController.text = v);
              },
            ),
            const SizedBox(height: BSpace.x3),

            // Ville et quartier
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _cityController,
                    decoration: const InputDecoration(
                      labelText: 'Ville *',
                      prefixIcon: Icon(Icons.location_city),
                    ),
                    validator: (v) => v == null || v.trim().isEmpty ? 'Requis' : null,
                  ),
                ),
                const SizedBox(width: BSpace.x3),
                Expanded(
                  child: TextFormField(
                    controller: _locationController,
                    decoration: const InputDecoration(
                      labelText: 'Quartier / Carrefour',
                      prefixIcon: Icon(Icons.place),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: BSpace.x3),

            // Budget
            TextFormField(
              controller: _budgetController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Budget total estimé (FCFA) *',
                hintText: 'Ex: 1 500 000',
                prefixIcon: Icon(Icons.monetization_on),
              ),
              validator: (v) => v == null || double.tryParse(v.replaceAll(' ', '')) == null ? 'Montant invalide' : null,
            ),
            const SizedBox(height: BSpace.x3),

            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _contributionController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Apport personnel (FCFA)',
                      hintText: 'Ex: 300 000',
                    ),
                  ),
                ),
                const SizedBox(width: BSpace.x3),
                Expanded(
                  child: TextFormField(
                    controller: _grantController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Subvention demandée *',
                      hintText: 'Ex: 1 200 000',
                    ),
                    validator: (v) => v == null || double.tryParse(v.replaceAll(' ', '')) == null ? 'Montant requis' : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: BSpace.x3),

            // Description
            TextFormField(
              controller: _descriptionController,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Description du projet & clientèle visée *',
                hintText: 'Expliquez vos besoins d’achat, votre organisation et vos perspectives de rentabilité...',
                alignLabelWithHint: true,
              ),
              validator: (v) => v == null || v.trim().length < 15 ? 'Minimum 15 caractères requis.' : null,
            ),
            const SizedBox(height: BSpace.x6),

            SizedBox(
              height: 48,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: BColors.brandBlue,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                ),
                onPressed: _isSubmitting ? null : _submit,
                child: _isSubmitting
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text('Soumettre mon projet au comité', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);
    try {
      final budget = double.parse(_budgetController.text.replaceAll(' ', ''));
      final grant = double.parse(_grantController.text.replaceAll(' ', ''));
      final personal = double.tryParse(_contributionController.text.replaceAll(' ', '')) ?? 0.0;

      await ref.read(projectsRepositoryProvider).createProject({
        'title': _titleController.text.trim(),
        'sector': _sectorController.text.trim(),
        'city': _cityController.text.trim(),
        'locationDetail': _locationController.text.trim().isEmpty ? null : _locationController.text.trim(),
        'estimatedBudget': budget,
        'personalContribution': personal,
        'grantRequested': grant,
        'description': _descriptionController.text.trim(),
      });

      ref.invalidate(projectsListProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('🎉 Projet soumis avec succès ! Le comité étudiera votre dossier.'),
            backgroundColor: BColors.brandGreen,
          ),
        );
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }
}
