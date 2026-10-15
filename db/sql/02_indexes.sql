CREATE UNIQUE INDEX idx_active_gig ON contracts (freelancer_id) WHERE status = 'IN_PROGRESS';

CREATE INDEX idx_contracts_client ON contracts (client_id);

CREATE INDEX idx_contracts_completed_recent ON contracts (created_at) INCLUDE (freelancer_id, budget) WHERE status = 'COMPLETED';

CREATE INDEX idx_audit_client ON wallet_audit_logs (client_id, created_at);
