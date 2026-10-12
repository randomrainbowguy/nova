// In-memory IndexedDB for games running with no origin (Nova opened from a downloaded file), where the
// browser blocks the real one. Built into standalone/fake-idb.js; the hub injects it only when needed.
import { indexedDB, IDBKeyRange, IDBRequest, IDBOpenDBRequest, IDBDatabase, IDBTransaction, IDBObjectStore,
  IDBIndex, IDBCursor, IDBCursorWithValue, IDBKeyRange as KR, IDBVersionChangeEvent, IDBFactory } from "fake-indexeddb";
const define = (name, value) => { try { Object.defineProperty(window, name, { configurable: true, writable: true, value }); } catch (e) {} };
define("indexedDB", indexedDB);
Object.entries({ IDBKeyRange, IDBRequest, IDBOpenDBRequest, IDBDatabase, IDBTransaction, IDBObjectStore, IDBIndex,
  IDBCursor, IDBCursorWithValue, IDBVersionChangeEvent, IDBFactory }).forEach(([k, v]) => define(k, v));
