import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/app_failure.dart';
import '../../../core/providers.dart';
import '../../../core/storage/token_store.dart';
import '../domain/auth_models.dart';

sealed class SessionState {
  const SessionState();
}

/// Au lancement : lecture des jetons et du profil (écran Splash).
final class SessionRestoring extends SessionState {
  const SessionRestoring();
}

enum SignedOutReason { expired, loggedOut }

final class SignedOut extends SessionState {
  const SignedOut({this.reason});
  final SignedOutReason? reason;
}

final class SignedIn extends SessionState {
  const SignedIn(this.user, {this.offline = false});
  final MeUser user;

  /// Profil issu du cache local faute de réseau.
  final bool offline;
}

final sessionControllerProvider = NotifierProvider<SessionController, SessionState>(SessionController.new);

class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() => const SessionRestoring();

  Future<void> restore() async {
    final tokens = await ref.read(tokenStoreProvider).read();
    if (tokens == null) {
      state = const SignedOut();
      return;
    }
    final repository = ref.read(authRepositoryProvider);
    try {
      state = SignedIn(await repository.me());
    } on NetworkFailure {
      final cached = await repository.cachedMe();
      state = cached != null ? SignedIn(cached, offline: true) : const SignedOut();
    } on AppFailure {
      await _clearLocalData();
      state = const SignedOut(reason: SignedOutReason.expired);
    }
  }

  Future<void> signIn(AuthResult result) async {
    await ref.read(tokenStoreProvider).save(
          StoredTokens(accessToken: result.tokens.accessToken, refreshToken: result.tokens.refreshToken),
        );
    await ref.read(authRepositoryProvider).cacheMe(result.user);
    state = SignedIn(result.user);
  }

  Future<void> reloadUser() async {
    try {
      state = SignedIn(await ref.read(authRepositoryProvider).me());
    } on NetworkFailure {
      // On garde le profil affiché.
    }
  }

  Future<void> logout() async {
    try {
      await ref.read(authRepositoryProvider).logout();
    } on AppFailure {
      // Hors ligne : les jetons locaux sont tout de même supprimés, l'appareil ne peut plus s'en servir.
    }
    await _clearLocalData();
    state = const SignedOut(reason: SignedOutReason.loggedOut);
  }

  /// Appelé par le client HTTP quand la session est révoquée ou ne peut plus être renouvelée.
  Future<void> onSessionExpired() async {
    if (state is SignedOut) return;
    await _clearLocalData();
    state = const SignedOut(reason: SignedOutReason.expired);
  }

  Future<void> _clearLocalData() async {
    await ref.read(tokenStoreProvider).clear();
    await ref.read(localCacheProvider).clear();
  }
}
