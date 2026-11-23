// A worker thread of the rivers of the glacial cycles (rivers.ts recentRivers): given today's routed ground in shared
// memory, it makes the keyframes of each run of times it is handed, just as the build's own thread would.
import { parentPort, workerData } from 'node:worker_threads';
import { groundOfShared, recentKeyframes, type RecentRun, type SharedGround } from './rivers.ts';

const ground = groundOfShared((workerData as { data: SharedGround }).data);
parentPort!.on('message', ({ id, run }: { id: number; run: RecentRun }) => {
  parentPort!.postMessage({ id, keyframes: recentKeyframes(ground, run) });
});
