# Flight Radio Quiz

A responsive BZF / AZF study app for GitHub Pages. Light and dark themes with blue accents, shuffled answer choices, immediate feedback, and resettable statistics stored in your browser. No backend, accounts, npm dependencies, or API keys.

## Run locally

Requires Node.js 22+ and Python 3.12+. PDF extraction also requires Poppler's `pdftotext` (`sudo apt install poppler-utils` on Ubuntu or `sudo pacman -S poppler` on Arch).

```sh
npm test
npm run build
python3 -m http.server 4173 --directory dist
```

Open `http://localhost:4173`. Alternatively, `npm run dev` builds the app with the current PDFs and starts the server in one command. After changing files, restart that command or run `npm run build` and reload the page.

## Add question PDFs

1. Put PDFs into `input/bzf/` or `input/azf/`. Root-level filenames containing `bzf` / `azf` work too.
2. Run `npm run build` and inspect the generated `dist/data/pools.json` against the PDF. The **first answer is correct**; the app shuffles the choices each time.
3. Adjust the extraction patterns in `input/pools.json` to fit the actual documents, and set `expected_questions` after verifying their total question count. See [input instructions](input/README.md).
4. Commit and push. GitHub Actions tests, extracts, builds, and deploys the site automatically.

The supplied May 2024 Bundesnetzagentur catalogs import **261 BZF** questions in German and **289 AZF** questions in English. The configured extractor uses PDF word coordinates and the separate label column to preserve wrapped text, distinguish English prose starting with “A” from answer labels, and omit headers/footers. The chart symbols for BZF questions 117 and 118 are extracted as PNGs with Poppler's `pdfimages` and displayed with the questions. Tests check consecutive numbers, totals, four answers per question, images, and representative tricky text blocks. If all PDFs are removed, the build falls back to clearly labeled demo pools. Question/answer language is preserved. Scanned documents require OCR.

## GitHub Pages setup

In this repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions**. Push these files to `main` or run **Build and deploy quiz** from the Actions tab. The deployment job reports the live URL (normally `https://siggistonk.github.io/FlightRadioQuiz/`). The workflow also runs build/tests on pull requests without deploying them.

The artifact contains only the web app and extracted JSON; original PDFs stay out of it. All asset URLs are relative, so repository subpaths work. The setup follows [GitHub's custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Statistics

### Timed exams

Select **Exam** and choose a pool. AZF exams draw 40 unique random questions with a 30-minute deadline; BZF exams draw 100 with a 60-minute deadline. The pass mark is exactly 75%: **30/40 for AZF** or **75/100 for BZF**. Choices are shuffled once per exam. You can jump between questions, change or clear answers, and submit early after confirmation. Unanswered questions count as incorrect. Correct answers are revealed only after submission.

The active exam, answers, and absolute deadline are saved after each change. The timer continues across navigation and reloads, and expired exams submit automatically (or immediately on reopening a closed tab). Exams are saved separately from practice statistics. Under **Statistics → Saved exams**, select an attempt and expand its questions to review all choices, your answers, and correct answers. Each exam keeps its own question/answer snapshots and embedded diagrams, so later PDF changes do not change the review. Pool reset removes that pool’s practice statistics and completed exams; a running exam remains intact.

Exam history uses browser storage on this device. Storage failures show a warning; keep the tab open if persistence is unavailable.

### Practice statistics

- **Seen:** increases when a question is presented, even if you skip it.
- **Answered / correct:** increase once per submitted answer; answer buttons lock after selection.
- **Completion:** percentage of pool questions answered at least once, regardless of correctness.
- **Accuracy:** correct answers divided by all submitted answers.
- **Needs practice:** questions with at least one incorrect attempt.
- The logbook lists each question’s views, attempts, correct answers, and accuracy. Search and filter it, or reset only the selected pool after confirming.

Statistics persist in `localStorage` on this browser, device, and site origin. Clearing browser data removes them; private browsing may discard them. No cross-device sync. The app warns if storage fails or another tab changes the statistics; reload before continuing in that tab. The theme preference is remembered separately. Demo and imported question IDs are distinct. Question IDs incorporate source filename and content so revised questions do not inherit unrelated results.

Tests cover statistics, answer shuffling, corrupt saved data, parser failures, stable question IDs, and extraction from an actual generated PDF.
