import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/fields.dart';
import '../../../core/widgets/states.dart';
import '../application/kyc_providers.dart';
import '../domain/kyc_labels.dart';
import '../domain/kyc_models.dart';
import 'kyc_form_widgets.dart';

/// Charge le dossier puis construit le formulaire une seule fois avec ses valeurs.
class _DossierLoader extends ConsumerWidget {
  const _DossierLoader({required this.title, required this.builder});
  final String title;
  final Widget Function(KycDossier dossier) builder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(kycDossierProvider).when(
          data: (loaded) => builder(loaded.data),
          loading: () => Scaffold(appBar: AppBar(title: Text(title)), body: const Center(child: CircularProgressIndicator())),
          error: (error, _) => Scaffold(
            appBar: AppBar(title: Text(title)),
            body: ErrorState(error: error, onRetry: () => ref.invalidate(kycDossierProvider)),
          ),
        );
  }
}

String? _required(String? value, String message) => (value ?? '').trim().isEmpty ? message : null;

// ───────────────────────────── Identité ─────────────────────────────

class KycIdentityScreen extends StatelessWidget {
  const KycIdentityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _DossierLoader(title: 'Identité', builder: (dossier) => _IdentityForm(dossier: dossier));
  }
}

class _IdentityForm extends ConsumerStatefulWidget {
  const _IdentityForm({required this.dossier});
  final KycDossier dossier;

  @override
  ConsumerState<_IdentityForm> createState() => _IdentityFormState();
}

class _IdentityFormState extends ConsumerState<_IdentityForm> with KycStepSave {
  final _form = GlobalKey<FormState>();
  late final _firstName = TextEditingController(text: widget.dossier.identity.firstName);
  late final _lastName = TextEditingController(text: widget.dossier.identity.lastName);
  late final _idNumber = TextEditingController(text: widget.dossier.identity.idDocumentNumber);
  late String? _birthDate = widget.dossier.identity.birthDate;
  late String? _idType = widget.dossier.identity.idDocumentType;
  late String? _expiry = widget.dossier.identity.idDocumentExpiry;

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _idNumber.dispose();
    super.dispose();
  }

  void _save() {
    if (!_form.currentState!.validate()) return;
    saveStep({
      'firstName': _firstName.text.trim(),
      'lastName': _lastName.text.trim(),
      'birthDate': _birthDate,
      'idDocumentType': _idType,
      'idDocumentNumber': _idNumber.text.trim(),
      'idDocumentExpiry': _expiry,
    }, 'Identité enregistrée.');
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    return KycStepScaffold(
      title: 'Identité',
      intro: 'Saisissez les informations exactement comme sur votre pièce d’identité.',
      formKey: _form,
      editable: widget.dossier.editable,
      saving: saving,
      formError: formError,
      onSave: _save,
      children: [
        const FieldLabel('Prénom(s)'),
        TextFormField(
          controller: _firstName,
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(errorText: fieldErrors['firstName']),
          validator: (v) => _required(v, 'Indiquez votre prénom.'),
        ),
        const SizedBox(height: 16),
        const FieldLabel('Nom'),
        TextFormField(
          controller: _lastName,
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(errorText: fieldErrors['lastName']),
          validator: (v) => _required(v, 'Indiquez votre nom.'),
        ),
        const SizedBox(height: 16),
        const FieldLabel('Date de naissance'),
        DatePickerField(
          value: _birthDate,
          firstDate: DateTime(now.year - 90),
          lastDate: DateTime(now.year - 16, now.month, now.day),
          errorText: fieldErrors['birthDate'],
          onChanged: (value) => setState(() => _birthDate = value),
          validator: (v) => v == null ? 'Indiquez votre date de naissance.' : null,
        ),
        const SizedBox(height: 16),
        const FieldLabel('Type de pièce'),
        ChoiceCards(
          options: KycLabels.idDocumentTypes,
          value: _idType,
          errorText: fieldErrors['idDocumentType'],
          onChanged: (value) => setState(() => _idType = value),
        ),
        const SizedBox(height: 16),
        const FieldLabel('Numéro de la pièce'),
        TextFormField(
          controller: _idNumber,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(errorText: fieldErrors['idDocumentNumber'], hintText: 'Tel qu’indiqué sur la pièce'),
          validator: (v) => _required(v, 'Indiquez le numéro de la pièce.'),
        ),
        const SizedBox(height: 16),
        const FieldLabel('Date d’expiration'),
        DatePickerField(
          value: _expiry,
          firstDate: DateTime(now.year - 5),
          lastDate: DateTime(now.year + 20),
          errorText: fieldErrors['idDocumentExpiry'],
          onChanged: (value) => setState(() => _expiry = value),
          validator: (v) => v == null ? 'Indiquez la date d’expiration.' : null,
        ),
        if (_idType == null && fieldErrors['idDocumentType'] == null)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('Choisissez le type de pièce.', style: TextStyle(fontSize: 12.5)),
          ),
      ],
    );
  }
}

// ───────────────────────────── Adresse ─────────────────────────────

