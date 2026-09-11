import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/app_failure.dart';
import '../../../core/sync/sync_queue.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/fields.dart';
import '../../../core/widgets/states.dart';
import '../application/projects_providers.dart';
import '../domain/project_models.dart';

/// Création puis complétion d'un projet en quatre étapes (cahier §7.18).
/// Chaque étape est enregistrée comme brouillon ; hors connexion, l'enregistrement part au retour du réseau.
class CreateProjectScreen extends ConsumerStatefulWidget {
  const CreateProjectScreen({super.key});

  @override
  ConsumerState<CreateProjectScreen> createState() => _CreateProjectScreenState();
}

class _CreateProjectScreenState extends ConsumerState<CreateProjectScreen> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final outcome = await ref.read(syncQueueProvider.notifier).submit(
            kind: 'project',
            label: 'Nouveau projet « ${_title.text.trim()} »',
            method: 'POST',
            path: '/projects',
            body: {'title': _title.text.trim()},
          );
      if (!mounted) return;
      switch (outcome) {
        case SubmitSent(:final response):
          final project = ProjectDetail.fromJson(response as Map<String, dynamic>);
          context.pushReplacement('/projects/${project.summary.id}/edit');
        case SubmitQueued():
          showInfoSnackBar(context, 'Pas de réseau : le projet sera créé automatiquement. Vous pourrez le compléter ensuite.');
          context.pop();
      }
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nouveau projet')),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
          const Text('Donnez un nom à votre projet. Vous le compléterez étape par étape, à votre rythme.', style: TextStyle(color: BColors.textMuted)),
          const SizedBox(height: BSpace.x4),
          const FieldLabel('Nom du projet'),
          TextFormField(
            controller: _title,
            maxLength: 120,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(hintText: 'Ex. Atelier de réparation de motos'),
            validator: (value) => (value ?? '').trim().length < 3 ? '3 caractères minimum.' : null,
          ),
          const SizedBox(height: BSpace.x4),
          if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x4)],
          LoadingButton(label: 'Créer le brouillon', loading: _saving, onPressed: _create),
        ]),
      ),
    );
  }
}

/// Éditeur du brouillon : fiche, problème et marché, budget et financement, équipe et prévisions.
class EditProjectScreen extends ConsumerWidget {
  const EditProjectScreen({super.key, required this.projectId});
  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final project = ref.watch(projectDetailProvider(projectId));
    return Scaffold(
      appBar: AppBar(title: const Text('Compléter le projet')),
      body: project.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 4)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(projectDetailProvider(projectId))),
        data: (detail) => detail.canEdit
            ? _ProjectEditor(detail: detail)
            : const EmptyState(
                icon: Icons.lock_outline_rounded,
                title: 'Projet en cours d’examen',
                message: 'Ce projet ne peut plus être modifié tant que le comité ne demande pas de corrections.',
              ),
      ),
    );
  }
}

class _EditableLine {
  _EditableLine(String label, String amount)
      : label = TextEditingController(text: label),
        amount = TextEditingController(text: amount);
  final TextEditingController label;
  final TextEditingController amount;

  void dispose() {
    label.dispose();
    amount.dispose();
  }
}

class _EditableMember {
  _EditableMember(String name, String role)
      : name = TextEditingController(text: name),
        role = TextEditingController(text: role);
  final TextEditingController name;
  final TextEditingController role;

  void dispose() {
    name.dispose();
    role.dispose();
  }
}

class _ProjectEditor extends ConsumerStatefulWidget {
  const _ProjectEditor({required this.detail});
  final ProjectDetail detail;

  @override
  ConsumerState<_ProjectEditor> createState() => _ProjectEditorState();
}

class _ProjectEditorState extends ConsumerState<_ProjectEditor> {
  late final ProjectDetail d = widget.detail;
  int _step = 0;
  bool _saving = false;
  String? _error;

  late final _title = TextEditingController(text: d.summary.title);
  late final _sector = TextEditingController(text: d.summary.sector ?? '');
  late final _city = TextEditingController(text: d.summary.city ?? '');
  late final _location = TextEditingController(text: d.locationDetail ?? '');
  late final _description = TextEditingController(text: d.description ?? '');
  late final _problem = TextEditingController(text: d.problem ?? '');
  late final _solution = TextEditingController(text: d.solution ?? '');
  late final _market = TextEditingController(text: d.market ?? '');
  late final _budget = TextEditingController(text: d.summary.estimatedBudget?.amount.split('.').first ?? '');
  late final _personal = TextEditingController(text: d.personalContribution.amount.split('.').first);
  late final _grant = TextEditingController(text: d.summary.grantRequested?.amount.split('.').first ?? '');
  late final _revenue = TextEditingController(text: d.monthlyRevenue?.amount.split('.').first ?? '');
  late final _costs = TextEditingController(text: d.monthlyCosts?.amount.split('.').first ?? '');
  late final _jobs = TextEditingController(text: d.jobsCreated?.toString() ?? '');
  late final List<_EditableLine> _lines = [for (final line in d.budgetLines) _EditableLine(line.label, line.amount.amount.split('.').first)];
  late final List<_EditableMember> _members = [for (final member in d.teamMembers) _EditableMember(member.fullName, member.role)];

