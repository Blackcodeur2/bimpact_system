import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/network/app_failure.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../application/kyc_providers.dart';

/// Enregistrement d'une étape du dossier, avec erreurs par champ renvoyées par l'API.
mixin KycStepSave<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  bool saving = false;
  Map<String, String> fieldErrors = {};
  String? formError;

  Future<void> saveStep(Map<String, Object?> fields, String successMessage) async {
    setState(() {
      saving = true;
      fieldErrors = {};
      formError = null;
    });
    try {
      await ref.read(kycRepositoryProvider).update(fields);
      await refreshAfterKycChange(ref);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
      context.pop();
    } on ApiFailure catch (failure) {
      setState(() {
        fieldErrors = failure.fieldErrors.map((field, messages) => MapEntry(field, messages.first));
        if (fieldErrors.isEmpty) formError = failure.message;
      });
    } on AppFailure catch (failure) {
      setState(() => formError = failure.message);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}

/// Mise en page commune des étapes : introduction, champs, erreur, bouton d'enregistrement.
class KycStepScaffold extends StatelessWidget {
  const KycStepScaffold({
    super.key,
    required this.title,
    required this.intro,
    required this.formKey,
    required this.editable,
    required this.saving,
    required this.onSave,
    required this.children,
    this.formError,
  });

  final String title;
  final String intro;
  final GlobalKey<FormState> formKey;
  final bool editable;
  final bool saving;
  final VoidCallback onSave;
  final List<Widget> children;
  final String? formError;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: Form(
          key: formKey,
          child: ListView(padding: const EdgeInsets.all(BSpace.x6), children: [
            Text(intro, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: BColors.textMuted)),
            const SizedBox(height: BSpace.x6),
            if (!editable) ...[
              const _ReadOnlyNotice(),
              const SizedBox(height: BSpace.x4),
            ],
            IgnorePointer(
              ignoring: !editable,
              child: Opacity(
                opacity: editable ? 1 : 0.7,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
              ),
            ),
            const SizedBox(height: BSpace.x6),
            if (formError != null) ...[FormErrorBanner(formError!), const SizedBox(height: BSpace.x4)],
            if (editable) LoadingButton(label: 'Enregistrer', loading: saving, onPressed: onSave),
          ]),
        ),
      ),
    );
  }
}

class _ReadOnlyNotice extends StatelessWidget {
  const _ReadOnlyNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BSpace.x3),
      decoration: BoxDecoration(color: BColors.primary50, borderRadius: BorderRadius.circular(BRadius.md)),
      child: const Row(children: [
        Icon(Icons.lock_outline_rounded, color: BColors.primary700, size: 20),
        SizedBox(width: BSpace.x2),
        Expanded(
          child: Text('Dossier en cours de vérification ou validé : lecture seule.',
              style: TextStyle(color: BColors.primary700, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }
}

/// Champ de date (AAAA-MM-JJ côté API, JJ/MM/AAAA à l'écran).
class DatePickerField extends StatelessWidget {
  const DatePickerField({
    super.key,
    required this.value,
    required this.onChanged,
    required this.firstDate,
    required this.lastDate,
    this.errorText,
    this.validator,
  });

  final String? value;
  final ValueChanged<String> onChanged;
  final DateTime firstDate;
  final DateTime lastDate;
  final String? errorText;
  final String? Function(String? value)? validator;

  static final _display = DateFormat('dd/MM/yyyy', 'fr');

  @override
  Widget build(BuildContext context) {
    final current = value == null ? null : DateTime.tryParse(value!);
    return FormField<String>(
      validator: (_) => validator?.call(value),
      builder: (field) => InkWell(
        borderRadius: BorderRadius.circular(BRadius.md),
        onTap: () async {
          final now = DateTime.now();
          var initial = current ?? (lastDate.isBefore(now) ? lastDate : now);
          if (initial.isBefore(firstDate)) initial = firstDate;
          if (initial.isAfter(lastDate)) initial = lastDate;
          final picked = await showDatePicker(
            context: context,
            initialDate: initial,
            firstDate: firstDate,
            lastDate: lastDate,
            locale: const Locale('fr'),
          );
          if (picked == null) return;
          final iso = '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-'
              '${picked.day.toString().padLeft(2, '0')}';
          onChanged(iso);
          field.didChange(iso);
        },
        child: InputDecorator(
          isEmpty: current == null,
          decoration: InputDecoration(
            hintText: 'JJ/MM/AAAA',
            prefixIcon: const Icon(Icons.event_outlined),
            errorText: errorText ?? field.errorText,
          ),
          child: Text(current == null ? '' : _display.format(current)),
        ),
      ),
    );
  }
}

/// Choix exclusif présenté en cartes (plus lisible qu'une liste déroulante sur un petit écran).
class ChoiceCards extends StatelessWidget {
  const ChoiceCards({super.key, required this.options, required this.value, required this.onChanged, this.errorText});

  final Map<String, String> options;
  final String? value;
  final ValueChanged<String> onChanged;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final entry in options.entries)
        Padding(
          padding: const EdgeInsets.only(bottom: BSpace.x2),
          child: InkWell(
            borderRadius: BorderRadius.circular(BRadius.md),
            onTap: () => onChanged(entry.key),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              constraints: const BoxConstraints(minHeight: 52),
              padding: const EdgeInsets.symmetric(horizontal: BSpace.x4, vertical: BSpace.x3),
              decoration: BoxDecoration(
                color: entry.key == value ? BColors.primary50 : BColors.surface,
                borderRadius: BorderRadius.circular(BRadius.md),
                border: Border.all(
                  color: entry.key == value ? BColors.primary500 : BColors.border,
                  width: entry.key == value ? 1.5 : 1,
                ),
              ),
              child: Row(children: [
                Icon(
                  entry.key == value ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                  color: entry.key == value ? BColors.primary500 : BColors.neutral400,
                ),
                const SizedBox(width: BSpace.x3),
                Expanded(child: Text(entry.value, style: const TextStyle(fontWeight: FontWeight.w600))),
              ]),
            ),
          ),
        ),
      if (errorText != null)
        Padding(
          padding: const EdgeInsets.only(left: BSpace.x3),
          child: Text(errorText!, style: const TextStyle(color: BColors.danger500, fontSize: 12.5)),
        ),
    ]);
  }
}
