import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/tokens.dart';
import '../application/accidents_providers.dart';

class ReportAccidentScreen extends ConsumerStatefulWidget {
  const ReportAccidentScreen({super.key});

  @override
  ConsumerState<ReportAccidentScreen> createState() => _ReportAccidentScreenState();
}

class _ReportAccidentScreenState extends ConsumerState<ReportAccidentScreen> {
  final _formKey = GlobalKey<FormState>();
  final _locationController = TextEditingController();
  final _hospitalController = TextEditingController();
  final _amountController = TextEditingController();
  final _descriptionController = TextEditingController();
  String _severity = 'MODERATE';
  bool _thirdPartyInvolved = false;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _locationController.dispose();
    _hospitalController.dispose();
    _amountController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Déclaration de sinistre'),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(BSpace.x4),
          children: [
            Container(
              padding: const EdgeInsets.all(BSpace.x4),
              decoration: BoxDecoration(
                color: Colors.red.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(BRadius.md),
                border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.local_hospital, color: Colors.red),
                  SizedBox(width: BSpace.x3),
                  Expanded(
                    child: Text(
                      'En cas d’urgence vitale, rendez-vous immédiatement dans l’hôpital le plus proche. Le dossier de remboursement sera traité sous 48h.',
                      style: TextStyle(fontSize: 13, color: Colors.black87),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: BSpace.x4),

            // Lieu
            TextFormField(
              controller: _locationController,
              decoration: const InputDecoration(
                labelText: 'Lieu précis de l’accident *',
                hintText: 'Ex: Yaoundé, Axe Carrefour Nlongkak',
                prefixIcon: Icon(Icons.place),
              ),
              validator: (v) => v == null || v.trim().isEmpty ? 'Requis' : null,
            ),
            const SizedBox(height: BSpace.x3),

            // Hôpital
            TextFormField(
              controller: _hospitalController,
              decoration: const InputDecoration(
                labelText: 'Hôpital ou clinique d’admission',
                hintText: 'Ex: Hôpital Central de Yaoundé (Urgences)',
                prefixIcon: Icon(Icons.local_hospital_outlined),
              ),
            ),
            const SizedBox(height: BSpace.x3),

            // Gravité
            DropdownButtonFormField<String>(
              value: _severity,
              decoration: const InputDecoration(
                labelText: 'Gravité estimée *',
                prefixIcon: Icon(Icons.health_and_safety),
              ),
              items: const [
                DropdownMenuItem(value: 'LIGHT', child: Text('Léger (plaies, pansements, soins simples)')),
                DropdownMenuItem(value: 'MODERATE', child: Text('Moyen (entorse, radiographie, plâtre)')),
                DropdownMenuItem(value: 'SEVERE', child: Text('Grave (fracture, hospitalisation de nuit)')),
              ],
              onChanged: (v) {
                if (v != null) setState(() => _severity = v);
              },
            ),
            const SizedBox(height: BSpace.x3),

            // Tiers impliqué
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Un tiers (voiture, piéton, autre moto) est-il impliqué ?', style: TextStyle(fontSize: 14)),
              value: _thirdPartyInvolved,
              activeColor: BColors.brandBlue,
              onChanged: (v) => setState(() => _thirdPartyInvolved = v),
            ),
            const SizedBox(height: BSpace.x3),

            // Montant estimé des frais
            TextFormField(
              controller: _amountController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Montant estimé des soins / ordonnance (FCFA) *',
                hintText: 'Ex: 45 000',
                prefixIcon: Icon(Icons.monetization_on),
              ),
              validator: (v) => v == null || double.tryParse(v.replaceAll(' ', '')) == null ? 'Montant requis' : null,
            ),
            const SizedBox(height: BSpace.x3),

            // Description
            TextFormField(
              controller: _descriptionController,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Circonstances de l’accident & blessures *',
                hintText: 'Décrivez brièvement comment l’accident est survenu...',
                alignLabelWithHint: true,
              ),
              validator: (v) => v == null || v.trim().length < 10 ? 'Minimum 10 caractères requis.' : null,
            ),
            const SizedBox(height: BSpace.x6),

            SizedBox(
              height: 48,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                ),
                onPressed: _isSubmitting ? null : _submit,
                icon: _isSubmitting
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Icon(Icons.send),
                label: const Text('Transmettre au comité de secours', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
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
      final amount = double.parse(_amountController.text.replaceAll(' ', ''));

      await ref.read(accidentsRepositoryProvider).reportAccident({
        'date': DateTime.now().toIso8601String(),
        'location': _locationController.text.trim(),
        'severity': _severity,
        'thirdPartyInvolved': _thirdPartyInvolved,
        'hospitalName': _hospitalController.text.trim().isEmpty ? null : _hospitalController.text.trim(),
        'description': _descriptionController.text.trim(),
        'requestedAmount': amount,
      });

      ref.invalidate(accidentClaimsProvider);
      ref.invalidate(coverageStatusProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('🚨 Déclaration transmise avec succès ! L’équipe de permanence prend en charge votre dossier.'),
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
