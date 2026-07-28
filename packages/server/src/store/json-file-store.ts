import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import type { Store } from './store.ts';

async function readAll<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// Temp file plus rename, never truncate-in-place - a crash mid-write
// can't corrupt a file that holds every site's token and every
// user's password hash.
async function writeAllAtomic<T>(filePath: string, records: T[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, JSON.stringify(records, null, 2), 'utf-8');
  await rename(tempPath, filePath);
}

export function openJsonFileStore<T extends { id: string }>(filePath: string): Store<T> {
  // A promise-chain mutex so two near-simultaneous writes (e.g.
  // registering two sites back to back) can't race a
  // read-modify-write cycle and silently drop one. Mirrors CLAUDE.md's
  // write-queue principle for the agent, scoped to this one store.
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<R>(job: () => Promise<R>): Promise<R> {
    const run = queue.then(job, job);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    async list() {
      return readAll<T>(filePath);
    },
    async find(id) {
      const records = await readAll<T>(filePath);
      return records.find((record) => record.id === id);
    },
    save(record) {
      return enqueue(async () => {
        const records = await readAll<T>(filePath);
        const index = records.findIndex((existing) => existing.id === record.id);
        if (index === -1) {
          records.push(record);
        } else {
          records[index] = record;
        }
        await writeAllAtomic(filePath, records);
      });
    },
    delete(id) {
      return enqueue(async () => {
        const records = await readAll<T>(filePath);
        const filtered = records.filter((record) => record.id !== id);
        await writeAllAtomic(filePath, filtered);
      });
    },
  };
}
