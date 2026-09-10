/// Donnée chargée, fraîche ou issue du cache local (mode hors ligne).
class Loaded<T> {
  const Loaded(this.data, {this.cachedAt});

  final T data;

  /// Renseigné quand la donnée vient du cache faute de réseau.
  final DateTime? cachedAt;

  bool get isFromCache => cachedAt != null;
}
