import { Connection, PublicKey } from '@solana/web3.js';
import { Pool } from 'pg';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/solana_indexer';

const pool = new Pool({ connectionString: DATABASE_URL });

interface ParsedTx {
  signature: string;
  slot: number;
  blockTime: number | null;
  fee: number;
  success: boolean;
  programIds: string[];
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
}

async function initDb() {
  const schema = await import('fs').then(fs =>
    fs.readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(schema);
}

async function getLastSlot(): Promise<number> {
  const r = await pool.query(`SELECT value FROM indexer_state WHERE key = 'last_slot'`);
  return r.rows.length ? parseInt(r.rows[0].value, 10) : 0;
}

async function setLastSlot(slot: number) {
  await pool.query(
    `INSERT INTO indexer_state (key, value, updated_at) VALUES ('last_slot', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [String(slot)]);
}

function parseBlock(slot: number, block: any): ParsedTx[] {
  const out: ParsedTx[] = [];
  if (!block || !block.transactions) return out;
  for (const tx of block.transactions) {
    const sig = tx.transaction.signatures[0];
    const meta = tx.meta;
    if (!sig || !meta) continue;
    const keys = tx.transaction.message.accountKeys || [];
    const programIds = new Set<string>();
    for (const ix of tx.transaction.message.instructions || []) {
      const pid = keys[ix.programIdIndex];
      if (pid) programIds.add(pid.toBase58());
    }
    out.push({
      signature: sig,
      slot,
      blockTime: block.blockTime ?? null,
      fee: meta.fee ?? 0,
      success: meta.err == null,
      programIds: [...programIds],
      accounts: keys.map((k: PublicKey, i: number) => ({
        pubkey: k.toBase58(),
        isSigner: tx.transaction.message.isAccountSigner?.(i) ?? false,
        isWritable: tx.transaction.message.isAccountWritable?.(i) ?? false,
      })),
    });
  }
  return out;
}

async function storeSlot(slot: number, blockhash: string, blockTime: number | null, txs: ParsedTx[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO slots (slot, blockhash, block_time, tx_count)
       VALUES ($1, $2, $3, $4) ON CONFLICT (slot) DO NOTHING`,
      [slot, blockhash, blockTime ? new Date(blockTime * 1000) : null, txs.length]);
    for (const tx of txs) {
      await client.query(
        `INSERT INTO transactions (signature, slot, block_time, fee, success, program_ids, accounts)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (signature) DO NOTHING`,
        [tx.signature, tx.slot,
         tx.blockTime ? new Date(tx.blockTime * 1000) : null,
         tx.fee, tx.success, tx.programIds,
         tx.accounts.map(a => a.pubkey)]);
      for (const a of tx.accounts) {
        await client.query(
          `INSERT INTO account_activity (account, signature, slot, is_signer, is_writable)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [a.pubkey, tx.signature, tx.slot, a.isSigner, a.isWritable]);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function backfill(connection: Connection, fromSlot: number, toSlot: number) {
  console.log(`backfilling slots ${fromSlot}..${toSlot}`);
  for (let slot = fromSlot; slot <= toSlot; slot += 1) {
    try {
      const block = await connection.getBlock(slot, { maxSupportedTransactionVersion: 0 });
      if (!block) continue;
      const txs = parseBlock(slot, block);
      await storeSlot(slot, block.blockhash, block.blockTime ?? null, txs);
      await setLastSlot(slot);
      if (slot % 10 === 0) console.log(`indexed slot ${slot} (${txs.length} txs)`);
    } catch (e) {
      console.warn(`slot ${slot} failed:`, (e as Error).message);
    }
  }
}

async function subscribe(connection: Connection) {
  console.log('subscribing to new slots...');
  connection.onSlotChange(async (info) => {
    try {
      const block = await connection.getBlock(info.slot, { maxSupportedTransactionVersion: 0 });
      if (!block) return;
      const txs = parseBlock(info.slot, block);
      await storeSlot(info.slot, block.blockhash, block.blockTime ?? null, txs);
      await setLastSlot(info.slot);
      console.log(`slot ${info.slot}: ${txs.length} txs`);
    } catch (e) {
      console.warn(`live slot ${info.slot} failed:`, (e as Error).message);
    }
  });
}

async function mockMode() {
  console.log('mock mode: generating synthetic slots');
  await initDb();
  let slot = await getLastSlot();
  if (slot === 0) slot = 300000000;
  const programs = [
    '11111111111111111111111111111111',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWHoxbHoqjP',
  ];
  setInterval(async () => {
    slot += 1;
    const nTx = 1 + Math.floor(Math.random() * 5);
    const txs: ParsedTx[] = [];
    for (let i = 0; i < nTx; i++) {
      const sig = 'mock' + slot + 'x' + i + Math.random().toString(36).slice(2, 10);
      txs.push({
        signature: sig, slot,
        blockTime: Math.floor(Date.now() / 1000),
        fee: 5000, success: Math.random() > 0.05,
        programIds: [programs[Math.floor(Math.random() * programs.length)]],
        accounts: Array.from({ length: 3 }, (_, k) => ({
          pubkey: 'mockacct' + Math.floor(Math.random() * 100),
          isSigner: k === 0, isWritable: k < 2,
        })),
      });
    }
    await storeSlot(slot, 'mockhash' + slot, Math.floor(Date.now() / 1000), txs);
    await setLastSlot(slot);
    console.log(`mock slot ${slot}: ${txs.length} txs`);
  }, 2000);
  setInterval(() => {}, 1 << 30);
}

async function main() {
  if (process.env.MOCK === '1') return mockMode();
  await initDb();
  const connection = new Connection(RPC_URL, 'confirmed');
  const current = await connection.getSlot();
  const last = await getLastSlot();
  console.log(`RPC: ${RPC_URL}, current slot ${current}, last indexed ${last}`);
  if (process.env.BACKFILL === '1' && last < current) {
    const from = last > 0 ? last + 1 : Math.max(0, current - 100);
    await backfill(connection, from, current);
  }
  await subscribe(connection);
  // keep alive
  setInterval(() => {}, 1 << 30);
}

main().catch(e => { console.error(e); process.exit(1); });
