"""Fetch explicitly licensed audio; extract only selected regular audio files."""
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile
from io import BytesIO

root = Path(__file__).resolve().parent.parent / 'public' / 'audio'
root.mkdir(parents=True, exist_ok=True)
assets = {
    '8-bit-lofi.mp3': 'https://opengameart.org/sites/default/files/8_bit_lofi_music.mp3',
}
for name, url in assets.items():
    path = root / name
    if not path.exists(): path.write_bytes(urlopen(url).read())
    print(name, path.stat().st_size)
url = 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip'
with ZipFile(BytesIO(urlopen(url).read())) as archive:
    wanted = ['click_001.ogg', 'click_003.ogg', 'confirmation_001.ogg', 'error_001.ogg', 'select_001.ogg', 'switch_001.ogg', 'drop_001.ogg', 'maximize_001.ogg', 'minimize_001.ogg', 'open_001.ogg', 'close_001.ogg', 'tick_001.ogg', 'bong_001.ogg', 'glass_001.ogg']
    names = archive.namelist()
    for name in wanted:
        found = next((n for n in names if n.endswith('/' + name) or n == name), None)
        if found: (root / name).write_bytes(archive.read(found)); print(name)
    licenses = [n for n in names if n.lower().endswith('license.txt')]
    if licenses: (root / 'KENNEY-LICENSE.txt').write_bytes(archive.read(licenses[0]))
url = 'https://opengameart.org/sites/default/files/Pleasant%20Creek%20Pack.zip'
with ZipFile(BytesIO(urlopen(url).read())) as archive:
    names = archive.namelist()
    print('Pleasant Creek available:', names)
    audio = [n for n in names if n.lower().endswith(('.ogg', '.mp3')) and '__MACOSX' not in n]
    # Keep original recording intact. Attribution in CREDITS.md.
    chosen = next((n for n in audio if n.lower().endswith('.ogg')), audio[0])
    (root / ('pleasant-creek' + Path(chosen).suffix.lower())).write_bytes(archive.read(chosen))
    print('Selected:', chosen)
