// The fetcher's downloads, with a stub in place of the network: what is asked for again and after
// how long, what is kept, and what a download given up says. Nothing here leaves the machine.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { download, fetchAll, type Net } from '../src/fetch.ts';

const FILE = 'https://data.example.org/tiles/n45e000.tif';
const dir = mkdtempSync(join(tmpdir(), 'fetch-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A network that gives these answers in turn, and keeps what it was asked and how long it was told to wait. */
function network(...answers: (Response | Error)[]) {
  const asked: string[] = [];
  const pauses: number[] = [];
  const net: Net = {
    fetch: async (url) => {
      asked.push(String(url));
      const answer = answers.shift();
      if (!answer) throw new Error('asked more often than the test has answers');
      if (answer instanceof Error) throw answer;
      return answer;
    },
    pause: async (ms) => void pauses.push(ms),
  };
  return { net, asked, pauses };
}

// Failures as Node's fetch gives them: `fetch failed` before an answer and `terminated` in the
// middle of one, each with why in its cause.
const below = (message: string, code: string) => Object.assign(new Error(message), { code });
const refused = () => new TypeError('fetch failed', { cause: below('connect ECONNREFUSED 192.0.2.7:443', 'ECONNREFUSED') });
const noTls = () => new TypeError('fetch failed', { cause: below('Client network socket disconnected before secure TLS connection was established', 'ECONNRESET') });

/** An answer that breaks off after its first bytes, as when a host drops the connection. */
function cutShort(): Response {
  let sent = false;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) return controller.error(new TypeError('terminated', { cause: below('other side closed', 'UND_ERR_SOCKET') }));
        sent = true;
        controller.enqueue(new TextEncoder().encode('the first half of a file that is longer than the whole of the next'));
      },
    }),
  );
}

async function failure(run: Promise<void>): Promise<string> {
  return run.then(
    () => 'no failure',
    (err: Error) => err.message,
  );
}

describe('a download', () => {
  it('that fails is made again after a pause, and keeps only what the try that worked brought', async () => {
    const { net, asked, pauses } = network(noTls(), cutShort(), new Response('the whole file'));
    const dest = join(dir, 'again', 'n45e000.tif');
    // What a try that broke off left on the disk, longer than the file: none of it may be kept.
    mkdirSync(join(dir, 'again'));
    writeFileSync(`${dest}.part`, 'the first half of a file that broke off, left from a run before');
    const log: string[] = [];
    await download('src:tile', FILE, dest, (s) => log.push(s), net);
    expect(readFileSync(dest, 'utf8')).toBe('the whole file');
    expect(readdirSync(join(dir, 'again'))).toEqual(['n45e000.tif']);
    expect(asked).toEqual([FILE, FILE, FILE]);
    expect(pauses).toEqual([2000, 10000]);
    expect(log).toEqual([
      'src:tile: try 1 at data.example.org failed, trying again in 2 s: fetch failed: Client network socket disconnected before secure TLS connection was established (ECONNRESET)',
      'src:tile: try 2 at data.example.org failed, trying again in 10 s: terminated: other side closed (UND_ERR_SOCKET)',
    ]);
  });

  it('is given up after four tries, says which dataset, which host and why, and leaves no part of a file', async () => {
    const { net, asked, pauses } = network(cutShort(), cutShort(), cutShort(), refused());
    const dest = join(dir, 'given-up', 'n45e000.tif');
    expect(await failure(download('src:tile', FILE, dest, () => {}, net))).toBe(
      'src:tile: not downloaded from data.example.org in 4 tries: fetch failed: connect ECONNREFUSED 192.0.2.7:443',
    );
    expect(asked).toHaveLength(4);
    expect(pauses).toEqual([2000, 10000, 30000]);
    expect(readdirSync(join(dir, 'given-up'))).toEqual([]);
  });

  it('says each address that was tried, where a host has several', async () => {
    const both = Object.assign(new AggregateError([below('connect ETIMEDOUT 192.0.2.7:443', 'ETIMEDOUT'), below('connect ENETUNREACH 2001:db8::7:443', 'ENETUNREACH')], ''), { code: 'ETIMEDOUT' });
    const failed = () => new TypeError('fetch failed', { cause: both });
    const { net } = network(failed(), failed(), failed(), failed());
    expect(await failure(download('src:tile', FILE, join(dir, 'several', 'n45e000.tif'), () => {}, net))).toBe(
      'src:tile: not downloaded from data.example.org in 4 tries: fetch failed: AggregateError (ETIMEDOUT): connect ETIMEDOUT 192.0.2.7:443; connect ENETUNREACH 2001:db8::7:443',
    );
  });

  it('asks again of a host that is busy or broken', async () => {
    const { net, pauses } = network(new Response('busy', { status: 503 }), new Response('slow down', { status: 429 }), new Response('the whole file'));
    const dest = join(dir, 'busy', 'n45e000.tif');
    const log: string[] = [];
    await download('src:tile', FILE, dest, (s) => log.push(s), net);
    expect(readFileSync(dest, 'utf8')).toBe('the whole file');
    expect(pauses).toEqual([2000, 10000]);
    expect(log[0]).toBe('src:tile: try 1 at data.example.org failed, trying again in 2 s: HTTP 503');
  });

  it('does not ask again of a host that says the file is not there, or not to be had', async () => {
    for (const status of [404, 403, 410]) {
      const { net, asked, pauses } = network(new Response('no', { status }), new Response('the whole file'));
      const dest = join(dir, `no-${status}`, 'n45e000.tif');
      expect(await failure(download('src:tile', FILE, dest, () => {}, net))).toBe(`src:tile: not downloaded from data.example.org: HTTP ${status}`);
      expect(asked).toHaveLength(1);
      expect(pauses).toEqual([]);
      expect(existsSync(dest)).toBe(false);
    }
  });

  it('does not ask a host again for what this machine could not write', async () => {
    const { net, asked, pauses } = network(new Response('the whole file'), new Response('the whole file'));
    const dest = join(dir, 'no-room', 'n45e000.tif');
    // A directory where the file is to be written stands in for a disk that cannot take it.
    mkdirSync(`${dest}.part`, { recursive: true });
    expect(await failure(download('src:tile', FILE, dest, () => {}, net))).toMatch(/^src:tile: not downloaded from data\.example\.org: EISDIR: illegal operation on a directory, open /);
    expect(asked).toHaveLength(1);
    expect(pauses).toEqual([]);
    expect(existsSync(dest)).toBe(false);
  });
});

describe('a dataset already in the cache with its checksum', () => {
  // What lets CI start a changed manifest from an older set of datasets and fetch only the rest.
  it('is not downloaded again', async () => {
    const net: Net = {
      fetch: async () => {
        throw new Error('the plate model is not in .cache: run `npm run fetch -- src:paleomap-plate-model` first');
      },
      pause: async () => {},
    };
    const log: string[] = [];
    await fetchAll((s) => log.push(s), ['src:paleomap-plate-model'], net);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(/^src:paleomap-plate-model: ok \([0-9a-f]{12}\)$/);
  });
});
