CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    escrow_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (escrow_balance >= 0.00)
);

CREATE TABLE wallet_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    amount_changed DECIMAL(10,2) NOT NULL,
    action_type VARCHAR(20) NOT NULL,
    balance_after DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE freelancers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    freelancer_id UUID NOT NULL REFERENCES freelancers(id),
    budget DECIMAL(10,2) NOT NULL CHECK (budget > 0.00),
    status VARCHAR(20) NOT NULL CHECK (status IN ('FUNDED', 'IN_PROGRESS', 'COMPLETED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
