CREATE OR REPLACE PROCEDURE fund_gig(p_client_id UUID, p_freelancer_id UUID, p_budget DECIMAL(10,2))
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance DECIMAL(10,2);
BEGIN
    SELECT escrow_balance INTO v_balance
    FROM clients
    WHERE id = p_client_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Client % not found', p_client_id;
    END IF;

    IF v_balance < p_budget THEN
        RAISE EXCEPTION 'Insufficient escrow balance: have %, need %', v_balance, p_budget;
    END IF;

    UPDATE clients
    SET escrow_balance = escrow_balance - p_budget
    WHERE id = p_client_id;

    INSERT INTO contracts (client_id, freelancer_id, budget, status)
    VALUES (p_client_id, p_freelancer_id, p_budget, 'FUNDED');
END;
$$;
