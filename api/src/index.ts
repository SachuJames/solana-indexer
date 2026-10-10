import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/solana_indexer';
const PORT = parseInt(process.env.PORT || '8080', 10);

const pool = new Pool({ connectionString: DATABASE_URL });
const app = Fastify({ logger: true });
await app.register(websocket);

// latest transactions
app.get('/api/transactions', async (req) => {
  const q = req.query as { limit?: string; account?: string };
  const limit = Math.min(parseInt(q.limit || '50', 10), 200);
  if (q.account) {
    const r = await pool.query(
      `SELECT t.* FROM transactions t
       JOIN account_activity a ON a.signature = t.signature
       WHERE a.account = $1 ORDER BY t.slot DESC LIMIT $2`,
      [q.account, limit]);
    return r.rows;
  }
  const r = await pool.query(
    `SELECT * FROM transactions ORDER BY slot DESC LIMIT $1`, [limit]);
  return r.rows;
});

app.get('/api/transactions/:signature', async (req, reply) => {
  const { signature } = req.params as { signature: string };
  const r = await pool.query(`SELECT * FROM transactions WHERE signature = $1`, [signature]);
  if (!r.rows.length) return reply.code(404).send({ error: 'not found' });
  return r.rows[0];
});

app.get('/api/accounts/:address/activity', async (req) => {
  const { address } = req.params as { address: string };
  const q = req.query as { limit?: string };
  const limit = Math.min(parseInt(q.limit || '50', 10), 200);
  const r = await pool.query(
    `SELECT * FROM account_activity WHERE account = $1 ORDER BY slot DESC LIMIT $2`,
    [address, limit]);
  return r.rows;
});

app.get('/api/slots/latest', async () => {
  const r = await pool.query(`SELECT * FROM slots ORDER BY slot DESC LIMIT 20`);
  return r.rows;
});

app.get('/api/stats', async () => {
  const [tx, slots, accts] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM transactions`),
    pool.query(`SELECT COUNT(*)::int AS c, MAX(slot)::bigint AS max_slot FROM slots`),
    pool.query(`SELECT COUNT(DISTINCT account)::int AS c FROM account_activity`),
  ]);
  return {
    transactions: tx.rows[0].c,
    slots: slots.rows[0].c,
    latestSlot: slots.rows[0].max_slot,
    accounts: accts.rows[0].c,
  };
});

app.get('/health', async () => ({ ok: true }));

// live feed: polls for new transactions and pushes over websocket
app.get('/api/live', { websocket: true }, (socket) => {
  let lastSeen = '';
  const timer = setInterval(async () => {
    try {
      const r = await pool.query(
        `SELECT * FROM transactions WHERE signature > $1 ORDER BY signature ASC LIMIT 20`,
        [lastSeen]);
      for (const row of r.rows) {
        socket.send(JSON.stringify({ type: 'tx', tx: row }));
        lastSeen = row.signature;
      }
    } catch { /* ignore */ }
  }, 2000);
  socket.on('close', () => clearInterval(timer));
});

await app.listen({ port: PORT, host: '0.0.0.0' });
