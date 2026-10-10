# Solana Indexer

Real-time Solana transaction and account watcher. Subscribes to new slots via
WebSocket RPC, parses blocks, and stores transactions, account activity, and
slot metadata in Postgres. A Fastify query API and React dashboard sit on top.

## Architecture

```
Solana RPC (WebSocket) → indexer → Postgres → API → dashboard
                              ↘ (backfill on start)
```

## Components

| | |
|---|---|
| `indexer/` | Slot subscriber + block parser. Backfills missed slots on start, then follows the chain live. |
| `api/` | Fastify REST + WebSocket API: transactions, account activity, slots, stats, live feed. |
| `dashboard/` | React live dashboard: stats, latest transactions, account lookup, WebSocket feed. |
| `db/schema.sql` | Postgres schema. |

## Quickstart

```bash
# postgres
createdb solana_indexer
psql -d solana_indexer -f db/schema.sql

# indexer (BACKFILL=1 to catch up recent slots)
cd indexer && npm install
DATABASE_URL=postgresql://localhost:5432/solana_indexer \
SOLANA_RPC_URL=https://api.devnet.solana.com \
BACKFILL=1 npm run dev

# api
cd api && npm install
DATABASE_URL=postgresql://localhost:5432/solana_indexer npm run dev

# dashboard
cd dashboard && npm install && npm run dev
```

Or with Docker Compose:

```bash
docker compose up --build
```

## API

```
GET /api/transactions?limit=50&account=<addr>
GET /api/transactions/:signature
GET /api/accounts/:address/activity
GET /api/slots/latest
GET /api/stats
WS  /api/live   # pushes new transactions as they land
```

## Testing

```bash
cd indexer && npm test   # 5 tests: block parsing, program id extraction
```

## License

MIT.
