import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'local_cache.g.dart';

class CachedJson {
  const CachedJson(this.json, this.updatedAt);
  final Object? json;
  final DateTime updatedAt;
}

/// Cache local des dernières réponses consultées : l'app reste navigable hors connexion (cahier §12).
/// Ce cache n'est jamais une source de vérité financière : l'interface indique la date des données.
abstract interface class LocalCache {
  Future<CachedJson?> read(String key);
  Future<void> write(String key, Object? json);
  Future<void> clear();
}

class CacheEntries extends Table {
  TextColumn get key => text()();
  TextColumn get payload => text()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {key};
}

@DriftDatabase(tables: [CacheEntries])
class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor]) : super(executor ?? driftDatabase(name: 'benskin_impact'));

  @override
  int get schemaVersion => 1;
}

class DriftLocalCache implements LocalCache {
  DriftLocalCache(this._db);
  final AppDatabase _db;

  @override
  Future<CachedJson?> read(String key) async {
    final row = await (_db.select(_db.cacheEntries)..where((t) => t.key.equals(key))).getSingleOrNull();
    return row == null ? null : CachedJson(jsonDecode(row.payload), row.updatedAt);
  }

  @override
  Future<void> write(String key, Object? json) {
    return _db.into(_db.cacheEntries).insertOnConflictUpdate(
          CacheEntriesCompanion.insert(key: key, payload: jsonEncode(json), updatedAt: DateTime.now()),
        );
  }

  @override
  Future<void> clear() => _db.delete(_db.cacheEntries).go();
}

/// Utilisé sur le web (aperçu développeur) où SQLite n'est pas configuré.
class MemoryLocalCache implements LocalCache {
  final _entries = <String, CachedJson>{};

  @override
  Future<CachedJson?> read(String key) async => _entries[key];

  @override
  Future<void> write(String key, Object? json) async {
    _entries[key] = CachedJson(jsonDecode(jsonEncode(json)), DateTime.now());
  }

  @override
  Future<void> clear() async => _entries.clear();
}
