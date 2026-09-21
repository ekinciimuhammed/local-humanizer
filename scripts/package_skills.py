"""Build the downloadable offline writing-skill pack (Python standard library only)."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
output = root / 'public' / 'humanizer-skills.zip'
files = sorted((root / 'skills').rglob('*')) + [root / 'THIRD_PARTY_NOTICES.md']
with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
    for path in files:
        if path.is_file():
            archive.write(path, 'humanizer-skills/' + str(path.relative_to(root)))
print(f'Created {output.name} ({output.stat().st_size:,} bytes)')
