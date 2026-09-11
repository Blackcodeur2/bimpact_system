import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/remote_config.dart';
import '../../../core/format/money_format.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/feedback.dart';
import '../../../core/widgets/states.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../core/widgets/sync_status.dart';
import '../../support/support_data.dart';

/// Support (cahier §7.25) : contacts réellement configurés, FAQ fournie par l'API, demandes suivies.
class SupportScreen extends ConsumerWidget {
  const SupportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(remoteConfigProvider).valueOrNull?.data;
    final faq = ref.watch(faqProvider);
    final tickets = ref.watch(ticketsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Aide & support')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/profile/support/new'),
        icon: const Icon(Icons.edit_outlined),
        label: const Text('Nouvelle demande'),
      ),
      body: Column(children: [
        const SyncStatusBanner(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              ref
                ..invalidate(ticketsProvider)
                ..invalidate(faqProvider);
              try {
                await ref.read(ticketsProvider.future);
              } catch (_) {}
            },
            child: ListView(padding: const EdgeInsets.fromLTRB(BSpace.x4, BSpace.x4, BSpace.x4, 96), children: [
              _ContactsCard(contacts: config?.support),
              const SizedBox(height: BSpace.x6),
              const _SectionTitle('Mes demandes'),
              tickets.when(
                loading: () => const SkeletonList(count: 2),
                error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(ticketsProvider)),
                data: (items) => items.isEmpty
                    ? const Card(
                        child: EmptyState(
                          icon: Icons.forum_outlined,
                          title: 'Aucune demande',
                          message: 'Posez votre question à l’équipe : vous serez notifié de sa réponse.',
                        ),
                      )
                    : Card(
                        clipBehavior: Clip.antiAlias,
                        child: Column(children: [
                          for (final (index, ticket) in items.indexed) ...[
                            if (index > 0) const Divider(indent: BSpace.x4),
                            ListTile(
                              onTap: () => context.push('/profile/support/tickets/${ticket.id}'),
                              title: Text(ticket.subject, style: const TextStyle(fontWeight: FontWeight.w700)),
                              subtitle: Text('${ticket.reference} · ${ticket.categoryLabel}\nMis à jour le ${formatDateTime(ticket.lastMessageAt)}'),
                              isThreeLine: true,
                              trailing: _TicketBadge(status: ticket.status),
                            ),
                          ],
                        ]),
                      ),
              ),
              const SizedBox(height: BSpace.x6),
              const _SectionTitle('Questions fréquentes'),
              faq.when(
                loading: () => const SkeletonList(count: 3),
                error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(faqProvider)),
                data: (loaded) => Column(children: [
                  if (loaded.cachedAt != null) ...[CachedDataNotice(cachedAt: loaded.cachedAt!), const SizedBox(height: BSpace.x2)],
                  for (final item in loaded.data)
                    Card(
                      margin: const EdgeInsets.only(bottom: BSpace.x2),
                      clipBehavior: Clip.antiAlias,
                      child: ExpansionTile(
                        title: Text(item.question, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                        childrenPadding: const EdgeInsets.fromLTRB(BSpace.x4, 0, BSpace.x4, BSpace.x4),
                        children: [Text(item.answer, style: const TextStyle(color: BColors.textMuted, height: 1.45))],
                      ),
                    ),
                ]),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _ContactsCard extends StatelessWidget {
  const _ContactsCard({required this.contacts});
  final SupportContacts? contacts;

  Future<void> _open(BuildContext context, Uri uri) async {
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false);
    if (!opened && context.mounted) showErrorSnackBar(context, 'Impossible d’ouvrir l’application correspondante.');
  }

  @override
  Widget build(BuildContext context) {
    final c = contacts;
    if (c == null || c.isEmpty) {
      return const Card(
        child: ListTile(
          leading: Icon(Icons.support_agent_rounded, color: BColors.primary500),
          title: Text('Écrivez-nous', style: TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text('Créez une demande ci-dessous : l’équipe vous répond dans l’application et vous êtes notifié.'),
        ),
      );
    }
    String digits(String value) => value.replaceAll(RegExp(r'[^\d+]'), '');
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(children: [
        if (c.emergencyPhone != null)
          ListTile(
            tileColor: BColors.danger50,
            leading: const Icon(Icons.emergency_rounded, color: BColors.danger500),
            title: const Text('Urgence', style: TextStyle(fontWeight: FontWeight.w800, color: BColors.danger500)),
            subtitle: Text(c.emergencyPhone!),
            trailing: const Icon(Icons.call_rounded, color: BColors.danger500),
            onTap: () => _open(context, Uri(scheme: 'tel', path: digits(c.emergencyPhone!))),
          ),
        if (c.phone != null)
          ListTile(
            leading: const Icon(Icons.call_outlined, color: BColors.primary500),
            title: const Text('Appeler le support', style: TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text([c.phone!, if (c.hours != null) c.hours!].join(' · ')),
            onTap: () => _open(context, Uri(scheme: 'tel', path: digits(c.phone!))),
          ),
        if (c.whatsapp != null)
          ListTile(
            leading: const Icon(Icons.chat_outlined, color: BColors.growth600),
            title: const Text('WhatsApp', style: TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(c.whatsapp!),
            onTap: () => _open(context, Uri.parse('https://wa.me/${digits(c.whatsapp!).replaceAll('+', '')}')),
          ),
        if (c.email != null)
          ListTile(
            leading: const Icon(Icons.mail_outline_rounded, color: BColors.primary500),
            title: const Text('E-mail', style: TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(c.email!),
            onTap: () => _open(context, Uri(scheme: 'mailto', path: c.email!)),
          ),
      ]),
    );
  }
}

class _TicketBadge extends StatelessWidget {
  const _TicketBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final tone = switch (status) {
      'PENDING' => BadgeTone.warning,
      'RESOLVED' => BadgeTone.success,
      'CLOSED' => BadgeTone.neutral,
      _ => BadgeTone.info,
    };
    return StatusBadge(label: supportStatusLabel(status), tone: tone);
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BSpace.x3),
      child: Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
    );
  }
}
