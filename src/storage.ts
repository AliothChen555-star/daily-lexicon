import Dexie, { type Table } from 'dexie';
import type { AppState } from './engine';

class LexiconDB extends Dexie {
  state!: Table<{ key: string; value: AppState }, string>;
  recovery!: Table<{ id: string; value: AppState }, string>;
  constructor() { super('daily-lexicon-v1'); this.version(1).stores({ state: 'key', recovery: 'id' }); }
}
const db = new LexiconDB();
export async function loadState() { return (await db.state.get('main'))?.value; }
export async function persistState(value: AppState) { await db.state.put({ key: 'main', value }); }
export async function preserveRecovery(value: AppState) {
  await db.recovery.put({ id: new Date().toISOString(), value });
  const all = await db.recovery.orderBy('id').keys();
  if (all.length > 5) await db.recovery.bulkDelete(all.slice(0,-5) as string[]);
}
export async function latestRecovery() { return (await db.recovery.orderBy('id').last())?.value; }
