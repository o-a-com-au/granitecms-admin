import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openInMemoryStore } from '../../src/store/in-memory-store.ts';

interface TestRecord {
  id: string;
  name: string;
}

describe('in-memory-store', () => {
  it('a trivial record round-trips through save, list, find, and delete', async () => {
    const store = openInMemoryStore<TestRecord>();

    assert.deepEqual(await store.list(), []);

    await store.save({ id: '1', name: 'first' });
    assert.deepEqual(await store.find('1'), { id: '1', name: 'first' });
    assert.deepEqual(await store.list(), [{ id: '1', name: 'first' }]);

    await store.delete('1');
    assert.equal(await store.find('1'), undefined);
    assert.deepEqual(await store.list(), []);
  });

  it('two separately-opened stores do not share state', async () => {
    const storeA = openInMemoryStore<TestRecord>();
    const storeB = openInMemoryStore<TestRecord>();

    await storeA.save({ id: '1', name: 'only in A' });

    assert.equal(await storeB.find('1'), undefined);
  });
});
