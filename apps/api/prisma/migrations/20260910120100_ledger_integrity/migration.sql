-- BENSKIN IMPACT — garanties d'intégrité financière appliquées par PostgreSQL lui-même.
-- Même un accès SQL direct ou un bug applicatif ne peut pas produire un ledger incohérent.

-- 1. Immutabilité : aucune modification ni suppression des écritures postées et du journal d'audit.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: % interdit sur %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_entries_no_truncate
  BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER ledger_transactions_immutable
  BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER ledger_transactions_no_truncate
  BEFORE TRUNCATE ON ledger_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- 2. Montants strictement positifs ; solde négatif seulement si le compte l'autorise explicitement.
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_amount_positive CHECK (amount > 0);
ALTER TABLE ledger_accounts
  ADD CONSTRAINT ledger_accounts_balance_sign CHECK (allow_negative OR balance >= 0);

-- 3. Équilibre débit = crédit vérifié au COMMIT (trigger de contrainte différé),
--    ce qui autorise l'insertion des écritures une par une dans la même transaction SQL.
CREATE OR REPLACE FUNCTION assert_ledger_transaction_balanced() RETURNS trigger AS $$
DECLARE
  tx_id UUID;
  total_debits NUMERIC;
  total_credits NUMERIC;
  entry_count INT;
  currency_count INT;
BEGIN
  tx_id := CASE WHEN TG_TABLE_NAME = 'ledger_transactions' THEN NEW.id ELSE NEW.transaction_id END;

  SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'), 0),
         COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT'), 0),
         COUNT(*),
         COUNT(DISTINCT currency)
    INTO total_debits, total_credits, entry_count, currency_count
    FROM ledger_entries
   WHERE transaction_id = tx_id;

  IF entry_count < 2 OR total_debits <> total_credits OR currency_count <> 1 THEN
    RAISE EXCEPTION 'LEDGER_UNBALANCED: transaction % (débits %, crédits %, écritures %)',
      tx_id, total_debits, total_credits, entry_count
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();

CREATE CONSTRAINT TRIGGER ledger_transactions_have_entries
  AFTER INSERT ON ledger_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();
