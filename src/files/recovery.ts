export interface RecoveryRecord {
  readonly source: string;
  readonly baseline: string;
  readonly filename: string;
  readonly baselineFilename?: string;
  readonly originalBytes: Uint8Array;
  readonly updatedAt: number;
}

const DATABASE = "svg-workbench";
const STORE = "recovery";
const KEY = "active";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Recovery database failed"));
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = operation(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Recovery operation failed"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Recovery transaction failed"));
  });
}

export function loadRecovery(): Promise<RecoveryRecord | undefined> {
  return transact("readonly", (store) => store.get(KEY));
}

export function saveRecovery(record: RecoveryRecord): Promise<IDBValidKey> {
  return transact("readwrite", (store) => store.put(record, KEY));
}

export function clearRecovery(): Promise<undefined> {
  return transact("readwrite", (store) => store.delete(KEY));
}
