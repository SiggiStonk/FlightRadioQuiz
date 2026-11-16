"""Extract numbered multiple-choice PDFs. Only Python stdlib + Poppler required."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import shutil
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def extract_columns(path, config):
    """Use label-column coordinates so prose such as 'A message' stays prose."""
    result = subprocess.run(['pdftotext', '-raw', '-bbox', '-f', str(config.get('first_page', 7)), '-enc', 'UTF-8', str(path), '-'], capture_output=True, text=True, check=True)
    document = ET.fromstring(result.stdout)
    lines, parts = [], []
    for page in document.iter('{http://www.w3.org/1999/xhtml}page'):
        for word in page:
            text = word.text or ''
            x, y = float(word.attrib['xMin']), float(word.attrib['yMin'])
            if not config.get('content_top', 75) <= y <= config.get('content_bottom', 790):
                continue
            if x < config.get('label_right', 75):
                if not re.fullmatch(r'\d{1,4}|[A-D]', text):
                    raise ValueError(f'{path.name}: unexpected label-column text: {text}')
                if parts:
                    lines.append(' '.join(parts))
                parts = [f'QUESTION {text}' if text.isdigit() else f'ANSWER {text}']
            elif parts:
                parts.append(text)
    if parts:
        lines.append(' '.join(parts))
    normalized_config = {**config, 'question_pattern': r'^QUESTION (?P<number>\d+)\s*(?P<text>.*)$', 'answer_pattern': r'^ANSWER (?P<label>[A-D])\s*(?P<text>.*)$'}
    return parse_questions('\n'.join(lines), normalized_config, path.stem)


def parse_questions(text, config, source_id):
    question_re = re.compile(config["question_pattern"], re.IGNORECASE)
    answer_re = re.compile(config["answer_pattern"])
    ignored = [re.compile(p) for p in config.get("ignore_patterns", [])]
    expected = config.get("expected_answers", 4)
    if config.get("correct_answer") != "first":
        raise ValueError("The source must explicitly configure correct_answer: first")
    questions, numbers = [], set()
    current, answers, labels = None, [], []

    def finish():
        if current is None:
            return
        number, question_lines = current
        question_text = " ".join(question_lines).strip()
        answer_texts = [" ".join(lines).strip() for lines in answers]
        if not question_text or len(answers) != expected or not all(answer_texts):
            raise ValueError(f"{source_id}: question {number}: expected text and {expected} complete answers, found {len(answers)}")
        if len(set(answer_texts)) != len(answer_texts):
            raise ValueError(f"{source_id}: question {number}: duplicate answer text; review extraction")
        if number in numbers:
            raise ValueError(f"{source_id}: duplicate question number {number}; check PDF sections")
        numbers.add(number)
        fingerprint = hashlib.sha256(json.dumps([question_text, answer_texts], ensure_ascii=False).encode()).hexdigest()[:16]
        questions.append({"id": f"{source_id}:{number}:{fingerprint}", "number": number, "text": question_text, "answers": answer_texts, "correctIndex": 0})

    for raw in text.replace("\f", "\n").splitlines():
        line = raw.strip()
        if not line or any(p.search(line) for p in ignored):
            continue
        q, a = question_re.match(line), answer_re.match(line)
        # Numeric content (e.g. "250 GRAD") also resembles a bare question label.
        # These official catalogs number questions consecutively, starting at 1.
        if q and config.get('sequential_numbers') and int(q.group('number')) != len(questions) + (2 if current else 1):
            q = None
        # A standalone label can precede prose beginning with "A ...".
        if a and answers and not any(part.strip() for part in answers[-1]):
            a = None
        if q and a:
            raise ValueError(f"Ambiguous question and answer patterns: {line}")
        if q:
            finish()
            current = (q.group("number"), [(q.group("text") or '').strip()])
            answers, labels = [], []
        elif a and current is not None:
            label = a.group("label").upper()
            position = len(labels)
            expected_label = str(position + 1) if label.isdigit() else chr(ord('A') + position)
            if label != expected_label:
                raise ValueError(f"{source_id}: question {current[0]}: expected answer {expected_label}, got {label}")
            labels.append(label)
            answers.append([(a.group("text") or '').strip()])
        elif current is not None:
            (answers[-1] if answers else current[1]).append(line)
    finish()
    if not questions:
        raise ValueError(f"{source_id}: no questions found. Check the patterns or OCR scanned PDFs.")
    return questions


def attach_images(questions, path, config, asset_dir):
    mapping = config.get('question_images', {})
    if not mapping:
        return
    by_number = {q['number']: q for q in questions}
    with tempfile.TemporaryDirectory() as folder:
        extracted_pages = set()
        for number, image in mapping.items():
            if number not in by_number:
                raise ValueError(f'{path.name}: image configured for missing question {number}')
            page = int(image['page'])
            prefix = Path(folder) / f'page-{page}'
            if page not in extracted_pages:
                subprocess.run(['pdfimages', '-f', str(page), '-l', str(page), '-png', str(path), str(prefix)], capture_output=True, check=True)
                extracted_pages.add(page)
            source = Path(f"{prefix}-{int(image['image_index']):03d}.png")
            content = source.read_bytes()
            fingerprint = hashlib.sha256(content).hexdigest()[:16]
            name = f'{config["id"]}-{number}-{fingerprint}.png'
            by_number[number]['image'] = {'src': f'./data/images/{name}', 'alt': image['alt']}
            by_number[number]['id'] += f':{fingerprint}'
            if asset_dir is not None:
                asset_dir.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, asset_dir / name)


def build_pools(input_dir, config_path, asset_dir=None):
    config = json.loads(config_path.read_text(encoding="utf-8"))
    all_pdfs = {p.resolve() for p in input_dir.rglob('*') if p.is_file() and p.suffix.lower() == '.pdf'}
    if not all_pdfs:
        return None
    assigned, pools, pool_ids = set(), [], set()
    for entry in config["pools"]:
        pool_id = entry["id"]
        if not re.fullmatch(r"[a-z0-9-]+", pool_id) or pool_id in pool_ids:
            raise ValueError(f"Invalid or duplicate pool id: {pool_id}")
        pool_ids.add(pool_id)
        files = sorted({p.resolve() for pattern in entry["files"] for p in input_dir.glob(pattern, case_sensitive=False) if p.is_file()})
        questions = []
        source_ids = set()
        for path in files:
            if path not in all_pdfs:
                raise ValueError(f"Only PDFs inside the input directory are supported: {path}")
            if path in assigned:
                raise ValueError(f"PDF matched more than one pool: {path.name}")
            assigned.add(path)
            source_id = path.stem
            if source_id in source_ids:
                raise ValueError(f"Duplicate PDF filename in {pool_id}: {path.name}")
            source_ids.add(source_id)
            mode = entry.get('text_mode', 'raw')
            if mode not in ('raw', 'layout', 'catalog-columns'):
                raise ValueError(f"Invalid text_mode: {mode}")
            if mode == 'catalog-columns':
                extracted = extract_columns(path, entry)
            else:
                result = subprocess.run(["pdftotext", f"-{mode}", "-enc", "UTF-8", str(path), "-"], capture_output=True, text=True, check=True)
                extracted = parse_questions(result.stdout, entry, source_id)
            attach_images(extracted, path, entry, asset_dir)
            questions.extend(extracted)
            print(f"{pool_id}: {path.name}: {len(extracted)} questions")
        if questions:
            if entry.get("expected_questions") is not None and len(questions) != entry["expected_questions"]:
                raise ValueError(f"{pool_id}: expected {entry['expected_questions']} questions, got {len(questions)}")
            pools.append({"id": pool_id, "name": entry["name"], "description": entry["description"], "validFrom": entry.get("valid_from"), "questions": questions})
    if all_pdfs - assigned:
        raise ValueError("PDFs not assigned to a pool: " + ", ".join(str(p.relative_to(input_dir.resolve())) for p in sorted(all_pdfs - assigned)))
    if not pools:
        raise ValueError("No pools extracted")
    return {"demo": False, "pools": pools}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "input")
    parser.add_argument("--config", type=Path, default=ROOT / "input/pools.json")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = build_pools(args.input, args.config, args.output.parent / 'images')
    if data is None:
        data = json.loads((ROOT / "public/data/pools.json").read_text(encoding="utf-8"))
        print("No PDFs yet; using labeled demo questions.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
