import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/money_format.dart';
import '../../../core/network/app_failure.dart';
import '../../../core/sync/sync_queue.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/fields.dart';
import '../domain/accident_models.dart';

/// Déclaration d'accident. Enregistrée sur le téléphone en l'absence de réseau, puis envoyée sans doublon.
class ReportAccidentScreen extends ConsumerStatefulWidget {
  const ReportAccidentScreen({super.key});

  @override
  ConsumerState<ReportAccidentScreen> createState() => _ReportAccidentScreenState();
}

class _ReportAccidentScreenState extends ConsumerState<ReportAccidentScreen> {
  final _form = GlobalKey<FormState>();
  final _location = TextEditingController();
  final _hospital = TextEditingController();
  final _description = TextEditingController();
  final _amount = TextEditingController();
  DateTime _date = DateTime.now();
  String _severity = 'MODERATE';
  bool _thirdParty = false;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    for (final controller in [_location, _hospital, _description, _amount]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final day = await showDatePicker(context: context, initialDate: _date, firstDate: now.subtract(const Duration(days: 90)), lastDate: now);
    if (day == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_date));
    final picked = DateTime(day.year, day.month, day.day, time?.hour ?? _date.hour, time?.minute ?? _date.minute);
    setState(() => _date = picked.isAfter(now) ? now : picked);
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _sending = true);
    try {
      final outcome = await ref.read(syncQueueProvider.notifier).submit(
            kind: 'accident',
            label: 'Déclaration d’accident — ${_location.text.trim()}',
            method: 'POST',
            path: '/accidents',
            body: {
              'date': _date.toUtc().toIso8601String(),
              'location': _location.text.trim(),
              'severity': _severity,
              'thirdPartyInvolved': _thirdParty,
              if (_hospital.text.trim().isNotEmpty) 'hospitalName': _hospital.text.trim(),
              'description': _description.text.trim(),
              'requestedAmount': _amount.text,
            },
          );
      if (!mounted) return;
      switch (outcome) {
        case SubmitSent(:final response):
          final claim = AccidentDetail.fromJson(response as Map<String, dynamic>);
          showSuccessSnackBar(context, 'Déclaration enregistrée. Ajoutez maintenant vos justificatifs.');
          context.pushReplacement('/accidents/${claim.summary.id}');
        case SubmitQueued():
          showInfoSnackBar(context, 'Pas de réseau : la déclaration est enregistrée sur le téléphone et sera envoyée automatiquement.');
          context.pop();
      }
    } on ApiFailure catch (failure) {
      setState(() => _error = failure.fieldErrors.isEmpty ? failure.message : failure.fieldErrors.values.first.first);
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Déclarer un accident')),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
          Container(
            padding: const EdgeInsets.all(BSpace.x3),
            decoration: BoxDecoration(color: BColors.danger50, borderRadius: BorderRadius.circular(BRadius.md)),
            child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(Icons.local_hospital_rounded, color: BColors.danger500),
              SizedBox(width: BSpace.x2),
              Expanded(
                child: Text(
                  'En cas d’urgence, rendez-vous d’abord à l’hôpital. Cette déclaration ne vaut pas accord de prise en charge : le comité examine chaque dossier.',
                  style: TextStyle(color: BColors.text, fontSize: 13),
                ),
              ),
            ]),
          ),
          const SizedBox(height: BSpace.x4),
          const FieldLabel('Date et heure de l’accident'),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(alignment: Alignment.centerLeft),
            onPressed: _pickDate,
            icon: const Icon(Icons.event_rounded),
            label: Text(formatDateTime(_date)),
          ),
          const SizedBox(height: BSpace.x4),
          const FieldLabel('Lieu'),
          TextFormField(
            controller: _location,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(hintText: 'Ville, quartier, carrefour', prefixIcon: Icon(Icons.place_outlined)),
            validator: (value) => (value ?? '').trim().length < 3 ? 'Indiquez le lieu.' : null,
          ),
          const SizedBox(height: BSpace.x4),
          const FieldLabel('Gravité'),
          SegmentedButton<String>(
            showSelectedIcon: false,
            segments: [for (final entry in accidentSeverities.entries) ButtonSegment(value: entry.key, label: Text(entry.value.$1))],
            selected: {_severity},
            onSelectionChanged: (selection) => setState(() => _severity = selection.first),
          ),
          Padding(
            padding: const EdgeInsets.only(top: BSpace.x1),
            child: Text(accidentSeverities[_severity]!.$2, style: const TextStyle(color: BColors.textMuted, fontSize: 12.5)),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Un tiers est impliqué (voiture, piéton, autre moto)'),
            value: _thirdParty,
            onChanged: (value) => setState(() => _thirdParty = value),
          ),
          const FieldLabel('Hôpital ou centre de soins (facultatif)'),
          TextFormField(controller: _hospital, textCapitalization: TextCapitalization.words, maxLength: 120),
          const FieldLabel('Circonstances et blessures'),
          TextFormField(
            controller: _description,
            minLines: 4,
            maxLines: 8,
            maxLength: 2000,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(hintText: 'Comment l’accident s’est-il produit ? Quelles blessures ?'),
            validator: (value) => (value ?? '').trim().length < 10 ? '10 caractères minimum.' : null,
          ),
          const FieldLabel('Estimation des frais (FCFA)'),
          TextFormField(
            controller: _amount,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9)],
            decoration: const InputDecoration(suffixText: 'FCFA', hintText: 'Ex. 45000'),
            validator: (value) => (int.tryParse(value ?? '') ?? 0) <= 0 ? 'Indiquez un montant estimé.' : null,
          ),
          const SizedBox(height: BSpace.x2),
          const Text('Montant indicatif : l’aide éventuelle est fixée par le comité sur justificatifs.', style: TextStyle(color: BColors.textMuted, fontSize: 12.5)),
          const SizedBox(height: BSpace.x6),
          if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x4)],
          LoadingButton(label: 'Envoyer la déclaration', loading: _sending, onPressed: _submit),
        ]),
      ),
    );
  }
}