class KycLocationScreen extends StatelessWidget {
  const KycLocationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _DossierLoader(title: 'Adresse', builder: (dossier) => _LocationForm(dossier: dossier));
  }
}

class _LocationForm extends ConsumerStatefulWidget {
  const _LocationForm({required this.dossier});
  final KycDossier dossier;

  @override
  ConsumerState<_LocationForm> createState() => _LocationFormState();
}

class _LocationFormState extends ConsumerState<_LocationForm> with KycStepSave {
  final _form = GlobalKey<FormState>();
  late final _city = TextEditingController(text: widget.dossier.location.city);
  late final _district = TextEditingController(text: widget.dossier.location.district);
  late final _hint = TextEditingController(text: widget.dossier.location.addressHint);

  @override
  void dispose() {
    _city.dispose();
    _district.dispose();
    _hint.dispose();
    super.dispose();
  }

  void _save() {
    if (!_form.currentState!.validate()) return;
    saveStep({
      'city': _city.text.trim(),
      'district': _district.text.trim(),
      if (_hint.text.trim().isNotEmpty) 'addressHint': _hint.text.trim(),
    }, 'Adresse enregistrée.');
  }

  @override
  Widget build(BuildContext context) {
    return KycStepScaffold(
      title: 'Adresse',
      intro: 'Indiquez où vous vivez. Aucune localisation GPS n’est collectée.',
      formKey: _form,
      editable: widget.dossier.editable,
      saving: saving,
      formError: formError,
      onSave: _save,
      children: [
        const FieldLabel('Ville'),
        TextFormField(
          controller: _city,
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(hintText: 'Ex. Douala', errorText: fieldErrors['city']),
          validator: (v) => _required(v, 'Indiquez votre ville.'),
        ),
        const SizedBox(height: 16),
        const FieldLabel('Quartier'),
        TextFormField(
          controller: _district,
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(hintText: 'Ex. Akwa', errorText: fieldErrors['district']),
          validator: (v) => _required(v, 'Indiquez votre quartier.'),
        ),
        const SizedBox(height: 16),
        const FieldLabel('Point de repère (facultatif)'),
        TextFormField(
          controller: _hint,
          maxLines: 2,
          decoration: InputDecoration(hintText: 'Ex. derrière la pharmacie du carrefour', errorText: fieldErrors['addressHint']),
        ),
      ],
    );
  }
}

// ───────────────────────────── Moto ─────────────────────────────

class KycVehicleScreen extends StatelessWidget {
  const KycVehicleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _DossierLoader(title: 'Moto', builder: (dossier) => _VehicleForm(dossier: dossier));
  }
}

class _VehicleForm extends ConsumerStatefulWidget {
  const _VehicleForm({required this.dossier});
  final KycDossier dossier;

  @override
  ConsumerState<_VehicleForm> createState() => _VehicleFormState();
}

class _VehicleFormState extends ConsumerState<_VehicleForm> with KycStepSave {
  final _form = GlobalKey<FormState>();
  late final _plate = TextEditingController(text: widget.dossier.vehicle.plate);
  late final _model = TextEditingController(text: widget.dossier.vehicle.model);
  late String? _ownership = widget.dossier.vehicle.ownership;
  bool _ownershipMissing = false;

  @override
  void dispose() {
    _plate.dispose();
    _model.dispose();
    super.dispose();
  }

  void _save() {
    setState(() => _ownershipMissing = _ownership == null);
    if (!_form.currentState!.validate() || _ownership == null) return;
    saveStep({
      'vehiclePlate': _plate.text.trim(),
      if (_model.text.trim().isNotEmpty) 'vehicleModel': _model.text.trim(),
      'vehicleOwnership': _ownership,
    }, 'Informations de la moto enregistrées.');
  }

  @override
  Widget build(BuildContext context) {
    return KycStepScaffold(
      title: 'Moto',
      intro: 'Les informations de la moto que vous utilisez pour travailler.',
      formKey: _form,
      editable: widget.dossier.editable,
      saving: saving,
      formError: formError,
      onSave: _save,
      children: [
        const FieldLabel('Immatriculation'),
        TextFormField(
          controller: _plate,
          textCapitalization: TextCapitalization.characters,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(hintText: 'Ex. LT 123 AB', errorText: fieldErrors['vehiclePlate']),
          validator: (v) => _required(v, 'Indiquez l’immatriculation.'),
        ),
        const SizedBox(height: 16),
        const FieldLabel('Marque et modèle (facultatif)'),
        TextFormField(
          controller: _model,
          textCapitalization: TextCapitalization.words,
          decoration: InputDecoration(hintText: 'Ex. Nanfang', errorText: fieldErrors['vehicleModel']),
        ),
        const SizedBox(height: 16),
        const FieldLabel('Votre situation'),
        ChoiceCards(
          options: KycLabels.ownerships,
          value: _ownership,
          errorText: fieldErrors['vehicleOwnership'] ?? (_ownershipMissing ? 'Choisissez votre situation.' : null),
          onChanged: (value) => setState(() {
            _ownership = value;
            _ownershipMissing = false;
          }),
        ),
      ],
    );
  }
}
