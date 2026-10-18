import test from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage, matchCategory, readJournal, saveJournal, reconcileWrite, isDefiniteRejection } from './inventoryWrites.js';

test('ISBN category is a string for exact, partial and suggested categories', () => {
  for (const raw of ['history', 'Philippine History', 'New genre', '']) {
    const result = matchCategory(raw, ['History']);
    assert.equal(typeof result.matched, 'string');
    assert.doesNotThrow(() => result.matched.slice(0, 80));
  }
  assert.deepEqual(matchCategory('history', ['History']), { matched: 'History', isNew: false });
});

test('validation arrays and object errors are safe text', () => {
  assert.equal(errorMessage({ response: { data: { detail: [{ msg: 'Bad title' }, { msg: 'Bad year' }] } } }), 'Bad title; Bad year');
  assert.equal(errorMessage({ response: { data: { detail: { message: 'Try again' } } } }), 'Try again');
  assert.equal(typeof errorMessage({ response: { data: { detail: {} } } }), 'string');
  assert.equal(isDefiniteRejection({ response: { status: 500 } }), false);
  assert.equal(isDefiniteRejection({ response: { status: 422 } }), true);
});

test('recovery journals isolate accounts and retain successful and unknown rows across reload', () => {
  const data = new Map([['userId', '1']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const rows = [{ isbn: '1234567890', imported: true, bookId: 7 }, { isbn: '1234567891', requestId: 'same-retry-key' }];
  saveJournal('rows', rows, storage);
  assert.deepEqual(readJournal(storage).rows, rows);
  data.set('userId', '2'); assert.deepEqual(readJournal(storage), {});
  data.set('userId', '1'); assert.deepEqual(readJournal(storage).rows, rows);
  storage.setItem = () => { throw new Error('Storage full'); };
  assert.throws(() => saveJournal('manual', { id: 'unsent' }, storage), /Storage full/);
});

test('lost response is reconciled without a second create; unknown lookup never sends', async () => {
  let writes = 0;
  const send = async () => { writes++; };
  const recovered = await reconcileWrite('same-id', async id => ({ data: { result: { id, title: 'Saved' } } }), send);
  assert.equal(recovered.data.title, 'Saved'); assert.equal(writes, 0);
  await assert.rejects(reconcileWrite('same-id', async () => { throw new Error('Offline'); }, send), /Offline/);
  assert.equal(writes, 0);
});

test('only a confirmed missing receipt permits a retry with the original request ID', async () => {
  const response = await reconcileWrite('original-id', async () => { throw { response: { status: 404 } }; },
    async id => ({ data: { id } }));
  assert.equal(response.data.id, 'original-id');
});
