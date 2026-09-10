# Sécurité — mesures en place

Référentiels visés : OWASP ASVS (API) et OWASP MASVS (mobile). Ce document liste ce qui est implémenté et testé, puis ce qui reste à faire.

## Implémenté

| Domaine | Mesure | Où |
|---|---|---|
| Configuration | Démarrage refusé si un secret manque ou est trop court ; `OTP_DEV_LOG` interdit en production | `config/env.validation.ts` |
| Secrets | Uniquement dans `.env` (ignoré par Git) ; `.env.example` sans valeur réelle | racine |
| PIN | 6 chiffres, PIN triviaux refusés, Argon2id (OWASP) + pepper serveur | `auth/pin.service.ts` |
| Brute force | 5 échecs ⇒ verrouillage 15 min ; temps de réponse homogène pour un numéro inconnu ; rate limiting HTTP sur auth | `auth.service.ts`, `auth.module.ts` |
| OTP | Code aléatoire cryptographique, stocké en HMAC, 5 tentatives, expiration, délai de 60 s entre envois, 5 envois / heure, usage unique garanti en base | `auth/otp.service.ts` |
| Sessions | JWT court (issuer/audience/algorithme fixés), refresh opaque haché, rotation, détection de réutilisation, révocation immédiate (déconnexion) | `auth/token.service.ts`, `auth.guards.ts` |
| Autorisation | RBAC par permissions fines ; politique d'accès obligatoire sur chaque route (refus par défaut) | `auth.guards.ts`, `rbac.catalog.ts` |
| Entrées | Validation stricte, champs inconnus rejetés (empêche l'élévation via `roles` dans un PATCH) | `common/validation.ts` |
| Erreurs | Format stable sans stack trace ni détail interne | `common/errors/` |
| En-têtes | Helmet, `x-powered-by` désactivé, CORS restreint à une liste d'origines | `app.setup.ts` |
| Logs | JSON structurés avec `X-Request-Id` ; `Authorization`, cookies et `Idempotency-Key` masqués ; IP jamais stockée en clair (HMAC) | `common/logging.ts`, `request-context.ts` |
| Audit | Actions sensibles journalisées dans la même transaction ; journal immuable (trigger) ; secrets retirés des instantanés | `audit/` |
| Finance | Ledger immuable et équilibré garanti par PostgreSQL ; montants NUMERIC ; verrous contre les soldes concurrents | `ledger/`, migrations |
| Mobile | Jetons dans le Keystore (flutter_secure_storage) ; HTTP en clair autorisé uniquement en build debug ; aucun calcul financier côté client | `apps/mobile` |
| Documents KYC | Type réel vérifié par signature binaire (JPEG, PNG, PDF ; selfie en image uniquement) ; taille limitée ; chiffrement AES-256-GCM au repos avec clé serveur ; accès uniquement par URL signée HMAC valable 5 min, sans cache ; empreinte SHA-256 conservée | `modules/storage/`, `modules/kyc/` |
| Revue KYC | Permissions `admin.kyc.read` / `admin.kyc.decide` ; prise en charge exclusive ; auto-vérification interdite ; consultation et décisions auditées ; historique des décisions immuable ; aucune donnée d'identité en clair dans l'audit des brouillons | `modules/kyc/kyc-review.service.ts` |

## Couvert par les tests d'intégration

Verrouillage après échecs, non-divulgation de l'existence d'un numéro, OTP invalide/réutilisé/renvoyé trop tôt, rotation et réutilisation de refresh token, révocation à la déconnexion, champs non autorisés rejetés, refus du back-office à un membre, idempotence et concurrence du ledger, immutabilité et équilibre imposés par la base.

## Reste à faire

- MFA des comptes back-office et connexion STAFF dédiée.
- Fournisseur SMS réel (actuellement : journalisation en développement, erreur explicite sinon).
- Rate limiting partagé (Redis) pour plusieurs instances.
- Réinitialisation du PIN par OTP, gestion et révocation des appareils depuis l'application.
- Antivirus réel pour les documents (interface prête, fichiers actuellement marqués `NOT_SCANNED` et signalés au réviseur).
- Rotation de la clé `DOCUMENT_ENCRYPTION_KEY` (le format de fichier porte un numéro de version pour la permettre).
- Nettoyage des fichiers orphelins si une transaction échoue après l'écriture chiffrée.
- Revue KYC depuis le back-office (aujourd'hui : API admin + outil de développement `kyc:dev`).
- Intercepteur `Idempotency-Key` pour les mutations financières HTTP (paiements).
- Sauvegardes chiffrées et restauration testée ; revue ASVS/MASVS complète avant production.
- Remplacer l'indicateur OTP en clair dans les logs de développement par un canal dédié si l'équipe grandit.
