import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from import_pdf import parse_questions, build_pools

CONFIG = json.loads((Path(__file__).resolve().parents[1] / 'input/pools.json').read_text())["pools"][0]
CONFIG = {**CONFIG, 'expected_questions': None, 'sequential_numbers': False, 'text_mode': 'raw', 'question_images': {}}
TEXT = """A sample header
1. First question
continued onto another line?
A) The correct answer
wrapped onto another line.
B) Another answer
C) Third answer
D) Fourth answer
2) Second question?
a. First choice
b. Second choice
c. Third choice
d. Fourth choice
"""


def write_pdf(path, lines):
    """Small real text PDF fixture, without test-only dependencies."""
    commands = ['BT /F1 11 Tf 40 780 Td 14 TL']
    for line in lines:
        safe = line.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
        commands.append(f'({safe}) Tj T*')
    commands.append('ET')
    stream = '\n'.join(commands).encode('ascii')
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>', b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', f'<< /Length {len(stream)} >>\nstream\n'.encode() + stream + b'\nendstream']
    data = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f'{i} 0 obj\n'.encode() + obj + b'\nendobj\n')
    xref = len(data)
    data.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode())
    for offset in offsets[1:]:
        data.extend(f'{offset:010} 00000 n \n'.encode())
    data.extend(f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
    path.write_bytes(data)


class ParserTests(unittest.TestCase):
    def test_wrapped_text_and_first_answer(self):
        questions = parse_questions(TEXT, CONFIG, 'test')
        self.assertEqual(len(questions), 2)
        self.assertEqual(questions[0]['text'], 'First question continued onto another line?')
        self.assertEqual(questions[0]['answers'][0], 'The correct answer wrapped onto another line.')
        self.assertTrue(all(q['correctIndex'] == 0 for q in questions))

    def test_ids_stable_unless_content_changes(self):
        a = parse_questions(TEXT, CONFIG, 'test')
        b = parse_questions(TEXT.replace('First question', 'Changed question'), CONFIG, 'test')
        self.assertNotEqual(a[0]['id'], b[0]['id'])
        self.assertEqual(a[1]['id'], b[1]['id'])

    def test_reject_incomplete_or_duplicate_questions(self):
        for text in [TEXT.replace('D) Fourth answer', ''), TEXT.replace('2) Second', '1) Second'), 'Scanned PDF, no extracted text', TEXT.replace('C) Third', 'B) Third')]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_questions(text, CONFIG, 'test')

    def test_ignore_page_headers(self):
        config = {**CONFIG, 'ignore_patterns': ['^Page \\d+$']}
        q = parse_questions(TEXT.replace('B) Another', 'Page 42\nB) Another'), config, 'test')
        self.assertNotIn('Page 42', q[0]['answers'][0])

    @unittest.skipUnless(shutil.which('pdftotext'), 'Poppler is not installed')
    def test_real_pdf_extraction_and_pool_validation(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            config_path = root / 'pools.json'
            config_path.write_text(json.dumps({'pools': [CONFIG]}))
            self.assertIsNone(build_pools(root, config_path))
            write_pdf(root / 'bzf-sample.pdf', TEXT.splitlines())
            result = build_pools(root, config_path)
            self.assertFalse(result['demo'])
            self.assertEqual(len(result['pools'][0]['questions']), 2)
            bad_count = {**CONFIG, 'expected_questions': 3}
            config_path.write_text(json.dumps({'pools': [bad_count]}))
            with self.assertRaisesRegex(ValueError, 'expected 3 questions'):
                build_pools(root, config_path)
            config_path.write_text(json.dumps({'pools': [CONFIG]}))
            write_pdf(root / 'unassigned.pdf', TEXT.splitlines())
            with self.assertRaisesRegex(ValueError, 'not assigned'):
                build_pools(root, config_path)

    @unittest.skipUnless(shutil.which('pdftotext'), 'Poppler is not installed')
    def test_provided_official_catalogs(self):
        root = Path(__file__).resolve().parents[1]
        if not (root / 'input/2024Pruefungsfragen_BZFII_BZFI_pdf.pdf').exists() or not (root / 'input/2024Pruefungsfragen_AZF_pdf.pdf').exists():
            self.skipTest('Official catalogs not present')
        data = build_pools(root / 'input', root / 'input/pools.json')
        pools = {pool['id']: pool for pool in data['pools']}
        for pool_id, count in [('bzf', 261), ('azf', 289)]:
            questions = pools[pool_id]['questions']
            self.assertEqual([int(q['number']) for q in questions], list(range(1, count + 1)))
            self.assertEqual(len({q['id'] for q in questions}), count)
            for question in questions:
                self.assertEqual(len(question['answers']), 4)
                self.assertEqual(question['correctIndex'], 0)
                for text in [question['text'], *question['answers']]:
                    self.assertTrue(text.strip())
                    for noise in ['richtige Antwort immer', 'correct answer always', 'Stand:', 'Seite / page', 'Prüfungsfragen im Prüfungsteil']:
                        self.assertNotIn(noise, text)
        bzf = pools['bzf']['questions']
        azf = pools['azf']['questions']
        self.assertEqual(bzf[0]['answers'][0], 'ITU')
        self.assertEqual(bzf[3]['answers'][1], 'Der Flugschüler an Bord eines Ausbildungsluftfahrzeuges in der Platzrunde eines unkontrollierten Flugplatzes')
        self.assertIn('250 GRAD', bzf[109]['text'])
        self.assertTrue(azf[31]['text'].startswith('A message concerning an aircraft'))
        self.assertEqual(azf[31]['answers'][0], 'Distress Message')
        self.assertTrue(azf[0]['answers'][0].startswith('The time at which it is estimated'))
        self.assertIn('image', bzf[116])
        self.assertIn('image', bzf[117])
        self.assertNotEqual(bzf[116]['image']['src'], bzf[117]['image']['src'])


if __name__ == '__main__':
    unittest.main()
