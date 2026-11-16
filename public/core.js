export const STORAGE_KEY = 'flight-radio-progress-v1';
export function emptyRecord() { return { seen: 0, answered: 0, correct: 0 }; }
export function recordFor(progress, poolId, questionId) {
  return progress[poolId]?.[questionId] || emptyRecord();
}
export function updateRecord(progress, poolId, questionId, event, correct = false) {
  const old = recordFor(progress, poolId, questionId);
  const next = { ...old };
  if (event === 'seen') next.seen++;
  if (event === 'answer') { next.answered++; if (correct) next.correct++; }
  return { ...progress, [poolId]: { ...progress[poolId], [questionId]: next } };
}
export function summarize(progress, pool) {
  let seen = 0, answered = 0, correct = 0, completed = 0;
  for (const q of pool.questions) {
    const r = recordFor(progress, pool.id, q.id);
    seen += r.seen; answered += r.answered; correct += r.correct;
    if (r.answered > 0) completed++;
  }
  return { seen, answered, correct, completed, completion: pool.questions.length ? Math.floor(completed / pool.questions.length * 100) : 0, accuracy: answered ? Math.round(correct / answered * 100) : null };
}
export function matchesFilter(record, filter) {
  return filter === 'unanswered' ? record.answered === 0 : filter === 'review' ? record.answered > record.correct : true;
}
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function parseProgress(raw) {
  const value = JSON.parse(raw || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid progress');
  const clean = Object.create(null);
  for (const [poolId, questions] of Object.entries(value)) {
    if (!questions || typeof questions !== 'object' || Array.isArray(questions)) throw new Error('Invalid pool progress');
    clean[poolId] = Object.create(null);
    for (const [id, record] of Object.entries(questions)) {
      if (!record || !['seen', 'answered', 'correct'].every(k => Number.isSafeInteger(record[k]) && record[k] >= 0) || record.correct > record.answered || record.answered > record.seen) throw new Error('Invalid question progress');
      clean[poolId][id] = { seen: record.seen, answered: record.answered, correct: record.correct };
    }
  }
  return clean;
}
