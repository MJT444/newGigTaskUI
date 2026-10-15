import os
import random
import uuid
from datetime import datetime, timedelta, timezone

import psycopg2
from psycopg2.extras import execute_values
from faker import Faker

NUM_CLIENTS = 1000
NUM_FREELANCERS = 2000
NUM_CONTRACTS = 50000
NUM_AUDIT_LOGS = 100000
NUM_IN_PROGRESS = 1000

fake = Faker()
now = datetime.now(timezone.utc)


def random_past_timestamp(max_days=365):
    return now - timedelta(seconds=random.randint(0, max_days * 86400))


def main():
    conn = psycopg2.connect(
        host=os.getenv("PGHOST", "localhost"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("PGDATABASE", "gigtask"),
        user=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD", "gigtask"),
    )
    cur = conn.cursor()

    client_ids = [str(uuid.uuid4()) for _ in range(NUM_CLIENTS)]
    clients = [
        (cid, fake.company(), round(random.uniform(0, 99999), 2))
        for cid in client_ids
    ]
    execute_values(
        cur,
        "INSERT INTO clients (id, name, escrow_balance) VALUES %s",
        clients,
        page_size=10000,
    )
    print(f"clients: {len(clients)}")

    freelancer_ids = [str(uuid.uuid4()) for _ in range(NUM_FREELANCERS)]
    freelancers = [
        (
            fid,
            fake.name(),
            round(random.uniform(28.40, 28.90), 6),
            round(random.uniform(76.90, 77.40), 6),
            random.random() < 0.7,
        )
        for fid in freelancer_ids
    ]
    execute_values(
        cur,
        "INSERT INTO freelancers (id, name, latitude, longitude, is_available) VALUES %s",
        freelancers,
        page_size=10000,
    )
    print(f"freelancers: {len(freelancers)}")

    contracts = []
    in_progress_freelancers = random.sample(freelancer_ids, NUM_IN_PROGRESS)
    for fid in in_progress_freelancers:
        contracts.append(
            (
                str(uuid.uuid4()),
                random.choice(client_ids),
                fid,
                round(random.uniform(50, 5000), 2),
                "IN_PROGRESS",
                random_past_timestamp(30),
            )
        )
    for _ in range(NUM_CONTRACTS - NUM_IN_PROGRESS):
        contracts.append(
            (
                str(uuid.uuid4()),
                random.choice(client_ids),
                random.choice(freelancer_ids),
                round(random.uniform(50, 5000), 2),
                "COMPLETED" if random.random() < 0.8 else "FUNDED",
                random_past_timestamp(365),
            )
        )
    execute_values(
        cur,
        "INSERT INTO contracts (id, client_id, freelancer_id, budget, status, created_at) VALUES %s",
        contracts,
        page_size=10000,
    )
    print(f"contracts: {len(contracts)}")

    audit_logs = []
    for _ in range(NUM_AUDIT_LOGS):
        amount = round(random.uniform(-5000, 5000), 2)
        audit_logs.append(
            (
                str(uuid.uuid4()),
                random.choice(client_ids),
                amount,
                "CREDIT" if amount >= 0 else "DEBIT",
                round(random.uniform(0, 99999), 2),
                random_past_timestamp(365),
            )
        )
    execute_values(
        cur,
        "INSERT INTO wallet_audit_logs (id, client_id, amount_changed, action_type, balance_after, created_at) VALUES %s",
        audit_logs,
        page_size=10000,
    )
    print(f"wallet_audit_logs: {len(audit_logs)}")

    conn.commit()
    cur.close()
    conn.close()
    print("PostgreSQL seeding complete")


if __name__ == "__main__":
    main()
