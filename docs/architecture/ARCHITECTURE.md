# Architecture — état actuel

Ce document décrit ce qui est **réellement implémenté**. Le cible complète est dans le cahier des charges (`docs/product/sources/`).

## Vue d'ensemble

| Couche | Techno | État |
|---|---|---|
| API | NestJS 11, TypeScript 5.9, Prisma 6 | Auth, RBAC, audit, ledger, wallet, dashboard, KYC + stockage documentaire chiffré |
| Base | PostgreSQL 18 (local via `embedded-postgres`, sans Docker) | Migrations + triggers d'intégrité |
| Mobile | Flutter 3.38, Riverpod 2, go_router, Dio, freezed, drift | Splash → onboarding → inscription/OTP → connexion → accueil → portefeuille → historique → profil |
| Back-office | Angular | Non commencé |
| Jobs / temps réel | Redis + BullMQ, WebSocket/SSE | Non commencé |

## API (`apps/api`)

```
src/
  app.module.ts, app.setup.ts, main.ts
  config/        variables d'environnement validées au démarrage (refus si invalides)
  common/        erreurs { code, message, details }, pagination par curseur, montants, contexte de requête, logs
  database/      PrismaService
  modules/
    health/      /health (liveness), /ready (base joignable)
    audit/       AuditService (journal immuable) + GET /v1/admin/audit-logs
    auth/        inscription + OTP, connexion PIN, sessions rotatives, gardes globales, catalogue RBAC
    users/       GET/PATCH /v1/me, GET /v1/me/dashboard
    ledger/      LedgerService (partie double, idempotence, verrous, contre-passation, vérifications)
    wallet/      GET /v1/wallet, GET /v1/wallet/transactions
    storage/     stockage privé chiffré (AES-256-GCM), URLs signées GET /v1/files/:token, détection du type réel, antivirus (interface)
    kyc/         dossier membre (GET/PATCH /v1/kyc, POST documents, POST submit) et revue (/v1/admin/kyc : file, dossier, prise en charge, décision)
prisma/
  schema.prisma, seed.ts, migrations/
```

### Chaîne de sécurité d'une requête

1. `ThrottlerGuard` — limitation de débit (stricte sur auth ; désactivée en tests).
2. `JwtAuthGuard` — JWT HS256 valide **et** session non révoquée en base **et** compte actif. La vérification en base permet une révocation immédiate.
3. `AccessPolicyGuard` — chaque route déclare `@Public()`, `@Authenticated()` ou `@RequirePermissions(...)`. Sans déclaration : **refus** (défaut sûr).
4. `ValidationPipe` — `whitelist` + `forbidNonWhitelisted` ; erreurs par champ dans `details.fields`.

### Ledger

- Comptes typés (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE) ; un portefeuille membre = deux comptes de passif (disponible, réservé).
- `LedgerService.post()` : validation (≥ 2 écritures, montants > 0, précision de la devise, débits = crédits) → verrou consultatif sur la référence → rejeu si référence existante (conflit si mouvement différent) → verrouillage `FOR UPDATE` des comptes dans un ordre stable → contrôle des soldes négatifs → écritures + mise à jour du solde en cache + audit, dans la même transaction.
- PostgreSQL applique en plus : `UPDATE`/`DELETE`/`TRUNCATE` interdits sur écritures, transactions et audit ; montant > 0 ; solde ≥ 0 sauf compte autorisé ; équilibre vérifié au `COMMIT` par trigger différé.
- Corrections uniquement par `reverse()` (contre-passation unique).

### Vérification d'identité (KYC)

```
NOT_STARTED ──(première saisie)──▶ DRAFT ──(soumission complète)──▶ SUBMITTED ──(prise en charge)──▶ UNDER_REVIEW
                                     ▲                                   │                                │
                                     │                                   └────────────┬───────────────────┘
                                     │                                                ▼
                                     └──────── complément demandé ◀──────────── décision ──▶ APPROVED (verrouillé)
                                                                                      └──────▶ REJECTED (corrigeable, resoumission)
```

- Le membre modifie son dossier uniquement en `NOT_STARTED`, `DRAFT` ou `REJECTED` ; au-delà : `409 KYC_LOCKED`.
- Soumission refusée si incomplet (`KYC_INCOMPLETE` + liste `missing`), mineur (`KYC_UNDERAGE`) ou pièce expirée (`KYC_ID_EXPIRED`).
- Pièces obligatoires : recto + verso + selfie (CNI), recto + selfie (passeport, récépissé).
- Signaux d'aide au réviseur, jamais bloquants seuls : numéro de pièce déjà utilisé, nom différent du compte, documents non analysés par antivirus.
- Réviseur : prise en charge exclusive, interdiction de traiter son propre dossier, motif obligatoire pour refus/complément, notes internes jamais montrées au membre. Chaque consultation de dossier et chaque décision est auditée ; l'historique `kyc_reviews` est immuable (trigger).
- `KycProviderInterface` : aujourd'hui revue manuelle ; un prestataire agréé pourra être branché sans toucher au cœur métier.
- `profiles.kyc_status` reste un miroir de `kyc_profiles.status`, mis à jour dans la même transaction.

### Sessions

- Access token JWT 15 min (`sub`, `sid`, `kind`), refresh token opaque 30 jours stocké haché (SHA-256).
- Rotation à chaque refresh ; réutilisation d'un refresh déjà remplacé (> 10 s) ⇒ révocation de toute la famille + audit.

## Mobile (`apps/mobile/lib`)

```
core/      config, thème et tokens, formatage (XAF, téléphone), réseau (Dio + refresh unique), stockage sécurisé, cache drift, widgets d'état
features/  auth, onboarding, splash, dashboard, wallet, profile, shell (navigation)
```

- Les jetons sont dans le stockage sécurisé du système ; le cache local (drift) ne contient que des réponses de lecture, effacé à la déconnexion.
- Hors ligne : les écrans affichent la dernière réponse avec sa date (« non actualisées »), jamais comme donnée fraîche.
- Les modules sans backend (recharge, contributions, tirages, formation, projets, accidents) affichent « Bientôt disponible » via `ModulePreviewGate` : aucune donnée fictive n'est présentée comme réelle.
- Leurs maquettes restent consultables en développement avec `--dart-define=MODULE_PREVIEWS=true` (ou `MODULE_PREVIEWS=true pnpm mobile:dev`), toujours accompagnées d'un bandeau « Aperçu — données fictives ». Aucune maquette n'initie ni ne simule d'opération financière.

## Écarts assumés par rapport au cahier

| Sujet | Décision | Raison |
|---|---|---|
| Docker (infra, CI, déploiement) | Aucun Docker | Choix du porteur du projet ; PostgreSQL local via binaires officiels |
| `GET /v1/config/mobile` (splash) | Pas encore implémenté | Viendra avec les feature flags |
| En-tête HTTP `Idempotency-Key` | Table prête, intercepteur à venir avec les paiements | L'idempotence financière est déjà garantie par la référence du ledger |
| Connexion back-office avec MFA | Les comptes STAFF ne peuvent pas se connecter par PIN | Phase back-office |
| Limitation de débit | Stockage mémoire (une instance) | Passage à Redis avec BullMQ |
| Police Inter | Chargée via `google_fonts` (repli système hors ligne au premier lancement) | À embarquer dans les assets |
