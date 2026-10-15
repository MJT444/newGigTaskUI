#!/usr/bin/env bash
# GigTask - one-time database setup for macOS / Linux / Git Bash.
#
#   ./scripts/setup_db.sh           # fails safely if data already exists
#   ./scripts/setup_db.sh --reset   # drop everything and start again
#
# Uses the docker compose containers (docker compose up -d first is done here).
# Needs Docker and Python 3 (a virtualenv is recommended for pip).
set -euo pipefail
cd "$(dirname "$0")/.."

export PGHOST=localhost PGPORT=5433 PGDATABASE=gigtask PGUSER=postgres PGPASSWORD=gigtask
export MONGO_URI=mongodb://localhost:27018 MONGO_DB=gigtask

step() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
psql_cmd() { docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -q -At -U postgres -d gigtask -c "$1"; }
psql_file() { echo "   $1"; docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -q -U postgres -d gigtask < "$1"; }
mongo_file() { echo "   $1"; docker compose exec -T mongo mongosh --quiet gigtask < "$1" > /dev/null; }

step "Starting containers"
docker compose up -d
for _ in $(seq 60); do
  if docker compose exec -T postgres pg_isready -U postgres -d gigtask >/dev/null 2>&1 &&
     docker compose exec -T mongo mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [[ "${1:-}" == "--reset" ]]; then
  step "Reset: dropping all PostgreSQL tables"
  psql_cmd "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
fi
if [[ "$(psql_cmd "SELECT to_regclass('public.clients') IS NOT NULL")" == "t" ]]; then
  echo "Tables already exist. Re-run with --reset to start over." >&2
  exit 1
fi

step "PostgreSQL schema (inherited 01-05) + UI support table (07, additive)"
for f in db/sql/01_schema_ddl.sql db/sql/02_indexes.sql db/sql/03_triggers_and_audit.sql \
         db/sql/04_stored_procedures.sql db/sql/05_materialized_views.sql db/sql/07_ui_support.sql; do
  psql_file "$f"
done

step "Python packages"
python3 -m pip install --quiet -r db/data_generation/requirements.txt || python3 -m pip install --quiet psycopg2-binary pymongo faker

step "Seeding PostgreSQL"
python3 db/data_generation/postgres_seeder.py

step "Refreshing the materialized view"
psql_cmd "SELECT refresh_freelancer_lifetime_stats(); INSERT INTO mv_refresh_log (view_name, refresh_mode, started_at, finished_at) VALUES ('freelancer_lifetime_stats', 'CONCURRENT', now(), clock_timestamp());" > /dev/null

step "MongoDB collections, indexes, seed"
docker compose exec -T mongo mongosh --quiet gigtask --eval 'db.dropDatabase()' > /dev/null
mongo_file db/mongo/01_collections_and_indexes.js
python3 db/data_generation/mongo_seeder.py

step "Done"
psql_cmd "SELECT 'clients=' || (SELECT COUNT(*) FROM clients) || ' freelancers=' || (SELECT COUNT(*) FROM freelancers) || ' contracts=' || (SELECT COUNT(*) FROM contracts) || ' audit=' || (SELECT COUNT(*) FROM wallet_audit_logs);"
echo "Next: (cd api && npm install && npm start) and in another terminal (cd web && npm install && npm run dev)"
