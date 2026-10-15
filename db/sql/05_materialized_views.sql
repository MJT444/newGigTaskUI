CREATE MATERIALIZED VIEW freelancer_lifetime_stats AS
SELECT
    f.id AS freelancer_id,
    f.name,
    COUNT(c.id) AS completed_contracts,
    COALESCE(SUM(c.budget), 0.00) AS total_earnings
FROM freelancers f
LEFT JOIN contracts c
    ON c.freelancer_id = f.id AND c.status = 'COMPLETED'
GROUP BY f.id, f.name;

CREATE UNIQUE INDEX idx_freelancer_lifetime_stats ON freelancer_lifetime_stats (freelancer_id);

CREATE OR REPLACE FUNCTION refresh_freelancer_lifetime_stats()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY freelancer_lifetime_stats;
END;
$$;
