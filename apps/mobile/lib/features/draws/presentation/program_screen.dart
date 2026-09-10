import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/tokens.dart';
import '../../../core/widgets/states.dart';
import '../draws_data.dart';

/// Parcours dans le programme (cahier §7.12) : étapes, progression et prochaine action.
class ProgramScreen extends ConsumerWidget {
  const ProgramScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final program = ref.watch(programProvider);
    return Scaffold(
      backgroundColor: BColors.background,
      appBar: AppBar(title: const Text('Mon parcours')),
      body: program.when(
        loading: () => const Padding(padding: EdgeInsets.all(BSpace.x4), child: SkeletonList(count: 5)),
        error: (error, _) => ErrorState(error: error, onRetry: () => ref.invalidate(programProvider)),
        data: (p) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(programProvider);
            try {
              await ref.read(programProvider.future);
            } catch (_) {}
          },
          child: ListView(padding: const EdgeInsets.all(BSpace.x4), children: [
            _Header(program: p),
            const SizedBox(height: BSpace.x4),
            if (p.nextActionLabel != null && p.nextActionLink != null) ...[
              FilledButton.icon(
                onPressed: () => context.push(p.nextActionLink!),
                icon: const Icon(Icons.arrow_forward_rounded),
                label: Text(p.nextActionLabel!),
              ),
              const SizedBox(height: BSpace.x4),
            ],
            for (final (index, milestone) in p.milestones.indexed)
              _MilestoneTile(milestone: milestone, isLast: index == p.milestones.length - 1),
          ]),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.program});
  final ProgramOverview program;

  @override
  Widget build(BuildContext context) {
    final statusLabel = switch (program.programStatus) {
      'COMPLETED' => 'Parcours terminé',
      'PAUSED' => 'Parcours suspendu',
      'ACTIVE' => program.beneficiaryStatus != null ? 'Bénéficiaire du programme' : 'Parcours en cours',
      _ => 'Parcours à démarrer',
    };
    return Container(
      padding: const EdgeInsets.all(BSpace.x6),
      decoration: BoxDecoration(gradient: BColors.brandGradient, borderRadius: BorderRadius.circular(BRadius.xl), boxShadow: BShadow.raised),
      child: Row(children: [
        SizedBox(
          width: 76,
          height: 76,
          child: Stack(fit: StackFit.expand, children: [
            CircularProgressIndicator(
              value: program.completionPercent / 100,
              strokeWidth: 7,
              backgroundColor: Colors.white24,
              valueColor: const AlwaysStoppedAnimation<Color>(BColors.accent500),
            ),
            Center(
              child: Text('${program.completionPercent} %',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
            ),
          ]),
        ),
        const SizedBox(width: BSpace.x4),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(statusLabel, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800)),
            if (program.drawTitle != null)
              Text('Sélectionné : ${program.drawTitle}', style: const TextStyle(color: Colors.white70, fontSize: 13)),
            if (program.mentorName != null)
              Text('Mentor : ${program.mentorName}', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
          ]),
        ),
      ]),
    );
  }
}

class _MilestoneTile extends StatelessWidget {
  const _MilestoneTile({required this.milestone, required this.isLast});
  final ProgramMilestone milestone;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (milestone.status) {
      'DONE' => (Icons.check_circle_rounded, BColors.growth500),
      'IN_PROGRESS' => (Icons.timelapse_rounded, BColors.accent500),
      'LOCKED' => (Icons.lock_outline_rounded, BColors.neutral400),
      _ => (Icons.radio_button_unchecked_rounded, BColors.primary500),
    };
    final progress = milestone.progressTarget != null && milestone.progressTarget! > 0
        ? (milestone.progressCurrent! / milestone.progressTarget!).clamp(0.0, 1.0)
        : null;

    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          width: 36,
          child: Column(children: [
            Icon(icon, color: color, size: 28),
            if (!isLast) Expanded(child: Container(width: 2, color: BColors.border)),
          ]),
        ),
        const SizedBox(width: BSpace.x3),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: BSpace.x6),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                milestone.title,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                  color: milestone.status == 'LOCKED' ? BColors.textMuted : BColors.text,
                ),
              ),
              const SizedBox(height: 2),
              Text(milestone.detail, style: const TextStyle(color: BColors.textMuted, fontSize: 13)),
              if (progress != null) ...[
                const SizedBox(height: BSpace.x2),
                ClipRRect(
                  borderRadius: BorderRadius.circular(BRadius.pill),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 6,
                    backgroundColor: BColors.neutral100,
                    valueColor: AlwaysStoppedAnimation<Color>(color),
                  ),
                ),
              ],
              if (milestone.actionLabel != null && milestone.actionLink != null && milestone.status != 'DONE')
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(onPressed: () => context.push(milestone.actionLink!), child: Text(milestone.actionLabel!)),
                ),
            ]),
          ),
        ),
      ]),
    );
  }
}
