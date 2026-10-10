#!/usr/bin/env bash
# Demo: runs the full pipeline in mock mode against a local Postgres.
set -euo pipefail

echo "== starting postgres =="
service postgresql start 2>/dev/null || true
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='solana_indexer'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE solana_indexer;"
sudo -u postgres psql -d solana_indexer -f db/schema.sql >/dev/null

export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/solana_indexer"

echo "== starting api =="
(cd api && PORT=8080 npx tsx src/index.ts) &
API_PID=$!
sleep 5

echo "== running indexer in mock mode for 15s =="
(cd indexer && MOCK=1 timeout 15 npx tsx src/index.ts) || true

echo "== stats =="
curl -s http://localhost:8080/api/stats; echo
echo "== sample transactions =="
curl -s "http://localhost:8080/api/transactions?limit=3" | head -c 400; echo

kill $API_PID 2>/dev/null || true
echo "== done =="
