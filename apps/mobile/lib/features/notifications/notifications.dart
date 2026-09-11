import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/money_format.dart';
import '../../core/network/api_client.dart';
import '../../core/network/app_failure.dart';
import '../../core/providers.dart';
import '../../core/theme/tokens.dart';
import '../../core/widgets/states.dart';

// Centre de notifications (cahier §7.23) : liste, lu / non lu, liens vers l'écran concerné.

class NotificationItem {
  const NotificationItem({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    this.deepLink,
    this.readAt,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final String? deepLink;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isRead => readAt != null;

  factory NotificationItem.fromJson(Map<String, dynamic> json) => NotificationItem(
        id: json['id'] as String,
        type: json['type'] as String,
        title: json['title'] as String,
        body: json['body'] as String,
        deepLink: json['deepLink'] as String?,
        readAt: json['readAt'] == null ? null : DateTime.parse(json['readAt'] as String),
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class NotificationsRepository {
  NotificationsRepository({required this.client});
  final ApiClient client;

  Future<List<NotificationItem>> list({int limit = 50}) => client.call(
        (dio) => dio.get('/notifications', queryParameters: {'limit': limit}),
        (json) => ((json as Map<String, dynamic>)['items'] as List<dynamic>)
            .map((e) => NotificationItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Future<int> unreadCount() => client.call(
        (dio) => dio.get('/notifications/unread-count'),
        (json) => ((json as Map<String, dynamic>)['count'] as num).toInt(),
      );

  Future<void> markRead(String id) => client.call((dio) => dio.post('/notifications/$id/read'), (_) {});

  Future<void> markAllRead() => client.call((dio) => dio.post('/notifications/read-all'), (_) {});
}

final notificationsRepositoryProvider = Provider<NotificationsRepository>(
  (ref) => NotificationsRepository(client: ref.watch(apiClientProvider)),
);

final notificationsProvider = FutureProvider.autoDispose<List<NotificationItem>>(
  (ref) => ref.watch(notificationsRepositoryProvider).list(),
);

final unreadNotificationsProvider = FutureProvider.autoDispose<int>(
  (ref) => ref.watch(notificationsRepositoryProvider).unreadCount(),
);

/// Cloche de l'en-tête avec le nombre de notifications non lues.
class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key, this.color = Colors.white});
  final Color color;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    return IconButton(
      tooltip: unread > 0 ? '$unread notification${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}' : 'Notifications',
      onPressed: () async {
        await context.push('/notifications');
        ref.invalidate(unreadNotificationsProvider);
      },
      icon: Badge(
        isLabelVisible: unread > 0,
        backgroundColor: BColors.accent500,
        label: Text(unread > 99 ? '99+' : '$unread'),
        child: Icon(Icons.notifications_none_rounded, color: color),
      ),
    );
  }
}

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  Future<void> _open(BuildContext context, WidgetRef ref, NotificationItem item) async {
    if (!item.isRead) {
      try {
        await ref.read(notificationsRepositoryProvider).markRead(item.id);
      } on AppFailure {
        // Hors ligne : la notification restera non lue, l'écran concerné s'ouvre quand même.
      }
      ref
        ..invalidate(notificationsProvider)
        ..invalidate(unreadNotificationsProvider);
    }
    if (item.deepLink != null && item.deepLink!.startsWith('/') && context.mounted) {
      context.push(item.deepLink!);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsProvider);
    final hasUnread = notifications.valueOrNull?.any((n) => !n.isRead) ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (hasUnread)
            TextButton(
              style: TextButton.styleFrom(foregroundColor: Colors.white),
              onPressed: () async {
                try {
                  await ref.read(notificationsRepositoryProvider).markAllRead();
                  ref
                    ..invalidate(notificationsProvider)
                    ..invalidate(unreadNotificationsProvider);
                } on AppFailure catch (failure) {
                  if (context.mounted) showFailureSnackBar(context, failure);
                }
              },
              child: const Text('Tout lire'),
            ),
        ],
      ),
      body: notifications.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 5)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(notificationsProvider)),
        data: (items) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(notificationsProvider);
            try {
              await ref.read(notificationsProvider.future);
            } catch (_) {}
          },
          child: items.isEmpty
              ? ListView(children: const [
                  SizedBox(height: BSpace.x12),
                  EmptyState(
                    icon: Icons.notifications_none_rounded,
                    title: 'Aucune notification',
                    message: 'Les confirmations de paiement, décisions et rappels apparaîtront ici.',
                  ),
                ])
              : ListView.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final item = items[index];
                    return ListTile(
                      minTileHeight: 72,
                      onTap: () => _open(context, ref, item),
                      leading: CircleAvatar(
                        backgroundColor: item.isRead ? BColors.neutral100 : BColors.primary50,
                        child: Icon(_iconFor(item.type), color: item.isRead ? BColors.textMuted : BColors.primary500),
                      ),
                      title: Text(
                        item.title,
                        style: TextStyle(fontWeight: item.isRead ? FontWeight.w600 : FontWeight.w800),
                      ),
                      subtitle: Text('${item.body}\n${formatDateTime(item.createdAt)}'),
                      isThreeLine: true,
                      trailing: item.isRead
                          ? null
                          : Container(
                              width: 10,
                              height: 10,
                              decoration: const BoxDecoration(color: BColors.accent500, shape: BoxShape.circle),
                            ),
                    );
                  },
                ),
        ),
      ),
    );
  }

  static IconData _iconFor(String type) {
    if (type.startsWith('PAYMENT')) return Icons.account_balance_wallet_outlined;
    if (type.startsWith('KYC')) return Icons.verified_user_outlined;
    if (type.startsWith('CONTRIBUTION')) return Icons.savings_outlined;
    if (type.startsWith('DRAW')) return Icons.emoji_events_outlined;
    if (type.startsWith('TRAINING')) return Icons.school_outlined;
    if (type.startsWith('ACCIDENT')) return Icons.health_and_safety_outlined;
    if (type.startsWith('SOLIDARITY')) return Icons.volunteer_activism_outlined;
    if (type.startsWith('SECURITY')) return Icons.shield_outlined;
    if (type.startsWith('SUPPORT')) return Icons.support_agent_rounded;
    if (type.startsWith('PROJECT')) return Icons.lightbulb_outline_rounded;
    if (type.startsWith('RECRUITMENT')) return Icons.work_outline_rounded;
    return Icons.notifications_none_rounded;
  }
}
