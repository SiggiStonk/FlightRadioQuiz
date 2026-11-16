import { STORAGE_KEY, recordFor, updateRecord, summarize, matchesFilter, shuffle, parseProgress } from './core.js';
import { setupExams } from './exam-ui.js';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let pools = [], pool, progress = {}, current = null, options = [], answered = false, view = 'practice';
let session = { answered: 0, correct: 0 }, storageWarning = '', examWarning = '', demoNotice = '', lastSaved = null;
function notice() { $('notice').textContent = [demoNotice, storageWarning, examWarning].filter(Boolean).join(' '); $('notice').hidden = !$('notice').textContent; }
const examUI = setupExams({ getPool: () => pool, onWarning: message => { examWarning = message; notice(); } });
try { lastSaved = localStorage.getItem(STORAGE_KEY); progress = parseProgress(lastSaved); }
catch { storageWarning = 'Saved progress is unavailable or damaged. Practice still works for this tab; existing browser data will not be overwritten.'; }
function persist() {
  if (storageWarning) return;
  try {
    // Avoid overwriting progress made in a second tab with this tab’s stale state.
    if (localStorage.getItem(STORAGE_KEY) !== lastSaved) {
      storageWarning = 'Progress changed in another tab. Reload this tab before continuing to save statistics.'; notice(); return;
    }
    lastSaved = JSON.stringify(progress); localStorage.setItem(STORAGE_KEY, lastSaved);
  } catch { storageWarning = 'Browser storage is unavailable or full. Statistics will only last for this tab.'; notice(); }
}
function track(event, correct = false) { progress = updateRecord(progress, pool.id, current.id, event, correct); persist(); renderMetrics(); }
function renderPools() {
  $('pool-picker').innerHTML = pools.map(p => `<button class="pool-button ${p === pool ? 'active' : ''}" data-pool="${escape(p.id)}" aria-pressed="${p === pool}"><span class="pool-icon">${p.id === 'bzf' ? '◈' : '⌁'}</span><span><strong>${escape(p.name)}</strong><small>${escape(p.description)}</small></span><span class="pool-count"><i class="selection-circle"></i><span>${p.questions.length} questions${p.validFrom ? ` (valid from ${escape(new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(p.validFrom)))})` : ''}</span></span></button>`).join('');
}
function renderMetrics() {
  const s = summarize(progress, pool);
  $('metrics').innerHTML = `<div class="metric"><div class="metric-title">Pool completion <span>◔</span></div><div class="metric-value">${s.completion}<small>%</small></div><div class="progress-track" role="progressbar" aria-label="Pool completion" aria-valuenow="${s.completion}" aria-valuemin="0" aria-valuemax="100"><div style="width:${s.completion}%"></div></div><div class="metric-foot">${s.completed} of ${pool.questions.length} questions answered</div></div><div class="metric"><div class="metric-title">Answer accuracy <span>◎</span></div><div class="metric-value">${s.accuracy === null ? '—' : `${s.accuracy}<small>%</small>`}</div><div class="metric-foot">${s.correct} correct of ${s.answered} attempts</div></div><div class="metric"><div class="metric-title">Questions seen <span>▤</span></div><div class="metric-value">${pool.questions.filter(q => recordFor(progress, pool.id, q.id).seen > 0).length}<small> / ${pool.questions.length}</small></div><div class="metric-foot">${s.seen} total question views</div></div><div class="metric"><div class="metric-title">Practice attempts <span>↗</span></div><div class="metric-value">${s.answered}</div><div class="metric-foot">Every answer is a step forward</div></div>`;
  $('session-answered').textContent = session.answered; $('session-correct').textContent = session.correct;
}
function chooseQuestion() {
  const candidates = pool.questions.filter(q => matchesFilter(recordFor(progress, pool.id, q.id), $('practice-filter').value));
  const alternatives = candidates.filter(q => q.id !== current?.id);
  current = shuffle(alternatives.length ? alternatives : candidates)[0] || null;
  answered = false;
  if (current) { options = shuffle(current.answers.map((text, i) => ({ text, correct: i === current.correctIndex }))); track('seen'); }
  renderQuiz();
}
function renderQuiz() {
  $('pool-label').textContent = `${pool.name} PRACTICE`;
  if (!current) {
    $('quiz-body').innerHTML = '<div class="empty-state"><div class="eyebrow">ALL CLEAR</div><h2>You’re up to date.</h2><p>No questions match this practice filter. Choose all questions to keep training.</p><button class="primary-button" id="practice-all">Practice all questions →</button></div>'; return;
  }
  const r = recordFor(progress, pool.id, current.id);
  $('quiz-body').innerHTML = `<div class="question-meta"><span class="question-badge">QUESTION ${escape(current.number || current.id)}</span><span>Seen ${r.seen} ${r.seen === 1 ? 'time' : 'times'} · ${r.correct} correct</span></div><h2 class="question-text">${escape(current.text)}</h2>${current.image ? `<img class="question-image" src="${escape(current.image.src)}" alt="${escape(current.image.alt)}">` : ''}<div class="answers">${options.map((o, i) => `<button class="answer" data-answer="${i}"><span class="answer-letter">${String.fromCharCode(65 + i)}</span><span>${escape(o.text)}</span><span class="answer-result" aria-hidden="true"></span></button>`).join('')}</div><div class="quiz-bottom"><div id="feedback" class="quiz-hint" role="status">Choose the best answer.<br>Answers are shuffled each time.</div><button class="primary-button" id="next-question">Skip question →</button></div>`;
}
function answerQuestion(index) {
  if (!current || answered || !options[index]) return;
  answered = true; const correct = options[index].correct;
  session.answered++; if (correct) session.correct++;
  track('answer', correct);
  document.querySelectorAll('[data-answer]').forEach((button, i) => {
    button.disabled = true;
    if (options[i].correct) { button.classList.add('correct'); button.querySelector('.answer-result').textContent = '✓'; button.setAttribute('aria-label', `${options[i].text}. Correct answer`); }
    else if (i === index) { button.classList.add('wrong'); button.querySelector('.answer-result').textContent = '×'; button.setAttribute('aria-label', `${options[i].text}. Your answer, incorrect`); }
  });
  $('feedback').classList.toggle('incorrect', !correct);
  $('feedback').replaceChildren();
  const title = document.createElement('strong'); title.textContent = correct ? 'Correct. Nicely done.' : 'Keep practicing. You’ll get there.';
  $('feedback').append(title, document.createTextNode(correct ? 'One step closer to your certificate.' : `Correct answer: ${options.find(o => o.correct).text}`));
  $('next-question').textContent = 'Next question →';
}
function renderStats() {
  const query = $('search').value.toLocaleLowerCase();
  const questions = pool.questions.filter(q => `${q.number || q.id} ${q.text}`.toLocaleLowerCase().includes(query) && matchesFilter(recordFor(progress, pool.id, q.id), $('stats-filter').value));
  $('stats-body').innerHTML = questions.length ? questions.map(q => {
    const r = recordFor(progress, pool.id, q.id);
    return `<tr><td><small>QUESTION ${escape(q.number || q.id)}</small>${escape(q.text)}</td><td>${r.seen}</td><td>${r.answered}</td><td>${r.correct}</td><td>${r.answered ? Math.round(r.correct / r.answered * 100) + '%' : '—'}</td></tr>`;
  }).join('') : '<tr><td colspan="5">No questions match your filters.</td></tr>';
}
function switchView(next) {
  view = next;
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('practice-view').hidden = view !== 'practice'; $('statistics-view').hidden = view !== 'statistics';
  $('exam-view').hidden = view !== 'exam'; $('metrics').hidden = view === 'exam';
  $('breadcrumb').textContent = view === 'practice' ? 'Practice' : view === 'exam' ? 'Exam' : 'Statistics';
  $('page-title').textContent = view === 'practice' ? 'Ready for your next clearance?' : view === 'exam' ? 'Put your knowledge to the test.' : 'Your progress, on the radar.';
  $('page-description').textContent = view === 'practice' ? 'Make every session a step closer to your radio certificate.' : view === 'exam' ? 'A timed exam. A clear goal. Your next step toward confidence.' : 'See what’s sticking, and where a little more practice will help.';
  if (view === 'statistics') renderStats();
  examUI.render();
}
function updateTheme() { const dark = document.documentElement.dataset.theme === 'dark'; $('theme-label').textContent = dark ? 'Light mode' : 'Dark mode'; $('theme-toggle').setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`); document.querySelector('meta[name="theme-color"]').content = dark ? '#0c1424' : '#f5f7fb'; }
$('theme-toggle').addEventListener('click', () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('frq-theme', document.documentElement.dataset.theme); } catch {} updateTheme(); });
updateTheme();
$('legal-open').addEventListener('click', () => $('legal-dialog').showModal());
$('legal-dialog').addEventListener('close', () => $('legal-open').focus({ preventScroll: true }));
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || !pool) return;
  if (button.dataset.view) switchView(button.dataset.view);
  if (button.dataset.pool && button.dataset.pool !== pool.id) { pool = pools.find(p => p.id === button.dataset.pool); current = null; renderPools(); if (view === 'practice') chooseQuestion(); else { renderMetrics(); renderStats(); current = null; } examUI.render(); }
  if (button.dataset.answer !== undefined) answerQuestion(Number(button.dataset.answer));
  if (button.id === 'next-question') chooseQuestion();
  if (button.id === 'practice-all') { $('practice-filter').value = 'all'; chooseQuestion(); }
  if (button.dataset.view === 'practice' && !current) chooseQuestion();
});
$('practice-filter').addEventListener('change', chooseQuestion);
$('search').addEventListener('input', renderStats); $('stats-filter').addEventListener('change', renderStats);
$('reset').addEventListener('click', () => { $('reset-description').textContent = `Permanently remove all ${pool.name} practice statistics and saved exams from this browser? Your other pools and any running exam will keep their progress.`; $('reset-dialog').showModal(); });
$('reset-dialog').addEventListener('close', () => { if ($('reset-dialog').returnValue !== 'reset') return; delete progress[pool.id]; persist(); examUI.resetPool(pool.id); current = null; session = { answered: 0, correct: 0 }; renderMetrics(); renderStats(); });
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { storageWarning = 'Progress changed in another tab. Reload this tab before continuing to save statistics.'; notice(); } });
try {
  const response = await fetch('./data/pools.json'); if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json(); pools = data.pools;
  if (!Array.isArray(pools) || !pools.length || pools.some(p => !p.questions?.length)) throw new Error('No question pools available');
  pool = pools[0];
  demoNotice = data.demo ? 'DEMO MODE · These sample questions demonstrate the app. Official exam questions will appear after your PDFs are imported.' : '';
  notice(); renderPools(); chooseQuestion(); examUI.render();
} catch (error) { $('quiz-body').innerHTML = '<div class="empty-state"><h2>Unable to load question pools</h2><p>Try reloading the page. For local development, run npm run dev instead of opening the HTML file directly.</p></div>'; console.error(error); }
