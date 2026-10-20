import { AsyncLocalStorage } from 'node:async_hooks';

// Each HTTP request chooses an immutable DB; never issue SELECT on a shared socket.
export const databaseContext = new AsyncLocalStorage<number>();
