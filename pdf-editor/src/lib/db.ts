// Tiny IndexedDB key/value store: everything the app saves stays on the device.
const DB_NAME = 'inkdesk';
const STORES = ['handwriting', 'snippets', 'receipts', 'logos', 'settings'] as const;
export type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const db = {
  get: <T>(store: StoreName, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key)),
  put: (store: StoreName, key: string, value: unknown) => tx(store, 'readwrite', (s) => s.put(value, key)),
  del: (store: StoreName, key: string) => tx(store, 'readwrite', (s) => s.delete(key)),
  async all<T>(store: StoreName): Promise<T[]> {
    try {
      return await tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
    } catch {
      return [];
    }
  },
};