  static const _steps = ['Le projet', 'Problème & clients', 'Budget', 'Équipe & prévisions'];

  @override
  void dispose() {
    for (final controller in [_title, _sector, _city, _location, _description, _problem, _solution, _market, _budget, _personal, _grant, _revenue, _costs, _jobs]) {
      controller.dispose();
    }
    for (final line in _lines) {
      line.dispose();
    }
    for (final member in _members) {
      member.dispose();
    }
    super.dispose();
  }

  String? _textOrNull(TextEditingController controller) => controller.text.trim().isEmpty ? null : controller.text.trim();
  String? _amountOrNull(TextEditingController controller) => controller.text.isEmpty ? null : controller.text;

  Map<String, dynamic> _fieldsForStep(int step) => switch (step) {
        0 => {
            'title': _title.text.trim(),
            'sector': _textOrNull(_sector),
            'city': _textOrNull(_city),
            'locationDetail': _textOrNull(_location),
            'description': _textOrNull(_description),
          },
        1 => {'problem': _textOrNull(_problem), 'solution': _textOrNull(_solution), 'market': _textOrNull(_market)},
        2 => {
            'estimatedBudget': _amountOrNull(_budget),
            'personalContribution': _personal.text.isEmpty ? '0' : _personal.text,
            'grantRequested': _amountOrNull(_grant),
            'budgetLines': [
              for (final line in _lines)
                if (line.label.text.trim().length >= 2 && (int.tryParse(line.amount.text) ?? 0) > 0)
                  {'label': line.label.text.trim(), 'amount': line.amount.text},
            ],
          },
        _ => {
            'teamMembers': [
              for (final member in _members)
                if (member.name.text.trim().length >= 2 && member.role.text.trim().length >= 2)
                  {'fullName': member.name.text.trim(), 'role': member.role.text.trim()},
            ],
            'forecasts': {
              if (_revenue.text.isNotEmpty) 'monthlyRevenue': _revenue.text,
              if (_costs.text.isNotEmpty) 'monthlyCosts': _costs.text,
              if (_jobs.text.isNotEmpty) 'jobsCreated': int.parse(_jobs.text),
            },
          },
      };

  /// Enregistre l'étape affichée ; renvoie false si le serveur refuse les données.
  Future<bool> _save() async {
    if (_title.text.trim().length < 3) {
      setState(() => _error = 'Le nom du projet doit contenir au moins 3 caractères.');
      return false;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final outcome = await ref.read(syncQueueProvider.notifier).submit(
            kind: 'project',
            label: 'Brouillon « ${_title.text.trim()} » — ${_steps[_step]}',
            method: 'PATCH',
            path: '/projects/${d.summary.id}',
            body: _fieldsForStep(_step),
          );
      if (outcome is SubmitQueued && mounted) showInfoSnackBar(context, 'Pas de réseau : l’étape sera enregistrée automatiquement.');
      return true;
    } on ApiFailure catch (failure) {
      setState(() => _error = failure.fieldErrors.isEmpty ? failure.message : failure.fieldErrors.values.first.first);
      return false;
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
      return false;
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _next() async {
    if (!await _save() || !mounted) return;
    if (_step < _steps.length - 1) {
      setState(() => _step += 1);
    } else {
      ref.invalidate(projectDetailProvider(d.summary.id));
      context.pop();
    }
  }

  Widget _amountField(TextEditingController controller, String hint) => TextField(
        controller: controller,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9)],
        decoration: InputDecoration(suffixText: 'FCFA', hintText: hint),
        onChanged: (_) => setState(() {}),
      );

