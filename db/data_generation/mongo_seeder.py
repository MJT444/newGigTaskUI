import os
import random
from datetime import datetime, timedelta, timezone

import psycopg2
from pymongo import MongoClient
from faker import Faker

NUM_PINGS = 500000
NUM_REVIEWS = 20000
PING_BATCH_SIZE = 10000

SKILL_TAGS = [
    "plumbing", "electrical", "carpentry", "painting", "cleaning",
    "moving", "gardening", "welding", "masonry", "roofing",
    "web-design", "data-entry", "translation", "photography", "tutoring",
]

CERT_AUTHORITIES = ["SkillIndia", "NSDC", "Coursera", "Udemy", "TradeCert"]

fake = Faker()
now = datetime.now(timezone.utc)


def get_freelancers():
    conn = psycopg2.connect(
        host=os.getenv("PGHOST", "localhost"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("PGDATABASE", "gigtask"),
        user=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD", "gigtask"),
    )
    cur = conn.cursor()
    cur.execute("SELECT id, name, latitude, longitude, is_available FROM freelancers")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [
        {
            "id": str(r[0]),
            "name": r[1],
            "lat": r[2],
            "lng": r[3],
            "is_available": r[4],
        }
        for r in rows
    ]


def build_portfolio(f):
    doc = {
        "freelancer_id": f["id"],
        "name": f["name"],
        "skills": random.sample(SKILL_TAGS, random.randint(1, 5)),
    }
    if random.random() < 0.7:
        doc["certifications"] = [
            {
                "title": f"{random.choice(SKILL_TAGS).title()} Certification",
                "issued_by": random.choice(CERT_AUTHORITIES),
                "year": random.randint(2015, 2026),
            }
            for _ in range(random.randint(1, 3))
        ]
    if random.random() < 0.5:
        doc["years_experience"] = random.randint(1, 20)
    if random.random() < 0.4:
        doc["bio"] = fake.paragraph()
    if random.random() < 0.3:
        doc["hourly_rate"] = round(random.uniform(100, 2000), 2)
    if random.random() < 0.2:
        doc["languages"] = random.sample(["hindi", "english", "punjabi", "tamil", "bengali"], random.randint(1, 3))
    return doc


def main():
    freelancers = get_freelancers()
    client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"))
    db = client[os.getenv("MONGO_DB", "gigtask")]

    db.Portfolios.delete_many({})
    db.GigReviews.delete_many({})
    db.WorkerLocations.delete_many({})

    portfolios = [build_portfolio(f) for f in freelancers]
    db.Portfolios.insert_many(portfolios)
    print(f"Portfolios: {len(portfolios)}")

    reviews = []
    for _ in range(NUM_REVIEWS):
        f = random.choice(freelancers)
        reviews.append(
            {
                "freelancer_id": f["id"],
                "client_name": fake.name(),
                "rating": random.randint(1, 5),
                "skill_tags": random.sample(SKILL_TAGS, random.randint(1, 4)),
                "comment": fake.sentence(),
                "created_at": now - timedelta(seconds=random.randint(0, 365 * 86400)),
            }
        )
    db.GigReviews.insert_many(reviews)
    print(f"GigReviews: {len(reviews)}")

    inserted = 0
    while inserted < NUM_PINGS:
        batch = []
        for _ in range(min(PING_BATCH_SIZE, NUM_PINGS - inserted)):
            f = random.choice(freelancers)
            batch.append(
                {
                    "freelancer_id": f["id"],
                    "location": {
                        "type": "Point",
                        "coordinates": [
                            f["lng"] + random.uniform(-0.05, 0.05),
                            f["lat"] + random.uniform(-0.05, 0.05),
                        ],
                    },
                    "is_available": f["is_available"],
                    "created_at": now,
                }
            )
        db.WorkerLocations.insert_many(batch, ordered=False)
        inserted += len(batch)
        print(f"WorkerLocations: {inserted}/{NUM_PINGS}")

    client.close()
    print("MongoDB seeding complete")


if __name__ == "__main__":
    main()
