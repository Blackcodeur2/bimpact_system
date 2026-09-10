import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../format/money_format.dart';
import '../network/app_failure.dart';
import '../providers.dart';
import '../theme/tokens.dart';

/// Bloc gris animé affiché pendant le chargement (skeleton — cahier §2).
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({super.key, this.height = 16, this.width, this.radius = BRadius.sm});
  final double height;
  final double? width;
  final double radius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox> with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 0.45, end: 1.0).animate(_controller),
      child: Container(
        height: widget.height,
        width: widget.width,
        decoration: BoxDecoration(color: BColors.neutral100, borderRadius: BorderRadius.circular(widget.radius)),
      ),
    );
  }
}

class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 5});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < count; i++)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: BSpace.x3),
            child: Row(children: [
              SkeletonBox(height: 40, width: 40, radius: 20),
              SizedBox(width: BSpace.x3),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SkeletonBox(height: 14, width: 140),
                SizedBox(height: BSpace.x2),
                SkeletonBox(height: 12, width: 90),
              ])),
              SkeletonBox(height: 14, width: 70),
            ]),
          ),
      ],
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.message, this.action});
  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.all(BSpace.x6),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          padding: const EdgeInsets.all(BSpace.x4),
          decoration: const BoxDecoration(color: BColors.primary50, shape: BoxShape.circle),
          child: Icon(icon, size: 32, color: BColors.primary500),
        ),
        const SizedBox(height: BSpace.x4),
        Text(title, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w700), textAlign: TextAlign.center),
        const SizedBox(height: BSpace.x2),
        Text(message, style: text.bodyMedium?.copyWith(color: BColors.textMuted), textAlign: TextAlign.center),
        if (action != null) ...[const SizedBox(height: BSpace.x4), action!],
      ]),
    );
  }
}

class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final failure = toAppFailure(error);
    final offline = failure is NetworkFailure;
    return EmptyState(
      icon: offline ? Icons.wifi_off_rounded : Icons.error_outline_rounded,
      title: offline ? 'Vous êtes hors ligne' : 'Chargement impossible',
      message: failure.message,
      action: OutlinedButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh_rounded),
        label: const Text('Réessayer'),
      ),
    );
  }
}

/// Bandeau affiché quand l'appareil n'a plus de réseau.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(connectivityProvider).valueOrNull ?? true;
    return AnimatedSize(
      duration: const Duration(milliseconds: 200),
      child: online
          ? const SizedBox(width: double.infinity)
          : Container(
              width: double.infinity,
              color: BColors.warning500,
              padding: const EdgeInsets.symmetric(horizontal: BSpace.x4, vertical: BSpace.x2),
              child: const Row(children: [
                Icon(Icons.wifi_off_rounded, color: Colors.white, size: 18),
                SizedBox(width: BSpace.x2),
                Expanded(
                  child: Text('Hors ligne — affichage des dernières données enregistrées',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13)),
                ),
              ]),
            ),
    );
  }
}

/// Indique clairement que les données affichées proviennent du cache.
class CachedDataNotice extends StatelessWidget {
  const CachedDataNotice({super.key, required this.cachedAt});
  final DateTime cachedAt;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: BSpace.x3, vertical: BSpace.x2),
      decoration: BoxDecoration(color: BColors.warning50, borderRadius: BorderRadius.circular(BRadius.sm)),
      child: Row(children: [
        const Icon(Icons.history_rounded, size: 16, color: BColors.warning700),
        const SizedBox(width: BSpace.x2),
        Expanded(
          child: Text('Données du ${formatDateTime(cachedAt)} — non actualisées',
              style: const TextStyle(color: BColors.warning700, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }
}

class ComingSoonBadge extends StatelessWidget {
  const ComingSoonBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: BSpace.x2, vertical: 2),
      decoration: BoxDecoration(color: BColors.neutral100, borderRadius: BorderRadius.circular(999)),
      child: const Text('Bientôt', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: BColors.textMuted)),
    );
  }
}

void showFailureSnackBar(BuildContext context, Object error) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(toAppFailure(error).message)));
}
