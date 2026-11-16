import { EXAM_RULES, EXAM_STORAGE_KEY, createExam, remainingMs, scoreExam, selectExamAnswer, finishExam, parseExamStore } from './exam.js';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const time = ms => { const seconds = Math.ceil(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
const date = ms => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const image = q => q.image ? `<img class="question-image" src="${escape(q.image.src)}" alt="${escape(q.image.alt)}">` : '';

export function setupExams({ getPool, onWarning }) {
  let store = { active: null, history: [] }, saved = null, writable = true, reviewId = null, starting = false;
  function warning(message) { writable = false; onWarning(message); }
  try { saved = localStorage.getItem(EXAM_STORAGE_KEY); store = parseExamStore(saved); }
  catch { warning('Saved exams are unavailable or damaged. New exams will only be kept in this tab; existing data will not be overwritten.'); }

  function sync() {
    if (!writable) return;
    try {
      const raw = localStorage.getItem(EXAM_STORAGE_KEY);
      if (raw !== saved) { store = parseExamStore(raw); saved = raw; }
    } catch { warning('Exam storage is unavailable. Keep this tab open to retain your exam.'); }
  }
  function save() {
    if (!writable) return;
    try { const raw = JSON.stringify(store); localStorage.setItem(EXAM_STORAGE_KEY, raw); saved = raw; }
    catch { warning('Exam storage is unavailable or full. This exam is kept in this tab only.'); }
  }
  function expire() {
    if (!store.active || remainingMs(store.active) > 0) return false;
    reviewId = store.active.id; store = finishExam(store); save();
    if ($('exam-submit-dialog').open) $('exam-submit-dialog').close('expired');
    render(); return true;
  }
  function resultSummary(exam) {
    const s = scoreExam(exam);
    return `<div class="exam-result ${s.passed ? 'passed' : 'failed'}"><div><div class="eyebrow">${escape(exam.poolName)} · ${exam.reason === 'timeout' ? 'TIME EXPIRED' : 'EXAM COMPLETED'}</div><h2>${s.passed ? 'Passed. Well done!' : 'Not passed. Keep practicing.'}</h2><p>${s.correct} / ${s.total} correct (${Number(s.percentage.toFixed(1))}%) · ${s.unanswered} unanswered · ${s.required} correct required</p><small>${date(exam.finishedAt)} · Time used ${time(exam.finishedAt - exam.startedAt)}</small></div><strong>${s.passed ? 'PASS' : 'FAIL'}</strong></div>`;
  }
  function render() {
    const pool = getPool(); if (!pool) return;
    const exam = store.active;
    if (exam) {
      const q = exam.questions[exam.position], s = scoreExam(exam);
      $('exam-view').innerHTML = `<div class="section-heading"><h2>${escape(exam.poolName)} exam</h2><span id="exam-clock" class="exam-clock" role="timer" aria-label="Time remaining">${time(remainingMs(exam))}</span></div><p class="stats-note">${s.answered} of ${s.total} answered · Answers can be changed until submission. Results are shown at the end.</p><section class="quiz-card"><div class="exam-question"><div class="question-meta"><span class="question-badge">QUESTION ${exam.position + 1} OF ${s.total}</span><span>Source question ${escape(q.number)}</span></div><h2 class="question-text">${escape(q.text)}</h2>${image(q)}<div class="answers">${q.answers.map((answer, i) => `<button class="answer ${q.selectedIndex === i ? 'selected' : ''}" data-exam-answer="${i}" aria-pressed="${q.selectedIndex === i}"><span class="answer-letter">${String.fromCharCode(65 + i)}</span><span>${escape(answer)}</span></button>`).join('')}</div><div class="exam-actions"><button class="secondary-button" data-exam-position="${exam.position - 1}" ${exam.position === 0 ? 'disabled' : ''}>← Previous</button><button class="text-button" id="exam-clear" ${q.selectedIndex === null ? 'disabled' : ''}>Clear answer</button><button class="primary-button" ${exam.position === s.total - 1 ? 'id="exam-submit"' : `data-exam-position="${exam.position + 1}"`}>${exam.position === s.total - 1 ? 'Finish exam' : 'Next →'}</button></div></div></section><div class="section-heading exam-map-heading"><h2>Question overview</h2><button class="text-button" id="exam-finish">Finish exam</button></div><div class="exam-map" aria-label="Go to exam question">${exam.questions.map((item, i) => `<button class="${item.selectedIndex !== null ? 'done' : ''} ${i === exam.position ? 'current' : ''}" data-exam-position="${i}" aria-label="Question ${i + 1}, ${item.selectedIndex !== null ? 'answered' : 'unanswered'}" ${i === exam.position ? 'aria-current="step"' : ''}>${i + 1}</button>`).join('')}</div><p class="stats-note">The timer continues if you switch pages or close the tab. Your exam resumes after a reload and submits automatically when time expires.</p>`;
    } else {
      const rules = EXAM_RULES[pool.id], enough = rules && pool.questions.length >= rules.count;
      const result = store.history.find(e => e.id === reviewId);
      $('exam-view').innerHTML = `${result ? resultSummary(result) + '<button class="text-button" id="exam-show-result">Review all questions in statistics →</button>' : ''}<section class="exam-lobby quiz-card"><div class="eyebrow">YOUR CHECK RIDE</div><h2>${escape(pool.name)} exam mode</h2>${rules ? `<div class="exam-rules"><div><strong>${rules.count}</strong><span>random questions</span></div><div><strong>${rules.minutes} min</strong><span>time limit</span></div><div><strong>75%</strong><span>pass mark · ${Math.ceil(rules.count * .75)} correct</span></div></div>` : ''}<p>Questions and choices are shuffled. Answer in any order and change your answers until you finish. Unanswered questions count as incorrect. No correct answers are revealed during the exam.</p><p>The finished exam is saved on this device with every question, all choices, your answer, and the correct answer.</p><button class="primary-button" id="exam-start" ${!enough || starting ? 'disabled' : ''}>${starting ? 'Preparing exam…' : `Start ${escape(pool.name)} exam →`}</button>${!enough ? '<p class="stats-note">This pool needs more questions before a full exam can start.</p>' : ''}</section>`;
    }
    renderHistory();
  }
  function renderHistory() {
    const pool = getPool(); if (!pool) return;
    const exams = store.history.filter(e => e.poolId === pool.id);
    const review = exams.find(e => e.id === reviewId);
    $('exam-history').innerHTML = `<div class="section-heading"><h2>Saved exams</h2><span>${exams.length} ${escape(pool.name)} EXAMS</span></div>${exams.length ? `<div class="exam-history-list">${exams.map(exam => { const s = scoreExam(exam); return `<button class="exam-history-item" data-exam-review="${escape(exam.id)}" aria-expanded="${exam.id === reviewId}"><span><strong>${date(exam.finishedAt)}</strong><small>${escape(exam.poolName)} · ${s.correct} / ${s.total} correct · ${Number(s.percentage.toFixed(1))}% · ${exam.reason === 'timeout' ? 'Time expired' : 'Submitted'}</small></span><span class="result-badge ${s.passed ? 'passed' : 'failed'}">${s.passed ? 'PASS' : 'FAIL'} ↗</span></button>`; }).join('')}</div>` : '<p class="stats-note">Finished exams will appear here, ready to review.</p>'}${review ? `<div class="exam-review">${resultSummary(review)}<div class="section-heading"><h2>Question and answer review</h2><button class="text-button" id="exam-close-review">Close review</button></div>${review.questions.map((q, i) => `<details class="review-question"><summary><span class="result-badge ${q.selectedIndex === q.correctIndex ? 'passed' : 'failed'}">${q.selectedIndex === q.correctIndex ? '✓' : '×'}</span><span>${i + 1}. ${escape(q.text)}<small>Source question ${escape(q.number)} · ${q.selectedIndex === null ? 'Not answered' : q.selectedIndex === q.correctIndex ? 'Correct' : 'Incorrect'}</small></span></summary><div class="review-content">${image(q)}<p><strong>Your answer:</strong> ${q.selectedIndex === null ? 'Not answered' : escape(q.answers[q.selectedIndex])}</p><div class="answers">${q.answers.map((answer, index) => `<div class="answer ${index === q.correctIndex ? 'correct' : index === q.selectedIndex ? 'wrong' : ''}"><span class="answer-letter">${String.fromCharCode(65 + index)}</span><span>${escape(answer)}${index === q.correctIndex ? '<small>Correct answer</small>' : ''}${index === q.selectedIndex ? '<small>Your answer</small>' : ''}</span></div>`).join('')}</div></div></details>`).join('')}</div>` : ''}`;
  }
  async function start() {
    if (starting) return;
    starting = true; render();
    try {
      const exam = createExam(getPool());
      // Keep diagrams inside the saved exam, even if a later PDF changes its assets.
      await Promise.all(exam.questions.filter(q => q.image).map(async q => {
        const response = await fetch(q.image.src); if (!response.ok) throw new Error('Cannot load exam diagram');
        const blob = await response.blob();
        q.image.src = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
      }));
      sync();
      if (!store.active) { const now = Date.now(); exam.deadline += now - exam.startedAt; exam.startedAt = now; store.active = exam; reviewId = null; save(); }
    } catch (error) { onWarning(`The exam could not start: ${error.message}. Please reload and try again.`); }
    finally { starting = false; render(); }
  }
  function submitPrompt() {
    const s = scoreExam(store.active);
    $('exam-submit-description').textContent = `${s.answered} of ${s.total} questions answered. ${s.unanswered ? `${s.unanswered} unanswered questions will count as incorrect. ` : ''}Submit now to see your result and save this exam?`;
    $('exam-submit-dialog').showModal();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || !getPool()) return;
    if (!button.id.startsWith('exam-') && !Object.keys(button.dataset).some(k => k.startsWith('exam'))) return;
    sync(); if (expire()) return;
    if (button.id === 'exam-start') { start(); return; }
    if (button.dataset.examReview) { reviewId = button.dataset.examReview; renderHistory(); return; }
    if (button.id === 'exam-close-review') { reviewId = null; renderHistory(); return; }
    if (button.id === 'exam-show-result') {
      const result = store.history.find(e => e.id === reviewId);
      if (result) document.querySelector(`[data-pool="${result.poolId}"]`)?.click();
      document.querySelector('[data-view="statistics"]').click(); return;
    }
    if (!store.active) return;
    if (button.dataset.examAnswer !== undefined || button.id === 'exam-clear') {
      try { store.active = selectExamAnswer(store.active, button.id === 'exam-clear' ? null : Number(button.dataset.examAnswer)); }
      catch (error) { if (expire()) return; throw error; }
      save(); render();
    } else if (button.dataset.examPosition !== undefined) {
      const position = Number(button.dataset.examPosition);
      if (Number.isInteger(position) && position >= 0 && position < store.active.questions.length) { store.active = { ...store.active, position }; save(); render(); }
    } else if (button.id === 'exam-submit' || button.id === 'exam-finish') submitPrompt();
  });
  $('exam-submit-dialog').addEventListener('close', () => {
    if ($('exam-submit-dialog').returnValue !== 'submit') return;
    sync(); if (!store.active) { render(); return; }
    reviewId = store.active.id; store = finishExam(store); save(); render();
  });
  setInterval(() => { sync(); if (expire()) return; if (store.active && $('exam-clock')) { $('exam-clock').textContent = time(remainingMs(store.active)); $('exam-clock').classList.toggle('urgent', remainingMs(store.active) <= 300_000); } }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { sync(); if (!expire()) render(); } });
  window.addEventListener('storage', event => { if (event.key === EXAM_STORAGE_KEY) { sync(); if (!expire()) render(); } });
  return {
    render() { sync(); if (!expire()) render(); },
    resetPool(poolId) { sync(); store.history = store.history.filter(e => e.poolId !== poolId); reviewId = null; save(); render(); },
  };
}
