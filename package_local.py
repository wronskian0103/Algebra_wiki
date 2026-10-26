"""Create a small, portable archive of the finished offline wiki."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import shutil

ROOT = Path(__file__).resolve().parent
shutil.copyfile(ROOT / 'README.txt', ROOT / 'dist/README.txt')
archive = ROOT / 'Algebra-Wiki.zip'
with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=9) as output:
    for file in sorted((ROOT / 'dist').rglob('*')):
        if file.is_file():
            output.write(file, 'Algebra-Wiki/' + file.relative_to(ROOT / 'dist').as_posix())
print(f'{archive.name}: {archive.stat().st_size:,} bytes')
