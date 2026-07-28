import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJsonFileStore } from '../../src/store/json-file-store.ts';

interface TestRecord {
  id: string;
  name: string;
}

describe('json-file-store', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'admin-store-'));
    filePath = join(dir, 'records.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('A3: a trivial record round-trips through save, list, find, and delete', async () => {
    const store = openJsonFileStore<TestRecord>(filePath);

    assert.deepEqual(await store.list(), []);

    await store.save({ id: '1', name: 'first site' });
    assert.deepEqual(await store.find('1'), { id: '1', name: 'first site' });
    assert.deepEqual(await store.list(), [{ id: '1', name: 'first site' }]);

    await store.save({ id: '1', name: 'renamed site' });
    assert.deepEqual(await store.find('1'), { id: '1', name: 'renamed site' });
    assert.equal((await store.list()).length, 1);

    await store.delete('1');
    assert.equal(await store.find('1'), undefined);
    assert.deepEqual(await store.list(), []);
  });

  it('writes atomically - no leftover temp file after a save', async () => {
    const store = openJsonFileStore<TestRecord>(filePath);
    await store.save({ id: '1', name: 'first site' });

    const files = await readdir(dir);
    assert.deepEqual(files, ['records.json']);
  });

  it('serialises concurrent saves so none are lost (write queue)', async () => {
    const store = openJsonFileStore<TestRecord>(filePath);

    await Promise.all([
      store.save({ id: '1', name: 'first' }),
      store.save({ id: '2', name: 'second' }),
      store.save({ id: '3', name: 'third' }),
    ]);

    const records = await store.list();
    assert.equal(records.length, 3);
    assert.deepEqual(
      new Set(records.map((record) => record.id)),
      new Set(['1', '2', '3']),
    );
  });
});
