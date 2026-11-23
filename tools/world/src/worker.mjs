// The way into a worker thread of the build: its TypeScript loads through tsx, as the build's own modules do, and then
// the module the thread was started for runs, with what it was given (`workerData.module`, `workerData.data`).
import { workerData } from 'node:worker_threads';
import { register } from 'tsx/esm/api';

register();
await import(workerData.module);
