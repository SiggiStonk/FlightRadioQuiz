"""Build the static site; source PDFs stay out of the published artifact."""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'dist'
if OUTPUT.exists():
    shutil.rmtree(OUTPUT)
shutil.copytree(ROOT / 'public', OUTPUT)
subprocess.run([sys.executable, str(ROOT / 'scripts/import_pdf.py'), '--output', str(OUTPUT / 'data/pools.json')], check=True)
(OUTPUT / '.nojekyll').touch()
print('Built dist/ for GitHub Pages.')
