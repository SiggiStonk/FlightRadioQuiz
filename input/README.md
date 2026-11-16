# PDF input

Place BZF PDFs in `input/bzf/` and AZF PDFs in `input/azf/`.
Alternatively, place PDFs whose names contain `bzf` or `azf` directly in this folder.
Commit the files to trigger the GitHub Pages build. PDFs are not copied into the website artifact.

The first answer in each source question is treated as correct. The browser shuffles the answers.
The supplied May 2024 catalogs are configured and tested: **261 BZF** and **289 AZF** questions. `text_mode: catalog-columns` uses Poppler’s raw reading order with word bounding boxes. It reads from page 7, identifies question numbers and A–D labels in the left column, and omits headers/footers using per-pool coordinate bounds. This preserves multiline questions and answers, including English sentences starting with “A”. Recheck page/column bounds and question totals when replacing PDFs with another layout or edition. Image-only PDFs require OCR first.

`pools.json` configures filename globs, extraction modes, answer counts, expected total question counts, and sequential numbering. `catalog-columns` uses `first_page`, `content_top`, `content_bottom`, and `label_right` measured in PDF points. For other documents, `raw` and `layout` modes use configurable regex patterns and lines to ignore. Patterns need named `number` / `text` groups for questions and `label` / `text` groups for answers. Use distinct patterns for numeric answer labels so they cannot also match question numbers.

`valid_from` stores the catalog’s “Gültig ab” date in ISO format (`YYYY-MM-DD`), displayed beside the pool’s question count. Update it from the PDF cover when replacing a catalog with a new edition.

`question_images` maps a question number to a PDF page, a zero-based `image_index` on that page (including logos), and descriptive alt text. BZF 117 and 118 are configured for the two symbols on page 25. `pdfimages -png` extracts their original pixels, and the build copies only those images into `data/images/`. Check these mappings when updating the source PDF. Image content participates in question IDs, so a changed diagram starts fresh statistics.

Run `python3 scripts/import_pdf.py --output /tmp/pools.json` to test extraction. Install Poppler (`pdftotext`) first. Review the generated question text and confirm the total count, then set `expected_questions` to that count to detect future omissions. All PDFs must match exactly one pool. Malformed questions, duplicate numbers within a PDF, unexpected labels, missing answers, and unmatched PDFs fail the build rather than silently publishing a partial import. No answer correctness is inferred from formatting.

Until any PDFs exist, the build uses clearly marked demo pools. Once PDFs exist, only extracted pools are published, with no demo questions mixed in. Statistics use a content fingerprint and source filename, so changed questions start with fresh statistics; keep PDF filenames stable when updating unchanged questions.
