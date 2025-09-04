import Dexie from 'dexie';

export const db = new Dexie('GeniusKeeperDB');
db.version(1).stores({
  pending_reports: '++id, posId, createdAt',
});