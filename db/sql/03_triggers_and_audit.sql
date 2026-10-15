CREATE OR REPLACE FUNCTION log_escrow_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO wallet_audit_logs (client_id, amount_changed, action_type, balance_after)
    VALUES (
        NEW.id,
        NEW.escrow_balance - OLD.escrow_balance,
        CASE WHEN NEW.escrow_balance > OLD.escrow_balance THEN 'CREDIT' ELSE 'DEBIT' END,
        NEW.escrow_balance
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wallet_audit
AFTER UPDATE OF escrow_balance ON clients
FOR EACH ROW
WHEN (OLD.escrow_balance IS DISTINCT FROM NEW.escrow_balance)
EXECUTE FUNCTION log_escrow_change();
