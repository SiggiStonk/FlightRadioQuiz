import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateRecord, recordFor, summarize, shuffle, matchesFilter, parseProgress } from '../public/core.js';

const pool = { id: 'bzf', questions: [{ id: '1' }, { id: '2' }, { id: '3' }] };
test('viewing or skipping a question does not count it as completed', () => {
  const p = updateRecord({}, 'bzf', '1', 'seen');
  assert.deepEqual(recordFor(p, 'bzf', '1'), { seen: 1, answered: 0, correct: 0 });
  assert.equal(summarize(p, pool).completion, 0);
  assert.equal(summarize(p, pool).accuracy, null);
});
test('repeated attempts count independently; completion counts distinct questions', () => {
  let p = {};
  for (const correct of [false, true, true]) {
    p = updateRecord(p, 'bzf', '1', 'seen');
    p = updateRecord(p, 'bzf', '1', 'answer', correct);
  }
  assert.deepEqual(summarize(p, pool), { seen: 3, answered: 3, correct: 2, completed: 1, completion: 33, accuracy: 67 });
  assert.deepEqual(recordFor(p, 'azf', '1'), { seen: 0, answered: 0, correct: 0 });
});
test('resetting one pool preserves the other pool', () => {
  let p = updateRecord({}, 'bzf', '1', 'seen');
  p = updateRecord(p, 'azf', '1', 'seen');
  delete p.bzf;
  assert.equal(recordFor(p, 'bzf', '1').seen, 0);
  assert.equal(recordFor(p, 'azf', '1').seen, 1);
});
test('question filters distinguish untouched and incorrect questions', () => {
  assert.equal(matchesFilter({ answered: 0, correct: 0 }, 'unanswered'), true);
  assert.equal(matchesFilter({ answered: 1, correct: 0 }, 'review'), true);
  assert.equal(matchesFilter({ answered: 1, correct: 1 }, 'review'), false);
});
test('shuffle moves choices without losing the correct-answer marker or mutating its input', () => {
  const original = [{ text: 'first', correct: true }, { text: 'second', correct: false }, { text: 'third', correct: false }];
  const result = shuffle(original, () => 0);
  assert.notDeepEqual(result, original);
  assert.equal(result.find(o => o.correct).text, 'first');
  assert.equal(original[0].text, 'first');
  assert.equal(result.length, original.length);
});
test('saved statistics survive JSON round trips; corrupt data is rejected', () => {
  const p = updateRecord({}, 'bzf', '1', 'seen');
  assert.equal(recordFor(parseProgress(JSON.stringify(p)), 'bzf', '1').seen, 1);
  for (const raw of ['null', '[]', '{broken', '{"bzf":{"1":{"seen":1,"answered":2,"correct":3}}}', '{"bzf":{"1":{"seen":-1,"answered":0,"correct":0}}}']) {
    assert.throws(() => parseProgress(raw));
  }
});
test('obsolete questions do not inflate the current pool statistics', () => {
  const p = updateRecord({}, 'bzf', 'removed-question', 'seen');
  assert.equal(summarize(p, pool).seen, 0);
  assert.equal(summarize(p, { id: 'empty', questions: [] }).completion, 0);
});
test('completion reaches 100 percent only after every question is answered', () => {
  const largePool = { id: 'bzf', questions: Array.from({ length: 261 }, (_, i) => ({ id: String(i) })) };
  let progress = {};
  for (let i = 0; i < 260; i++) {
    progress = updateRecord(progress, 'bzf', String(i), 'seen');
    progress = updateRecord(progress, 'bzf', String(i), 'answer', true);
  }
  assert.equal(summarize(progress, largePool).completion, 99);
  progress = updateRecord(progress, 'bzf', '260', 'seen');
  progress = updateRecord(progress, 'bzf', '260', 'answer', false);
  assert.equal(summarize(progress, largePool).completion, 100);
});
