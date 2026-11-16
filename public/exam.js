import { shuffle } from './core.js';

export const EXAM_STORAGE_KEY = 'flight-radio-exams-v1';
export const EXAM_RULES = Object.freeze({
  azf: { count: 40, minutes: 30 },
  bzf: { count: 100, minutes: 60 },
});

export function createExam(pool, now = Date.now(), random = Math.random, id = crypto.randomUUID()) {
  const rules = EXAM_RULES[pool.id];
  if (!rules || pool.questions.length < rules.count) throw new Error('This pool does not have enough questions for an exam.');
  const questions = shuffle(pool.questions, random).slice(0, rules.count).map(q => {
    const choices = shuffle(q.answers.map((text, i) => ({ text, correct: i === q.correctIndex })), random);
    return {
      id: q.id, number: q.number || q.id, text: q.text,
      answers: choices.map(a => a.text), correctIndex: choices.findIndex(a => a.correct),
      selectedIndex: null, ...(q.image ? { image: { ...q.image } } : {}),
    };
  });
  return { id, poolId: pool.id, poolName: pool.name, startedAt: now, deadline: now + rules.minutes * 60_000, position: 0, questions };
}

export function remainingMs(exam, now = Date.now()) { return Math.max(0, exam.deadline - now); }
export function scoreExam(exam) {
  const total = exam.questions.length;
  const answered = exam.questions.filter(q => q.selectedIndex !== null).length;
  const correct = exam.questions.filter(q => q.selectedIndex === q.correctIndex).length;
  return { total, answered, correct, unanswered: total - answered, percentage: correct / total * 100, required: Math.ceil(total * .75), passed: correct * 4 >= total * 3 };
}

export function selectExamAnswer(exam, index, now = Date.now()) {
  if (remainingMs(exam, now) === 0) throw new Error('Exam time has expired.');
  const question = exam.questions[exam.position];
  if (index !== null && (!Number.isInteger(index) || index < 0 || index >= question.answers.length)) throw new Error('Invalid answer');
  return { ...exam, questions: exam.questions.map((q, i) => i === exam.position ? { ...q, selectedIndex: index } : q) };
}

export function finishExam(store, now = Date.now()) {
  if (!store.active) return store;
  const exam = store.active;
  const result = { ...exam, finishedAt: Math.min(now, exam.deadline), reason: remainingMs(exam, now) === 0 ? 'timeout' : 'submitted' };
  return { active: null, history: [result, ...store.history.filter(e => e.id !== exam.id)] };
}

export function parseExamStore(raw) {
  if (!raw) return { active: null, history: [] };
  const value = JSON.parse(raw);
  if (!value || !Array.isArray(value.history) || !('active' in value)) throw new Error('Invalid exam storage');
  function validate(exam, finished) {
    const rules = EXAM_RULES[exam?.poolId];
    if (!rules || typeof exam.id !== 'string' || !exam.id || typeof exam.poolName !== 'string' ||
      !Number.isSafeInteger(exam.startedAt) || exam.startedAt < 0 || exam.deadline !== exam.startedAt + rules.minutes * 60_000 ||
      !Array.isArray(exam.questions) || exam.questions.length !== rules.count ||
      !Number.isInteger(exam.position) || exam.position < 0 || exam.position >= rules.count) throw new Error('Invalid exam');
    const ids = new Set();
    for (const q of exam.questions) {
      if (typeof q.id !== 'string' || ids.has(q.id) || typeof q.text !== 'string' || typeof q.number !== 'string' ||
        !Array.isArray(q.answers) || q.answers.length < 2 || !q.answers.every(a => typeof a === 'string') ||
        !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.answers.length ||
        (q.selectedIndex !== null && (!Number.isInteger(q.selectedIndex) || q.selectedIndex < 0 || q.selectedIndex >= q.answers.length)) ||
        (q.image && (typeof q.image.src !== 'string' || typeof q.image.alt !== 'string'))) throw new Error('Invalid exam question');
      ids.add(q.id);
    }
    if (finished && (!['submitted', 'timeout'].includes(exam.reason) || !Number.isSafeInteger(exam.finishedAt) || exam.finishedAt < exam.startedAt || exam.finishedAt > exam.deadline)) throw new Error('Invalid exam result');
    return exam;
  }
  if (value.active !== null) validate(value.active, false);
  const ids = new Set(value.active ? [value.active.id] : []);
  for (const exam of value.history) {
    validate(exam, true);
    if (ids.has(exam.id)) throw new Error('Duplicate exam');
    ids.add(exam.id);
  }
  return value;
}
