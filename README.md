# BENSKIN IMPACT

> 200 FCFA aujourd'hui. Une opportunité demain.

Plateforme numérique pour la communauté des conducteurs de motos-taxis : contribution programmée, portefeuille, tirages auditables, formation entrepreneuriale, projets, recrutement et solidarité encadrée.

Spécification de référence : [`docs/product/sources/`](docs/product/sources/) (cahier des charges et planche de design).

## Structure

```
apps/
  api/       NestJS + Prisma + PostgreSQL — API /v1
  mobile/    Flutter (Android d'abord) — application conducteur
  admin/     Angular — back-office (à venir)
packages/
  ui-tokens/ design tokens partagés (couleurs, typographie, espacements)
  contracts/ contrats partagés (à venir)
scripts/     outils de développement (PostgreSQL local)
docs/        architecture, sécurité, API, produit
```

## Prérequis

- Node.js ≥ 22 et pnpm 9
- Flutter 3.38+ (Dart 3.10+) et un émulateur Android
- **Aucun Docker** : PostgreSQL tourne en local via les binaires officiels du paquet npm `embedded-postgres`.

## Démarrage

```bash
pnpm install
```

Copier `.env.example` en `.env` et remplacer chaque `change-me-…` par un secret long et aléatoire.

```bash
pnpm db:local
```

Initialise le cluster au premier lancement (données dans `.data/`), démarre PostgreSQL en arrière-plan et crée la base. `pnpm db:local:status` et `pnpm db:local:stop` pour le suivre ou l'arrêter.

```bash
pnpm db:deploy
```

```bash
pnpm db:seed
```

Contenu pédagogique de la formation (modules, leçons, quiz — aucune donnée de membre fictive) :

```bash
pnpm --filter @benskin/api training:seed
```

```bash
pnpm api:dev
```

API sur http://localhost:3000/v1 — documentation Swagger sur http://localhost:3000/docs en développement. En développement, les codes OTP sont écrits dans la console de l'API (`OTP_DEV_LOG=true`) au lieu d'être envoyés par SMS.

Application mobile (émulateur Android, l'API locale est jointe via `10.0.2.2`) :

```bash
cd apps/mobile && flutter run
```

Application mobile dans le navigateur, avec rechargement à chaud automatique à chaque sauvegarde d'un fichier `.dart` (http://localhost:5173) :

```bash
pnpm mobile:dev
```

### Vérification d'identité (KYC) sans back-office

Le back-office Angular n'existe pas encore. En développement, les dossiers soumis depuis l'application se traitent en ligne de commande, avec les mêmes règles et le même audit que l'API admin :

```bash
pnpm --filter @benskin/api kyc:dev list
```

```bash
pnpm --filter @benskin/api kyc:dev approve 699001122
```

```bash
pnpm --filter @benskin/api kyc:dev more-info 699001122 "Merci d'ajouter le verso de votre CNI"
```

```bash
pnpm --filter @benskin/api kyc:dev reject 699001122 "Pièce d'identité expirée"
```

## Tests

```bash
pnpm api:test
```

```bash
pnpm api:test:e2e
```

Les tests d'intégration utilisent la base locale dans un schéma éphémère `e2e_<horodatage>`, créé puis supprimé à chaque exécution ; le schéma de développement n'est jamais touché.

```bash
cd apps/mobile && flutter test
```

## Principes non négociables

- Le ledger en partie double est la source de vérité financière ; aucune écriture n'est modifiée ou supprimée (triggers PostgreSQL), les corrections passent par contre-passation.
- Montants en `NUMERIC` côté base et en chaînes décimales dans l'API ; jamais de `float`.
- Aucune opération financière n'est affichée comme réussie avant confirmation du serveur.
- Chaque route déclare explicitement sa politique d'accès ; sans déclaration, l'accès est refusé.
- Aucune donnée fictive n'est présentée comme réelle ; le fonds de solidarité ne prélève que les membres ayant adhéré volontairement.
