import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format/money_format.dart';
import '../../../core/format/phone_format.dart';
import '../../../core/router/app_router.dart';
import '../../../core/sync/sync_queue.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/widgets/status_badge.dart';
import '../../auth/application/session_controller.dart';

/// Profil & sécurité (cahier §7.24) : identité, accès aux modules personnels, sécurité, aide, déconnexion.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final pending = ref.read(syncQueueProvider).actions.length;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Se déconnecter ?'),
        content: Text(
          'Vous devrez saisir votre numéro et votre code PIN pour vous reconnecter.'
          '${pending > 0 ? '\n\nAttention : $pending action${pending > 1 ? 's' : ''} non synchronisée${pending > 1 ? 's' : ''} ser${pending > 1 ? 'ont' : 'a'} perdue${pending > 1 ? 's' : ''}.' : ''}',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Annuler')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: BColors.danger500, minimumSize: const Size(0, BSize.touchTarget)),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Se déconnecter'),
          ),
        ],
      ),
    );
    if (confirmed == true) await ref.read(sessionControllerProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    if (session is! SignedIn) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final user = session.user;
    final text = Theme.of(context).textTheme;

    return Scaffold(
      body: ListView(padding: EdgeInsets.zero, children: [
        Container(
          decoration: const BoxDecoration(gradient: BColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(28))),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(BSpace.x4, BSpace.x6, BSpace.x4, BSpace.x6),
              child: Column(children: [
                CircleAvatar(
                  radius: 40,
                  backgroundColor: BColors.accent500,
                  child: Text(user.initials, style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
                ),
                const SizedBox(height: BSpace.x3),
                Text('${user.profile.firstName} ${user.profile.lastName}', style: text.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text('+237 ${CameroonPhone.pretty(user.phone)}', style: text.bodyMedium?.copyWith(color: Colors.white70)),
                const SizedBox(height: BSpace.x3),
                StatusBadge.kyc(user.profile.kycStatus),
              ]),
            ),
          ),
        ),
        if (session.offline)
          const Padding(
            padding: EdgeInsets.fromLTRB(BSpace.x4, BSpace.x4, BSpace.x4, 0),
            child: Text('Profil affiché hors ligne.', style: TextStyle(color: BColors.warning700, fontWeight: FontWeight.w600)),
          ),
        Padding(
          padding: const EdgeInsets.all(BSpace.x4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const _SectionTitle('Mon compte'),
            _Group(children: [
              _SettingTile(
                icon: Icons.location_on_outlined,
                title: 'Ville',
                subtitle: [user.profile.city, if (user.profile.zone != null) user.profile.zone!].join(' — '),
              ),
              _SettingTile(
                icon: Icons.verified_user_outlined,
                title: 'Vérification d’identité',
                trailing: StatusBadge.kyc(user.profile.kycStatus),
                onTap: () => context.push(Routes.kyc),
              ),
            ]),
            const _SectionTitle('Mon parcours'),
            _Group(children: [
              _SettingTile(icon: Icons.route_outlined, title: 'Mon parcours', onTap: () => context.push(Routes.program)),
              _SettingTile(icon: Icons.workspace_premium_outlined, title: 'Formation et certificat', onTap: () => context.push(Routes.training)),
              _SettingTile(icon: Icons.lightbulb_outline_rounded, title: 'Mes projets', onTap: () => context.push(Routes.projects)),
              _SettingTile(icon: Icons.storefront_outlined, title: 'Mes entreprises', onTap: () => context.push(Routes.companies)),
              _SettingTile(icon: Icons.assignment_outlined, title: 'Mes candidatures', onTap: () => context.push('${Routes.recruitment}?tab=applications')),
            ]),
            const _SectionTitle('Sécurité'),
            _Group(children: [
              _SettingTile(
                icon: Icons.shield_outlined,
                title: 'Code PIN, biométrie et appareils',
                onTap: () => context.push(Routes.security),
              ),
            ]),
            const _SectionTitle('Aide & solidarité'),
            _Group(children: [
              _SettingTile(icon: Icons.health_and_safety_outlined, title: 'Accidents & solidarité', onTap: () => context.push(Routes.accidents)),
              _SettingTile(icon: Icons.support_agent_rounded, title: 'Aide & support', onTap: () => context.push(Routes.support)),
            ]),
            const SizedBox(height: BSpace.x6),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(foregroundColor: BColors.danger500, side: const BorderSide(color: BColors.danger500, width: 1.5)),
              onPressed: () => _confirmLogout(context, ref),
              icon: const Icon(Icons.logout_rounded),
              label: const Text('Se déconnecter'),
            ),
            const SizedBox(height: BSpace.x4),
            Text('Membre depuis le ${formatDate(user.createdAt)}', textAlign: TextAlign.center, style: text.bodySmall?.copyWith(color: BColors.textMuted)),
          ]),
        ),
      ]),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(BSpace.x1, BSpace.x4, 0, BSpace.x2),
      child: Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(children: [
        for (final (index, child) in children.indexed) ...[if (index > 0) const Divider(indent: 56), child],
      ]),
    );
  }
}

class _SettingTile extends StatelessWidget {
  const _SettingTile({required this.icon, required this.title, this.subtitle, this.trailing, this.onTap});
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 56,
      leading: Icon(icon, color: BColors.primary500),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: subtitle == null ? null : Text(subtitle!),
      trailing: trailing ?? (onTap == null ? null : const Icon(Icons.chevron_right_rounded, color: BColors.textMuted)),
      onTap: onTap,
    );
  }
}
