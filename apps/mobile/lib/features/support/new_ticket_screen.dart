import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/app_failure.dart';
import '../../core/sync/sync_queue.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/feedback.dart';
import '../../core/widgets/fields.dart';
import 'support_data.dart';

/// Nouvelle demande au support ; hors connexion, elle est enregistrée et envoyée au retour du réseau.
class NewTicketScreen extends ConsumerStatefulWidget {
  const NewTicketScreen({super.key});

  @override
  ConsumerState<NewTicketScreen> createState() => _NewTicketScreenState();
}

class _NewTicketScreenState extends ConsumerState<NewTicketScreen> {
  final _form = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _message = TextEditingController();
  String _category = 'OTHER';
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    setState(() => _sending = true);
    try {
      final outcome = await ref.read(syncQueueProvider.notifier).submit(
            kind: 'support',
            label: 'Demande au support : ${_subject.text.trim()}',
            method: 'POST',
            path: '/support/tickets',
            body: {'category': _category, 'subject': _subject.text.trim(), 'message': _message.text.trim()},
          );
      if (!mounted) return;
      switch (outcome) {
        case SubmitSent(:final response):
          final ticket = SupportTicket.fromJson(response as Map<String, dynamic>);
          context.pushReplacement('/profile/support/tickets/${ticket.id}');
        case SubmitQueued():
          showInfoSnackBar(context, 'Pas de réseau : votre demande est enregistrée et sera envoyée automatiquement.');
          context.pop();
      }
    } on AppFailure catch (failure) {
      setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nouvelle demande')),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
          const FieldLabel('Sujet de la demande'),
          DropdownButtonFormField<String>(
            initialValue: _category,
            items: [for (final entry in supportCategories.entries) DropdownMenuItem(value: entry.key, child: Text(entry.value))],
            onChanged: (value) => setState(() => _category = value ?? 'OTHER'),
          ),
          const SizedBox(height: BSpace.x4),
          const FieldLabel('Titre'),
          TextFormField(
            controller: _subject,
            maxLength: 120,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(hintText: 'Ex. Rechargement non crédité'),
            validator: (value) => (value ?? '').trim().length < 5 ? '5 caractères minimum.' : null,
          ),
          const SizedBox(height: BSpace.x2),
          const FieldLabel('Votre message'),
          TextFormField(
            controller: _message,
            minLines: 5,
            maxLines: 10,
            maxLength: 2000,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(hintText: 'Décrivez la situation : date, montant, référence éventuelle…'),
            validator: (value) => (value ?? '').trim().length < 10 ? '10 caractères minimum.' : null,
          ),
          const SizedBox(height: BSpace.x2),
          const Text(
            'N’indiquez jamais votre code PIN : l’équipe ne vous le demandera pas.',
            style: TextStyle(color: BColors.warning700, fontWeight: FontWeight.w600, fontSize: 13),
          ),
          const SizedBox(height: BSpace.x4),
          if (_error != null) ...[FormErrorBanner(_error!), const SizedBox(height: BSpace.x4)],
          LoadingButton(label: 'Envoyer', loading: _sending, onPressed: _submit),
        ]),
      ),
    );
  }
}
