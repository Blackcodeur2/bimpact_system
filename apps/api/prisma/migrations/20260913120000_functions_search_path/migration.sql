-- Fonctions d'intégrité du ledger et d'immutabilité : search_path figé.
-- Sans cela, un rôle pourrait placer devant `public` un schéma contenant une table `ledger_entries` factice
-- et fausser le contrôle d'équilibre (alerte Supabase « function_search_path_mutable »).
ALTER FUNCTION forbid_mutation() SET search_path = public, pg_catalog;
ALTER FUNCTION ledger_assert_balanced(UUID) SET search_path = public, pg_catalog;
ALTER FUNCTION ledger_entries_check_balanced() SET search_path = public, pg_catalog;
ALTER FUNCTION ledger_transactions_check_balanced() SET search_path = public, pg_catalog;