  List<Widget> _stepFields() => switch (_step) {
        0 => [
            const FieldLabel('Nom du projet'),
            TextField(controller: _title, maxLength: 120, textCapitalization: TextCapitalization.sentences),
            const FieldLabel('Secteur d’activité'),
            TextField(controller: _sector, maxLength: 80, decoration: const InputDecoration(hintText: 'Ex. Mécanique, commerce, restauration')),
            const FieldLabel('Ville'),
            TextField(controller: _city, maxLength: 60, textCapitalization: TextCapitalization.words),
            const FieldLabel('Quartier ou adresse (facultatif)'),
            TextField(controller: _location, maxLength: 120),
            const FieldLabel('Description du projet'),
            TextField(controller: _description, minLines: 4, maxLines: 8, maxLength: 3000, textCapitalization: TextCapitalization.sentences),
          ],
        1 => [
            const FieldLabel('Quel problème votre projet résout-il ?'),
            TextField(controller: _problem, minLines: 3, maxLines: 6, maxLength: 2000, textCapitalization: TextCapitalization.sentences),
            const FieldLabel('Votre solution'),
            TextField(controller: _solution, minLines: 3, maxLines: 6, maxLength: 2000, textCapitalization: TextCapitalization.sentences),
            const FieldLabel('Vos clients : qui sont-ils, combien, où ?'),
            TextField(controller: _market, minLines: 3, maxLines: 6, maxLength: 2000, textCapitalization: TextCapitalization.sentences),
          ],
        2 => [
            const Text('Détail du budget', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: BSpace.x2),
            for (final (index, line) in _lines.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: BSpace.x2),
                child: Row(children: [
                  Expanded(flex: 3, child: TextField(controller: line.label, decoration: const InputDecoration(hintText: 'Poste (ex. outillage)'))),
                  const SizedBox(width: BSpace.x2),
                  Expanded(flex: 2, child: _amountField(line.amount, 'Montant')),
                  IconButton(
                    tooltip: 'Retirer',
                    onPressed: () => setState(() => _lines.removeAt(index).dispose()),
                    icon: const Icon(Icons.remove_circle_outline, color: BColors.danger500),
                  ),
                ]),
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(onPressed: () => setState(() => _lines.add(_EditableLine('', ''))), icon: const Icon(Icons.add), label: const Text('Ajouter un poste')),
            ),
            _BudgetTotalHint(lines: _lines, onUse: (total) => setState(() => _budget.text = total)),
            const FieldLabel('Budget total'),
            _amountField(_budget, 'Ex. 1000000'),
            const FieldLabel('Apport personnel'),
            _amountField(_personal, '0'),
            const FieldLabel('Subvention demandée'),
            _amountField(_grant, 'Ex. 800000'),
            const SizedBox(height: BSpace.x2),
            const Text('Le budget total doit être égal au détail du budget, et à l’apport personnel + la subvention demandée.',
                style: TextStyle(color: BColors.textMuted, fontSize: 12.5)),
          ],
        _ => [
            const Text('Équipe', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: BSpace.x2),
            for (final (index, member) in _members.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: BSpace.x2),
                child: Row(children: [
                  Expanded(child: TextField(controller: member.name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(hintText: 'Nom'))),
                  const SizedBox(width: BSpace.x2),
                  Expanded(child: TextField(controller: member.role, decoration: const InputDecoration(hintText: 'Rôle'))),
                  IconButton(
                    tooltip: 'Retirer',
                    onPressed: () => setState(() => _members.removeAt(index).dispose()),
                    icon: const Icon(Icons.remove_circle_outline, color: BColors.danger500),
                  ),
                ]),
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(onPressed: () => setState(() => _members.add(_EditableMember('', ''))), icon: const Icon(Icons.person_add_alt), label: const Text('Ajouter une personne')),
            ),
            const SizedBox(height: BSpace.x3),
            const Text('Prévisions mensuelles (facultatif)', style: TextStyle(fontWeight: FontWeight.w800)),
            const FieldLabel('Chiffre d’affaires mensuel estimé'),
            _amountField(_revenue, 'Ex. 450000'),
            const FieldLabel('Charges mensuelles estimées'),
            _amountField(_costs, 'Ex. 210000'),
            const FieldLabel('Emplois créés'),
            TextField(
              controller: _jobs,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
            ),
          ],
      };

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(BSpace.x4, BSpace.x4, BSpace.x4, 0),
        child: Row(children: [
          for (var i = 0; i < _steps.length; i++)
            Expanded(
              child: Container(
                height: 6,
                margin: const EdgeInsets.symmetric(horizontal: 2),
                decoration: BoxDecoration(color: i <= _step ? BColors.primary500 : BColors.border, borderRadius: BorderRadius.circular(BRadius.pill)),
              ),
            ),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.all(BSpace.x4),
        child: Row(children: [
          Text('Étape ${_step + 1} sur ${_steps.length} · ', style: const TextStyle(color: BColors.textMuted)),
          Text(_steps[_step], style: const TextStyle(fontWeight: FontWeight.w800)),
        ]),
      ),
      Expanded(child: ListView(padding: const EdgeInsets.symmetric(horizontal: BSpace.x4), children: _stepFields())),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(BSpace.x4),
          child: Column(children: [
            if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x3)],
            Row(children: [
              if (_step > 0)
                Expanded(child: OutlinedButton(onPressed: _saving ? null : () => setState(() => _step -= 1), child: const Text('Précédent'))),
              if (_step > 0) const SizedBox(width: BSpace.x3),
              Expanded(
                child: LoadingButton(label: _step == _steps.length - 1 ? 'Enregistrer et terminer' : 'Enregistrer et continuer', loading: _saving, onPressed: _next),
              ),
            ]),
          ]),
        ),
      ),
    ]);
  }
}

/// Aide à la saisie : total des postes saisis (simple addition d'entiers, le serveur contrôle la cohérence à la soumission).
class _BudgetTotalHint extends StatelessWidget {
  const _BudgetTotalHint({required this.lines, required this.onUse});
  final List<_EditableLine> lines;
  final ValueChanged<String> onUse;

  @override
  Widget build(BuildContext context) {
    final total = lines.fold<int>(0, (sum, line) => sum + (int.tryParse(line.amount.text) ?? 0));
    if (total == 0) return const SizedBox.shrink();
    return Row(children: [
      Expanded(child: Text('Total des postes : $total FCFA', style: const TextStyle(fontWeight: FontWeight.w700))),
      TextButton(onPressed: () => onUse('$total'), child: const Text('Reprendre comme budget total')),
    ]);
  }
}
