import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../network/app_failure.dart';
import '../providers.dart';
import '../storage/local_cache.dart';

enum PendingActionStatus { pending, failed }

/// Action saisie par le membre et pas encore confirmée par le serveur.
class PendingAction {
  const PendingAction({
    required this.id,
    required this.kind,
    required this.label,
    required this.method,
    required this.path,
    required this.idempotencyKey,
    required this.createdAt,
    required this.nextAttemptAt,
    this.body,
    this.attempts = 0,
    this.status = PendingActionStatus.pending,
    this.lastError,
  });

  final String id;

  /// Domaine concerné (« accident », « support », « project »…) : l'écran correspondant se recharge après synchronisation.
  final String kind;

  /// Libellé montré au membre, ex. « Déclaration d’accident ».
  final String label;
  final String method;
  final String path;
  final Map<String, dynamic>? body;
  final String idempotencyKey;
  final DateTime createdAt;
  final int attempts;
  final DateTime nextAttemptAt;
  final PendingActionStatus status;
  final String? lastError;

  PendingAction copyWith({int? attempts, DateTime? nextAttemptAt, PendingActionStatus? status, String? Function()? lastError}) {
    return PendingAction(
      id: id,
      kind: kind,
      label: label,
      method: method,
      path: path,
      body: body,
      idempotencyKey: idempotencyKey,
      createdAt: createdAt,
      attempts: attempts ?? this.attempts,
      nextAttemptAt: nextAttemptAt ?? this.nextAttemptAt,
      status: status ?? this.status,
      lastError: lastError != null ? lastError() : this.lastError,
    );
  }
}

abstract interface class PendingActionStore {
  Future<List<PendingAction>> all();
  Future<void> save(PendingAction action);
  Future<void> remove(String id);
  Future<void> clear();
}

class DriftPendingActionStore implements PendingActionStore {
  DriftPendingActionStore(this._db);
  final AppDatabase _db;

  @override
  Future<List<PendingAction>> all() async {
    final rows = await (_db.select(_db.pendingActions)..orderBy([(t) => OrderingTerm.asc(t.createdAt)])).get();
    return rows
        .map((row) => PendingAction(
              id: row.id,
              kind: row.kind,
              label: row.label,
              method: row.method,
              path: row.path,
              body: row.body == null ? null : jsonDecode(row.body!) as Map<String, dynamic>,
              idempotencyKey: row.idempotencyKey,
              createdAt: row.createdAt,
              attempts: row.attempts,
              nextAttemptAt: row.nextAttemptAt,
              status: row.status == 'failed' ? PendingActionStatus.failed : PendingActionStatus.pending,
              lastError: row.lastError,
            ))
        .toList();
  }

  @override
  Future<void> save(PendingAction action) {
    return _db.into(_db.pendingActions).insertOnConflictUpdate(PendingActionsCompanion.insert(
          id: action.id,
          kind: action.kind,
          label: action.label,
          method: action.method,
          path: action.path,
          body: Value(action.body == null ? null : jsonEncode(action.body)),
          idempotencyKey: action.idempotencyKey,
          createdAt: action.createdAt,
          attempts: Value(action.attempts),
          nextAttemptAt: action.nextAttemptAt,
          status: action.status.name,
          lastError: Value(action.lastError),
        ));
  }

  @override
  Future<void> remove(String id) => (_db.delete(_db.pendingActions)..where((t) => t.id.equals(id))).go();

  @override
  Future<void> clear() => _db.delete(_db.pendingActions).go();
}

/// Web (aperçu développeur) et tests.
class MemoryPendingActionStore implements PendingActionStore {
  final _actions = <String, PendingAction>{};

  @override
  Future<List<PendingAction>> all() async => _actions.values.toList()..sort((a, b) => a.createdAt.compareTo(b.createdAt));

  @override
  Future<void> save(PendingAction action) async => _actions[action.id] = action;

  @override
  Future<void> remove(String id) async => _actions.remove(id);

  @override
  Future<void> clear() async => _actions.clear();
}

/// Délai avant un nouvel essai : 5 s, 10 s, 20 s… plafonné à 30 minutes.
Duration retryDelay(int attempts) {
  final seconds = 5 * math.pow(2, math.max(0, attempts - 1));
  return Duration(seconds: math.min(30 * 60, seconds.toInt()));
}

/// Réponses signifiant que l'action a déjà été prise en compte lors d'un envoi précédent.
const _alreadyAppliedCodes = {'ALREADY_APPLIED'};

sealed class SubmitOutcome {
  const SubmitOutcome();
}

final class SubmitSent extends SubmitOutcome {
  const SubmitSent(this.response);
  final Object? response;
}

final class SubmitQueued extends SubmitOutcome {
  const SubmitQueued(this.action);
  final PendingAction action;
}

class SyncState {
  const SyncState({this.actions = const [], this.syncing = false, this.revisions = const {}});

  final List<PendingAction> actions;
  final bool syncing;

  /// Compteur par domaine incrémenté à chaque action confirmée par le serveur.
  final Map<String, int> revisions;

  int get pendingCount => actions.where((a) => a.status == PendingActionStatus.pending).length;
  int get failedCount => actions.where((a) => a.status == PendingActionStatus.failed).length;

