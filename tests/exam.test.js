import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_RULES, createExam, remainingMs, scoreExam, selectExamAnswer, finishExam, parseExamStore } from '../public/exam.js';

function pool(id) {
  return { id, name: id.toUpperCase(), questions: Array.from({ length: 300 }, (_, i) => ({ id: `q-${i}`, number: String(i + 1), text: `Question ${i + 1}`, answers: ['Right', 'Wrong', 'Other', 'Last'], correctIndex: 0 })) };
}
function exam(id = 'azf') { return createExam(pool(id), 1000, () => 0, 'test-exam'); }

test('exam rules select the exact number of unique questions and fixed shuffled choices', () => {
  for (const id of ['azf', 'bzf']) {
    const source = pool(id), result = createExam(source, 1000, () => 0, id);
    assert.equal(result.questions.length, EXAM_RULES[id].count);
    assert.equal(new Set(result.questions.map(q => q.id)).size, EXAM_RULES[id].count);
    assert.equal(result.deadline - result.startedAt, EXAM_RULES[id].minutes * 60_000);
    assert.notEqual(result.questions[0].correctIndex, 0);
    assert.ok(result.questions.every(q => q.answers[q.correctIndex] === 'Right'));
    result.questions[0].answers[0] = 'Changed snapshot';
    assert.deepEqual(source.questions[1].answers, ['Right', 'Wrong', 'Other', 'Last']);
  }
  assert.throws(() => createExam({ ...pool('azf'), questions: [] }), /enough questions/);
});

test('75 percent is the exact pass boundary; unanswered questions count as incorrect', () => {
  for (const [id, required] of [['azf', 30], ['bzf', 75]]) {
    const e = exam(id);
    e.questions.slice(0, required - 1).forEach(q => { q.selectedIndex = q.correctIndex; });
    assert.equal(scoreExam(e).passed, false);
    e.questions[required - 1].selectedIndex = e.questions[required - 1].correctIndex;
    assert.equal(scoreExam(e).passed, true);
    assert.equal(scoreExam(e).percentage, 75);
    assert.equal(scoreExam(e).unanswered, e.questions.length - required);
  }
});

test('answers can be changed or cleared until the exact deadline', () => {
  const e = exam();
  const selected = selectExamAnswer(e, e.questions[0].correctIndex, 1001);
  assert.equal(scoreExam(e).answered, 0);
  assert.equal(scoreExam(selected).correct, 1);
  const changed = selectExamAnswer(selected, 0, 1002);
  assert.equal(scoreExam(changed).correct, 0);
  assert.equal(scoreExam(selectExamAnswer(changed, null, 1003)).answered, 0);
  assert.throws(() => selectExamAnswer(e, 4, 1001), /Invalid answer/);
  assert.throws(() => selectExamAnswer(e, 0, e.deadline), /expired/);
});

test('the persisted deadline survives reload and background time', () => {
  const e = exam();
  const reloaded = parseExamStore(JSON.stringify({ active: e, history: [] }));
  assert.equal(remainingMs(reloaded.active, e.deadline - 1000), 1000);
  assert.equal(remainingMs(reloaded.active, e.deadline + 60_000), 0);
});

test('expiry archives an exam once and rejects answers after timeout', () => {
  const e = exam();
  const result = finishExam({ active: e, history: [] }, e.deadline + 10000);
  assert.equal(result.active, null);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].reason, 'timeout');
  assert.equal(result.history[0].finishedAt, e.deadline);
  assert.equal(scoreExam(result.history[0]).correct, 0);
  assert.equal(finishExam(result, e.deadline + 20000), result);
});

test('submitted history retains all questions, choices, answers, and images independently of source pools', () => {
  const p = pool('bzf');
  p.questions[1].image = { src: 'data:image/png;base64,AAAA', alt: 'A diagram' };
  const e = createExam(p, 1000, () => 0, 'snapshot');
  const store = finishExam({ active: selectExamAnswer(e, 2, 2000), history: [] }, 3000);
  const saved = parseExamStore(JSON.stringify(store)).history[0];
  assert.equal(saved.reason, 'submitted');
  assert.equal(saved.questions.length, 100);
  assert.equal(saved.questions[0].selectedIndex, 2);
  assert.equal(saved.questions[0].image.alt, 'A diagram');
  assert.equal(saved.questions[0].answers[saved.questions[0].correctIndex], 'Right');
});

test('corrupt exam history is rejected without touching practice data', () => {
  assert.deepEqual(parseExamStore(null), { active: null, history: [] });
  for (const value of ['null', '{}', '{bad', JSON.stringify({ active: { ...exam(), deadline: 0 }, history: [] })]) assert.throws(() => parseExamStore(value));
  const e = exam(); e.questions[0].selectedIndex = 12;
  assert.throws(() => parseExamStore(JSON.stringify({ active: e, history: [] })));
});
