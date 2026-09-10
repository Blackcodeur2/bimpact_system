-- Correctif de 20260910120100_ledger_integrity : la fonction unique référençait NEW.id et NEW.transaction_id
-- dans la même expression ; PL/pgSQL échouait car l'un des deux champs n'existe pas selon la table.
-- On sépare : une fonction de contrôle partagée + un trigger par table.

CREATE OR REPLACE FUNCTION ledger_assert_balanced(p_transaction_id UUID) RETURNS void AS $$
DECLARE
  total_debits NUMERIC;
  total_credits NUMERIC;
  entry_count INT;
  currency_count INT;
BEGIN
  SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'), 0),
         COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT'), 0),
         COUNT(*),
         COUNT(DISTINCT currency)
    INTO total_debits, total_credits, entry_count, currency_count
    FROM ledger_entries
   WHERE transaction_id = p_transaction_id;

  IF entry_count < 2 OR total_debits <> total_credits OR currency_count <> 1 THEN
    RAISE EXCEPTION 'LEDGER_UNBALANCED: transaction % (débits %, crédits %, écritures %)',
      p_transaction_id, total_debits, total_credits, entry_count
      USING ERRCODE = 'P0001';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ledger_entries_check_balanced() RETURNS trigger AS $$
BEGIN
  PERFORM ledger_assert_balanced(NEW.transaction_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ledger_transactions_check_balanced() RETURNS trigger AS $$
BEGIN
  PERFORM ledger_assert_balanced(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_entries_balanced ON ledger_entries;
DROP TRIGGER IF EXISTS ledger_transactions_have_entries ON ledger_transactions;
DROP FUNCTION IF EXISTS assert_ledger_transaction_balanced();

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_check_balanced();

CREATE CONSTRAINT TRIGGER ledger_transactions_have_entries
  AFTER INSERT ON ledger_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_transactions_check_balanced();