  SyncState copyWith({List<PendingAction>? actions, bool? syncing, Map<String, int>? revisions}) => SyncState(
        actions: actions ?? this.actions,
        syncing: syncing ?? this.syncing,
        revisions: revisions ?? this.revisions,
      );
}

/// File de synchronisation (cahier §12) : envoi immédiat, conservation hors ligne, nouvel essai exponentiel,
/// même clé d'idempotence à chaque essai. Une action n'est considérée comme faite qu'après la réponse du serveur.
class SyncQueueController extends Notifier<SyncState> {
  Timer? _timer;
  bool _flushing = false;

  @override
  SyncState build() {
    ref.listen<AsyncValue<bool>>(connectivityProvider, (_, next) {
      if (next.valueOrNull == true) unawaited(flush());
    });
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => unawaited(flush()));
    ref.onDispose(() => _timer?.cancel());
    unawaited(_load());
    return const SyncState();
  }

  PendingActionStore get _store => ref.read(pendingActionStoreProvider);

  Future<void> _load() async {
    final actions = await _store.all();
    state = state.copyWith(actions: actions);
    await flush();
  }

  /// Envoie l'action. Sans réseau, elle est conservée et renvoyée automatiquement ; une erreur métier est remontée à l'écran.
  Future<SubmitOutcome> submit({
    required String kind,
    required String label,
    required String method,
    required String path,
    Map<String, dynamic>? body,
  }) async {
    final now = DateTime.now();
    final action = PendingAction(
      id: const Uuid().v4(),
      kind: kind,
      label: label,
      method: method,
      path: path,
      body: body,
      idempotencyKey: const Uuid().v4(),
      createdAt: now,
      nextAttemptAt: now,
    );
    try {
      final response = await _send(action);
      _bump(kind);
      return SubmitSent(response);
    } on NetworkFailure {
      final queued = action.copyWith(attempts: 1, nextAttemptAt: DateTime.now().add(retryDelay(1)));
      await _store.save(queued);
      state = state.copyWith(actions: [...state.actions, queued]);
      return SubmitQueued(queued);
    }
  }

  Future<void> flush() async {
    if (_flushing) return;
    final now = DateTime.now();
    final due = state.actions.where((a) => a.status == PendingActionStatus.pending && !a.nextAttemptAt.isAfter(now)).toList();
    if (due.isEmpty) return;

    _flushing = true;
    state = state.copyWith(syncing: true);
    try {
      for (final action in due) {
        try {
          await _send(action);
          await _confirm(action);
        } on NetworkFailure {
          final retry = action.copyWith(attempts: action.attempts + 1, nextAttemptAt: DateTime.now().add(retryDelay(action.attempts + 1)));
          await _store.save(retry);
          _replace(action.id, retry);
          break; // Toujours hors ligne : les actions suivantes attendront le prochain essai.
        } on ApiFailure catch (failure) {
          if (_alreadyAppliedCodes.contains(failure.code)) {
            await _confirm(action);
            continue;
          }
          final failed = action.copyWith(status: PendingActionStatus.failed, lastError: () => failure.message);
          await _store.save(failed);
          _replace(action.id, failed);
        } on AppFailure catch (failure) {
          final failed = action.copyWith(status: PendingActionStatus.failed, lastError: () => failure.message);
          await _store.save(failed);
          _replace(action.id, failed);
        }
      }
    } finally {
      _flushing = false;
      state = state.copyWith(syncing: false);
    }
  }

  Future<void> retry(String id) async {
    final action = state.actions.where((a) => a.id == id).firstOrNull;
    if (action == null) return;
    final ready = action.copyWith(status: PendingActionStatus.pending, nextAttemptAt: DateTime.now(), lastError: () => null);
    await _store.save(ready);
    _replace(id, ready);
    await flush();
  }

  Future<void> discard(String id) async {
    await _store.remove(id);
    _replace(id, null);
  }

  /// À la déconnexion : les actions d'un membre ne doivent jamais partir avec la session d'un autre.
  Future<void> clearAll() async {
    await _store.clear();
    state = state.copyWith(actions: const []);
  }

  Future<void> _confirm(PendingAction action) async {
    await _store.remove(action.id);
    _replace(action.id, null);
    _bump(action.kind);
  }

  Future<Object?> _send(PendingAction action) {
    return ref.read(apiClientProvider).call<Object?>(
          (dio) => dio.request<dynamic>(
            action.path,
            data: action.body,
            options: Options(method: action.method, headers: {'Idempotency-Key': action.idempotencyKey}),
          ),
          (json) => json,
        );
  }

  void _replace(String id, PendingAction? replacement) {
    state = state.copyWith(
      actions: [
        for (final action in state.actions)
          if (action.id != id) action else ?replacement,
      ],
    );
  }

  void _bump(String kind) {
    state = state.copyWith(revisions: {...state.revisions, kind: (state.revisions[kind] ?? 0) + 1});
  }
}

final syncQueueProvider = NotifierProvider<SyncQueueController, SyncState>(SyncQueueController.new);

/// À surveiller dans les providers de lecture : ils se rechargent quand une action de leur domaine est synchronisée.
final syncRevisionProvider = Provider.family<int, String>(
  (ref, kind) => ref.watch(syncQueueProvider.select((state) => state.revisions[kind] ?? 0)),
);
