import { useEffect, useState } from 'react';

interface Tx {
  signature: string;
  slot: number;
  fee: number;
  success: boolean;
  program_ids: string[];
}

interface Stats {
  transactions: number;
  slots: number;
  latestSlot: string;
  accounts: number;
}

export default function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [account, setAccount] = useState('');

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {});
    fetch('/api/transactions?limit=25').then(r => r.json()).then(setTxs).catch(() => {});
    const ws = new WebSocket(`ws://${window.location.host}/api/live`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'tx') setTxs(prev => [msg.tx, ...prev].slice(0, 50));
    };
    return () => ws.close();
  }, []);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    const r = await fetch(`/api/transactions?account=${account}&limit=25`);
    setTxs(await r.json());
  };

  return (
    <div style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h1>Solana Indexer</h1>
      {stats && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
          <div><strong>{stats.transactions}</strong> txs</div>
          <div><strong>{stats.slots}</strong> slots</div>
          <div><strong>{stats.accounts}</strong> accounts</div>
          <div>latest slot <strong>{stats.latestSlot}</strong></div>
        </div>
      )}
      <form onSubmit={lookup} style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1 }} placeholder="Filter by account address…"
          value={account} onChange={e => setAccount(e.target.value)} />
        <button type="submit">Lookup</button>
      </form>
      <h2>Latest transactions</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ textAlign: 'left' }}>
          <th>Signature</th><th>Slot</th><th>Fee</th><th>Status</th><th>Programs</th>
        </tr></thead>
        <tbody>
          {txs.map(t => (
            <tr key={t.signature} style={{ borderTop: '1px solid #ddd' }}>
              <td style={{ fontFamily: 'monospace', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.signature.slice(0, 24)}…</td>
              <td>{t.slot}</td>
              <td>{t.fee}</td>
              <td>{t.success ? '✅' : '❌'}</td>
              <td>{t.program_ids.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
