import { describe, it, expect } from 'vitest';

// Pure parsing logic extracted for testability
export interface ParsedTx {
  signature: string;
  slot: number;
  success: boolean;
  programIds: string[];
}

export function summarizeTx(tx: any, slot: number): ParsedTx | null {
  const sig = tx.transaction?.signatures?.[0];
  const meta = tx.meta;
  if (!sig || !meta) return null;
  const keys: string[] = (tx.transaction.message.accountKeys || []).map((k: any) =>
    typeof k === 'string' ? k : k.toBase58());
  const programIds = new Set<string>();
  for (const ix of tx.transaction.message.instructions || []) {
    const pid = keys[ix.programIdIndex];
    if (pid) programIds.add(pid);
  }
  return { signature: sig, slot, success: meta.err == null, programIds: [...programIds] };
}

describe('summarizeTx', () => {
  const base = {
    transaction: {
      signatures: ['sig1'],
      message: {
        accountKeys: ['accA', 'accB', 'progC'],
        instructions: [{ programIdIndex: 2 }],
      },
    },
    meta: { err: null, fee: 5000 },
  };

  it('extracts signature, slot, success', () => {
    const r = summarizeTx(base, 42)!;
    expect(r.signature).toBe('sig1');
    expect(r.slot).toBe(42);
    expect(r.success).toBe(true);
  });

  it('collects program ids', () => {
    const r = summarizeTx(base, 42)!;
    expect(r.programIds).toEqual(['progC']);
  });

  it('marks failed transactions', () => {
    const r = summarizeTx({ ...base, meta: { err: { InstructionError: [0, 'Custom'] }, fee: 5000 } }, 42)!;
    expect(r.success).toBe(false);
  });

  it('returns null without signature', () => {
    expect(summarizeTx({ transaction: { signatures: [], message: {} }, meta: {} }, 1)).toBeNull();
  });

  it('dedupes program ids across instructions', () => {
    const tx = {
      ...base,
      transaction: {
        ...base.transaction,
        message: {
          accountKeys: ['accA', 'progC'],
          instructions: [{ programIdIndex: 1 }, { programIdIndex: 1 }],
        },
      },
    };
    expect(summarizeTx(tx, 1)!.programIds).toEqual(['progC']);
  });
});
