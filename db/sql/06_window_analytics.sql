WITH daily_revenue AS (
    SELECT
        freelancer_id,
        created_at::date AS revenue_date,
        SUM(budget) AS daily_total
    FROM contracts
    WHERE status = 'COMPLETED'
      AND created_at >= now() - INTERVAL '30 days'
    GROUP BY freelancer_id, created_at::date
),
moving_avg AS (
    SELECT
        freelancer_id,
        revenue_date,
        daily_total,
        AVG(daily_total) OVER (
            PARTITION BY freelancer_id
            ORDER BY revenue_date
            RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW
        ) AS moving_avg_7d
    FROM daily_revenue
)
SELECT
    freelancer_id,
    revenue_date,
    daily_total,
    ROUND(moving_avg_7d, 2) AS moving_avg_7d,
    DENSE_RANK() OVER (ORDER BY moving_avg_7d DESC) AS revenue_rank
FROM moving_avg
ORDER BY revenue_rank
LIMIT 50;
